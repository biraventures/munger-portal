import bcrypt from "bcrypt";
import { attendanceUserRepository } from "../repositories/attendanceUser.repository";
import { attendanceWardRepository } from "../repositories/attendanceWard.repository";
import { WARD_SCOPED_ROLES, CROSS_WARD_ROLES } from "../types/attendance.types";
import { ApiError } from "../utils/ApiError";
import type { AttendanceRole, AttendanceUserRow } from "../types/attendance.types";

export interface CreateAttendanceUserInput {
  username: string;
  password: string;
  displayName: string;
  role: AttendanceRole;
  wardId: number | null;
}

export async function createAttendanceUser(input: CreateAttendanceUserInput): Promise<AttendanceUserRow> {
  if (input.password.length < 8) {
    throw ApiError.badRequest("Password must be at least 8 characters.");
  }
  if (WARD_SCOPED_ROLES.includes(input.role) && !input.wardId) {
    throw ApiError.badRequest(`Role "${input.role}" requires a ward.`);
  }
  if (CROSS_WARD_ROLES.includes(input.role) && input.wardId) {
    throw ApiError.badRequest(`Role "${input.role}" is cross-ward and should not have a ward assigned.`);
  }
  if (input.wardId) {
    const ward = await attendanceWardRepository.findById(input.wardId);
    if (!ward) throw ApiError.badRequest("Ward not found.");
  }

  const existing = await attendanceUserRepository.findByUsername(input.username);
  if (existing) throw ApiError.badRequest("That username is already taken.");

  const passwordHash = await bcrypt.hash(input.password, 12);
  return attendanceUserRepository.create({
    username: input.username,
    passwordHash,
    displayName: input.displayName,
    role: input.role,
    wardId: input.wardId,
  });
}

export interface AttendanceUserSummary {
  id: number;
  username: string;
  displayName: string;
  role: AttendanceRole;
  wardId: number | null;
  wardName: string | null;
  active: boolean;
}

export async function listAttendanceUsersWithWards(): Promise<AttendanceUserSummary[]> {
  const [users, wards] = await Promise.all([attendanceUserRepository.listAll(), attendanceWardRepository.listAll()]);
  const wardNameById = new Map(wards.map((w) => [w.id, w.ward_name]));
  return users.map((u) => ({
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    role: u.role,
    wardId: u.ward_id,
    wardName: u.ward_id ? (wardNameById.get(u.ward_id) ?? null) : null,
    active: u.active,
  }));
}
