import { pyauRepository } from "../repositories/pyau.repository";
import { pyauContractorWardRepository } from "../repositories/pyauContractorWard.repository";
import { pyauIssueRepository } from "../repositories/pyauIssue.repository";
import { ApiError } from "../utils/ApiError";
import type { PyauRow, PyauIssueRow } from "../types/pyau.types";
import type { AttendanceTokenPayload } from "../types/attendance.types";

const BUILDER_WARRANTY_YEARS = 2;

/**
 * Whether a pyau is still within its 2-year builder-warranty window -
 * during this period the BUILDER (tracked as plain text on the pyau
 * record, not a login) is responsible for maintenance, not one of the
 * 3 assigned contractors. Nullable installed_date (older/pre-existing
 * pyaus in the initial registry import) is treated as never under
 * warranty, since there's no construction date to measure from.
 */
export function isUnderBuilderWarranty(pyau: PyauRow, asOf: Date = new Date()): boolean {
  if (!pyau.installed_date) return false;
  const installedDate = new Date(pyau.installed_date);
  const warrantyEnd = new Date(installedDate);
  warrantyEnd.setFullYear(warrantyEnd.getFullYear() + BUILDER_WARRANTY_YEARS);
  return asOf < warrantyEnd;
}

/** "Any issue will be marked by JE or AE" - role check is enforced at the route level (requireAttendanceRole), this just does the assignment logic. */
export async function reportPyauIssue(user: AttendanceTokenPayload, input: { pyauId: number; issueNotes: string | null }): Promise<PyauIssueRow> {
  const pyau = await pyauRepository.findById(input.pyauId);
  if (!pyau) throw ApiError.notFound("Pyau not found.");

  const existingOpen = await pyauIssueRepository.findOpenForPyau(input.pyauId);
  if (existingOpen) throw ApiError.badRequest("This pyau already has an open, unresolved issue.");

  let assignedContractorId: number | null = null;
  if (!isUnderBuilderWarranty(pyau)) {
    const mapping = await pyauContractorWardRepository.findByWard(pyau.ward_id);
    assignedContractorId = mapping?.contractor_id ?? null;
  }
  // If under warranty, assignedContractorId stays null - the frontend
  // shows the builder_name/builder_contact from the pyau record
  // instead of a contractor for this issue.

  await pyauRepository.setFunctionalStatus(pyau.id, "non_functional");

  return pyauIssueRepository.create({
    pyauId: pyau.id,
    dateOfIssue: new Date().toISOString().slice(0, 10),
    reportedByUserId: user.sub,
    issueNotes: input.issueNotes,
    assignedContractorId,
  });
}

export async function markPyauIssueRepaired(
  user: AttendanceTokenPayload,
  issueId: number,
  input: { repairBrief: string | null; amountSpent: number | null },
): Promise<PyauIssueRow> {
  const updated = await pyauIssueRepository.markRepaired(issueId, {
    dateOfRepair: new Date().toISOString().slice(0, 10),
    repairBrief: input.repairBrief,
    amountSpent: input.amountSpent,
    repairedByUserId: user.sub,
  });
  if (!updated) {
    const existing = await pyauIssueRepository.findById(issueId);
    if (!existing) throw ApiError.notFound("Issue not found.");
    throw ApiError.badRequest("This issue has already been marked repaired.");
  }
  await pyauRepository.setFunctionalStatus(updated.pyau_id, "functional");
  return updated;
}

/** Hard delete of one pyau, including its issue history - for removing genuinely bad data (e.g. a faulty CSV import), distinct from archiving via setActive. */
export async function deleteOnePyau(pyauId: number): Promise<void> {
  const pyau = await pyauRepository.findById(pyauId);
  if (!pyau) throw ApiError.notFound("Pyau not found.");
  await pyauIssueRepository.deleteForPyau(pyauId);
  await pyauRepository.deleteOne(pyauId);
}

/** Hard delete of every pyau (and their issue history) in one ward - the ward-wise bulk cleanup option. Returns the count removed for a clear confirmation message. */
export async function deletePyausByWard(wardId: number): Promise<number> {
  await pyauIssueRepository.deleteForWard(wardId);
  return pyauRepository.deleteByWard(wardId);
}

/** Hard delete of the ENTIRE pyau registry across every ward - the "whole Nagar Nigam dataset" wipe. Deliberately the most destructive option here; gated to attendance_admin only at the route level. */
export async function deleteAllPyaus(): Promise<number> {
  await pyauIssueRepository.deleteAll();
  return pyauRepository.deleteAllPyaus();
}
