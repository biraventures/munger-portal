import { pool } from "../config/db";
import type { Request, Response } from "express";
import { z } from "zod";
import { requestLightChange, approveLightChangeAtStage, rejectLightChangeAtStage } from "../services/lightChangeRequest.service";
import { lightChangeRequestRepository } from "../repositories/lightChangeRequest.repository";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const requestSchema = z.object({
  actionType: z.enum(["add", "status_change", "deactivate", "reactivate", "delete"]),
  lightId: z.coerce.number().int().positive().nullish(),
  proposedData: z.record(z.unknown()).nullish(),
  reason: z.string().trim().min(1, "A reason is required."),
});

export const postRequestLightChangeHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);
  const request = await requestLightChange(req.attendanceUser!, {
    actionType: parsed.data.actionType,
    lightId: parsed.data.lightId ?? null,
    proposedData: parsed.data.proposedData ?? null,
    reason: parsed.data.reason,
  });
  res.status(200).json({ request });
});

const listQuerySchema = z.object({ status: z.enum(["pending", "approved", "rejected"]).optional() });

const APPROVAL_STAGE_ROLES = ["city_manager", "deputy_municipal_commissioner", "municipal_commissioner"];

export const listLightChangeRequestsHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Invalid query");

  if (parsed.data.status && parsed.data.status !== "pending") {
    const requests = await lightChangeRequestRepository.listAll(parsed.data.status);
    res.status(200).json({ requests: await withLightDetails(requests) });
    return;
  }

  const role = req.attendanceUser!.role;
  const requests = APPROVAL_STAGE_ROLES.includes(role)
    ? await lightChangeRequestRepository.listPending(role as never)
    : await lightChangeRequestRepository.listPending();
  res.status(200).json({ requests: await withLightDetails(requests) });
});

/**
 * Every desk sees the light itself (serial, type, ward, locality, agency, status) and what the request changes - the
 * snapshot from when it was made (migration 151), or the light as it is now - plus the requester's name.
 */
async function withLightDetails<T extends { light_id: number | string | null; proposed_data: unknown; requested_by_user_id: number | string }>(requests: T[]) {
  if (requests.length === 0) return requests;
  const ids = [...new Set(requests.map((r) => r.light_id).filter((x) => x != null).map(Number))];
  const { rows: lights } = await pool.query(
    `SELECT l.id, l.serial_number, l.light_type, l.locality_name, l.switch_status, l.active, l.latitude, l.longitude, w.ward_name, a.agency_name
       FROM lights l LEFT JOIN attendance_wards w ON w.id = l.ward_id LEFT JOIN installation_agencies a ON a.id = l.installation_agency_id
      WHERE l.id = ANY($1::bigint[])`,
    [ids],
  );
  const { rows: wards } = await pool.query<{ id: string; ward_name: string }>(`SELECT id, ward_name FROM attendance_wards`);
  const { rows: agencies } = await pool.query<{ id: string; agency_name: string }>(`SELECT id, agency_name FROM installation_agencies`);
  const { rows: users } = await pool.query<{ id: string; display_name: string }>(`SELECT id, display_name FROM attendance_users WHERE id = ANY($1::bigint[])`, [
    [...new Set(requests.map((r) => Number(r.requested_by_user_id)))],
  ]);
  const byId = new Map(lights.map((l) => [Number(l.id), l]));
  const wardName = new Map(wards.map((w) => [Number(w.id), w.ward_name]));
  const agencyName = new Map(agencies.map((a) => [Number(a.id), a.agency_name]));
  const userName = new Map(users.map((u) => [Number(u.id), u.display_name]));
  return requests.map((r) => {
    const p = (r.proposed_data ?? {}) as Record<string, unknown>;
    return {
      ...r,
      light: r.light_id != null ? byId.get(Number(r.light_id)) ?? null : null,
      requestedByName: userName.get(Number(r.requested_by_user_id)) ?? null,
      proposedView: {
        ...p,
        wardName: p.wardId != null ? wardName.get(Number(p.wardId)) ?? null : null,
        agencyName: p.installationAgencyId != null ? agencyName.get(Number(p.installationAgencyId)) ?? null : null,
      },
    };
  });
}

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
const notesSchema = z.object({ notes: z.string().trim().nullish() });

export const postApproveLightChangeHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = idParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid request id");
  const bodyParsed = notesSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input");
  const request = await approveLightChangeAtStage(req.attendanceUser!, paramsParsed.data.id, bodyParsed.data.notes ?? null);
  res.status(200).json({ request });
});

const rejectSchema = z.object({ notes: z.string().trim().min(1, "A reason is required to reject.") });

export const postRejectLightChangeHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = idParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid request id");
  const bodyParsed = rejectSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);
  const request = await rejectLightChangeAtStage(req.attendanceUser!, paramsParsed.data.id, bodyParsed.data.notes);
  res.status(200).json({ request });
});
