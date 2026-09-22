const TOKEN_KEY = "nnm_attendance_token";
const USER_KEY = "nnm_attendance_user";

export type AttendanceRole =
  | "jamadar"
  | "driver_supervisor"
  | "sanitation_officer"
  | "sanitation_prabhari"
  | "attendance_admin"
  | "junior_engineer"
  | "assistant_engineer_mechanical"
  | "maintenance_nodal_clerk"
  | "streetlight_contractor"
  | "streetlight_je"
  | "streetlight_ae"
  | "streetlight_nodal_clerk"
  | "city_manager"
  | "deputy_municipal_commissioner"
  | "municipal_commissioner"
  | "pyau_je"
  | "pyau_ae"
  | "pyau_contractor"
  | "apswmo";

export const ATTENDANCE_ROLE_LABELS: Record<AttendanceRole, string> = {
  jamadar: "Jamadar",
  driver_supervisor: "Driver Supervisor",
  sanitation_officer: "Sanitation Officer",
  sanitation_prabhari: "Sanitation Prabhari",
  attendance_admin: "Attendance Admin",
  junior_engineer: "Junior Engineer",
  assistant_engineer_mechanical: "Assistant Engineer (Mechanical)",
  maintenance_nodal_clerk: "Maintenance Nodal Clerk",
  streetlight_contractor: "Maintenance Contractor (Street Light)",
  streetlight_je: "Junior Engineer (Street Light)",
  streetlight_ae: "Assistant Engineer (Street Light)",
  streetlight_nodal_clerk: "Street Light Nodal Clerk",
  city_manager: "City Manager",
  deputy_municipal_commissioner: "Deputy Municipal Commissioner",
  municipal_commissioner: "Municipal Commissioner",
  pyau_je: "Junior Engineer (Pyau)",
  pyau_ae: "Assistant Engineer (Pyau)",
  pyau_contractor: "Maintenance Contractor (Pyau)",
  apswmo: "APSWMO",
};

export const WARD_SCOPED_ROLES: AttendanceRole[] = ["jamadar", "driver_supervisor"];
export const OFFICER_ROLES: AttendanceRole[] = ["sanitation_officer", "sanitation_prabhari", "attendance_admin"];

export interface AttendanceUserInfo {
  id: number;
  username: string;
  displayName: string;
  role: AttendanceRole;
  wardId: number | null;
  wardName: string | null;
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

export async function attendanceLogin(username: string, password: string): Promise<AttendanceUserInfo> {
  const res = await fetch(`${API_BASE_URL}/attendance/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error("Incorrect username or password.");
    throw new Error("Login failed. Please try again.");
  }

  const data: { token: string; user: AttendanceUserInfo } = await res.json();

  // Session storage - cleared automatically when the browser tab closes,
  // same reasoning as the operator/admin logins: this is a shared
  // ward-office terminal, not a personal device.
  sessionStorage.setItem(TOKEN_KEY, data.token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(data.user));

  return data.user;
}

export function getAttendanceToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

export function getAttendanceUserInfo(): AttendanceUserInfo | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as AttendanceUserInfo) : null;
}

export function attendanceLogout(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}
