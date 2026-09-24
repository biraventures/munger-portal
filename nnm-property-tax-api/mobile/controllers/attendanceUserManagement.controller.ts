import type { Request, Response } from "express";
import { z } from "zod";
import { createAttendanceUser, listAttendanceUsersWithWards } from "../services/attendanceUserManagement.service";
import { attendanceUserRepository } from "../repositories/attendanceUser.repository";
import { ATTENDANCE_ROLES } from "../types/attendance.types";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

/** GET /api/v1/attendance/users - attendance_admin only. */
export const listAttendanceUsersHandler = asyncHandler(async (_req: Request, res: Response) => {
  const users = await listAttendanceUsersWithWards();
  res.status(200).json({ users });
});

const createUserSchema = z.object({
  username: z.string().trim().min(3).max(64),
  password: z.string().min(8),
  displayName: z.string().trim().min(1),
  role: z.enum(ATTENDANCE_ROLES as [string, ...string[]]),
  wardId: z.coerce.number().int().positive().nullish(),
});

/** POST /api/v1/attendance/users - attendance_admin only. */
export const createAttendanceUserHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);

  const user = await createAttendanceUser({
    username: parsed.data.username,
    password: parsed.data.password,
    displayName: parsed.data.displayName,
    role: parsed.data.role as (typeof ATTENDANCE_ROLES)[number],
    wardId: parsed.data.wardId ?? null,
  });

  res.status(200).json({
    user: { id: user.id, username: user.username, displayName: user.display_name, role: user.role, wardId: user.ward_id, active: user.active },
  });
});

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
const activeBodySchema = z.object({ active: z.boolean() });

/** PATCH /api/v1/attendance/users/:id/active - attendance_admin only. */
export const setAttendanceUserActiveHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = idParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid user id");
  const bodyParsed = activeBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Body must include { active: boolean }");

  const updated = await attendanceUserRepository.setActive(paramsParsed.data.id, bodyParsed.data.active);
  if (!updated) throw ApiError.notFound("User not found");

  res.status(200).json({
    user: { id: updated.id, username: updated.username, displayName: updated.display_name, role: updated.role, wardId: updated.ward_id, active: updated.active },
  });
});

/** GET /api/v1/attendance/users/deactivated - deactivated staff logins awaiting APSWMO field verification and deletion. */
export const listDeactivatedAttendanceUsersHandler = asyncHandler(async (_req: Request, res: Response) => {
  const users = await attendanceUserRepository.listDeactivated();
  res.status(200).json({ users });
});

/** POST /api/v1/attendance/users/:id/verify-for-deletion - APSWMO's field verification, before deletion is allowed. */
export const verifyAttendanceUserForDeletionHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid user id");
  const updated = await attendanceUserRepository.verifyForDeletion(parsed.data.id, req.attendanceUser!.displayName);
  if (!updated) throw ApiError.badRequest("Staff account not found, not deactivated, or already deleted.");
  res.status(200).json({
    user: { id: updated.id, username: updated.username, displayName: updated.display_name, role: updated.role, verifiedForDeletionBy: updated.verified_for_deletion_by },
  });
});

/** DELETE /api/v1/attendance/users/:id - only once field-verified. */
export const deleteAttendanceUserHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid user id");
  if (req.attendanceUser!.sub === parsed.data.id) throw ApiError.badRequest("You can't delete your own account.");
  const deleted = await attendanceUserRepository.softDelete(parsed.data.id);
  if (!deleted) throw ApiError.badRequest("Staff account not found, not deactivated, or not yet field-verified.");
  res.status(200).json({ success: true });
});
