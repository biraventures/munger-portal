import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { attendanceUserRepository } from "../repositories/attendanceUser.repository";
import { attendanceWardRepository } from "../repositories/attendanceWard.repository";
import { ApiError } from "../utils/ApiError";
import type { AttendanceLoginResult, AttendanceTokenPayload } from "../types/attendance.types";

export async function attendanceLogin(username: string, password: string): Promise<AttendanceLoginResult> {
  const user = await attendanceUserRepository.findByUsername(username);

  // Deliberately identical error for "no such user" and "wrong password" -
  // same reasoning as the operator/admin login flows: never reveal which
  // one it was, so the login form can't be used to enumerate usernames.
  if (!user) {
    throw new ApiError(401, "Invalid username or password");
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatches) {
    throw new ApiError(401, "Invalid username or password");
  }

  const ward = user.ward_id ? await attendanceWardRepository.findById(user.ward_id) : null;

  const payload: AttendanceTokenPayload = {
    type: "attendance",
    sub: user.id,
    username: user.username,
    displayName: user.display_name,
    role: user.role,
    wardId: user.ward_id,
  };

  const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] });

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      wardId: user.ward_id,
      wardName: ward ? ward.ward_name : null,
    },
  };
}
