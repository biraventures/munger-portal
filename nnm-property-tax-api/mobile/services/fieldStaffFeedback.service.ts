import { fieldStaffRepository } from "../repositories/fieldStaff.repository";
import { fieldStaffFeedbackRepository } from "../repositories/fieldStaffFeedback.repository";
import { ATTENDANCE_ROLE_LABELS } from "../types/attendance.types";
import { ApiError } from "../utils/ApiError";
import type { AttendanceTokenPayload } from "../types/attendance.types";

export async function submitStaffFeedback(
  user: AttendanceTokenPayload,
  staffId: number,
  type: "positive" | "negative",
  comment: string | null,
): Promise<void> {
  const staff = await fieldStaffRepository.findById(staffId);
  if (!staff) throw ApiError.notFound("Staff not found.");

  await fieldStaffFeedbackRepository.insert({
    staffId,
    staffName: staff.name,
    wardId: staff.ward_id,
    givenBy: user.displayName,
    givenByRole: ATTENDANCE_ROLE_LABELS[user.role],
    type,
    comment,
  });
}

export interface FeedbackEntry {
  timestamp: string;
  givenBy: string;
  role: string;
  type: "positive" | "negative";
  comment: string | null;
}

export async function getStaffFeedback(staffId: number): Promise<FeedbackEntry[]> {
  const rows = await fieldStaffFeedbackRepository.listForStaff(staffId);
  return rows.map((f) => ({
    timestamp: f.created_at.toISOString(),
    givenBy: f.given_by,
    role: f.given_by_role,
    type: f.type,
    comment: f.comment,
  }));
}
