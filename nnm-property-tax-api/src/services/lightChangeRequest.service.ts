import { lightChangeRequestRepository } from "../repositories/lightChangeRequest.repository";
import { lightRepository } from "../repositories/light.repository";
import { ApiError } from "../utils/ApiError";
import { nextLightChangeStage } from "../types/streetlight.types";
import type { LightChangeRequestRow, LightChangeActionType } from "../types/streetlight.types";
import type { AttendanceTokenPayload } from "../types/attendance.types";

/**
 * Adding a light, changing its functionality (switch) status,
 * deactivating/reactivating it, or deleting it - any of these
 * proposed by streetlight_je, streetlight_ae, streetlight_nodal_clerk,
 * or streetlight_contractor, then approved through city_manager,
 * deputy_municipal_commissioner, and municipal_commissioner in order.
 * Nothing changes on the lights table itself until the final approval
 * - see approveLightChangeAtStage below.
 */
export async function requestLightChange(
  user: AttendanceTokenPayload,
  input: { actionType: LightChangeActionType; lightId: number | null; proposedData: Record<string, unknown> | null; reason: string },
): Promise<LightChangeRequestRow> {
  if (!input.reason.trim()) throw ApiError.badRequest("A reason is required.");

  if (input.actionType === "add") {
    if (!input.proposedData) throw ApiError.badRequest("Light details are required to add a light.");
  } else {
    if (!input.lightId) throw ApiError.badRequest("A light must be specified for this action.");
    const light = await lightRepository.findById(input.lightId);
    if (!light || light.deleted_at) throw ApiError.notFound("Light not found.");
    if (input.actionType === "status_change" && !input.proposedData?.switchStatus) {
      throw ApiError.badRequest("A new status is required.");
    }
  }

  return lightChangeRequestRepository.create({
    actionType: input.actionType,
    lightId: input.lightId,
    proposedData: input.proposedData,
    reason: input.reason.trim(),
    requestedByUserId: user.sub,
  });
}

/** Actually applies an approved change to the lights table. Called only once a request has cleared all three stages. */
async function applyLightChange(request: LightChangeRequestRow): Promise<void> {
  switch (request.action_type) {
    case "add": {
      const d = request.proposed_data as Record<string, unknown>;
      await lightRepository.create({
        lightType: (d.lightType as "streetlight" | "high_mast") ?? "streetlight",
        wardId: d.wardId as number,
        localityName: d.localityName as string,
        serialNumber: d.serialNumber as string,
        latitude: (d.latitude as number) ?? null,
        longitude: (d.longitude as number) ?? null,
        installationAgencyId: (d.installationAgencyId as number) ?? null,
      });
      break;
    }
    case "status_change": {
      const d = request.proposed_data as Record<string, unknown>;
      await lightRepository.setSwitchStatus(request.light_id!, d.switchStatus as "working" | "not_working" | "automatic" | "joint");
      break;
    }
    case "deactivate":
      await lightRepository.setActive(request.light_id!, false);
      break;
    case "reactivate":
      await lightRepository.setActive(request.light_id!, true);
      break;
    case "delete":
      await lightRepository.softDelete(request.light_id!);
      break;
  }
}

/**
 * Approves a pending request at the caller's own stage - advances to
 * the next stage, or (at municipal_commissioner, the final stage)
 * finalizes it and applies the change. Every stage's decision is
 * logged to light_change_approvals regardless of whether it advances
 * or finalizes, for the full audit trail.
 */
export async function approveLightChangeAtStage(user: AttendanceTokenPayload, requestId: number, notes: string | null): Promise<LightChangeRequestRow> {
  const request = await lightChangeRequestRepository.findById(requestId);
  if (!request) throw ApiError.notFound("Request not found.");
  if (request.status !== "pending") throw ApiError.badRequest(`This request has already been ${request.status}.`);
  if (user.role !== request.current_stage) {
    throw new ApiError(403, `This request is currently with ${request.current_stage.replace(/_/g, " ")} - it isn't at your stage.`);
  }

  const next = nextLightChangeStage(request.current_stage);
  if (next) {
    const advanced = await lightChangeRequestRepository.advanceStage(requestId, request.current_stage, next);
    if (!advanced) throw ApiError.badRequest("This request moved on before it could be approved - please refresh.");
    await lightChangeRequestRepository.logApproval(requestId, request.current_stage, "approved", user.sub, notes);
    return advanced;
  }

  const finalized = await lightChangeRequestRepository.finalize(requestId, request.current_stage, "approved", user.sub, notes);
  if (!finalized) throw ApiError.badRequest("This request moved on before it could be approved - please refresh.");
  await lightChangeRequestRepository.logApproval(requestId, request.current_stage, "approved", user.sub, notes);
  await applyLightChange(finalized);
  return finalized;
}

export async function rejectLightChangeAtStage(user: AttendanceTokenPayload, requestId: number, notes: string): Promise<LightChangeRequestRow> {
  if (!notes.trim()) throw ApiError.badRequest("A reason is required to reject.");
  const request = await lightChangeRequestRepository.findById(requestId);
  if (!request) throw ApiError.notFound("Request not found.");
  if (request.status !== "pending") throw ApiError.badRequest(`This request has already been ${request.status}.`);
  if (user.role !== request.current_stage) {
    throw new ApiError(403, `This request is currently with ${request.current_stage.replace(/_/g, " ")} - it isn't at your stage.`);
  }

  const finalized = await lightChangeRequestRepository.finalize(requestId, request.current_stage, "rejected", user.sub, notes.trim());
  if (!finalized) throw ApiError.badRequest("This request moved on before it could be rejected - please refresh.");
  await lightChangeRequestRepository.logApproval(requestId, request.current_stage, "rejected", user.sub, notes.trim());
  return finalized;
}
