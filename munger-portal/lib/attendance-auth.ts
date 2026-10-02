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
  | "apswmo"
  | "ward_parshad"
  | "mayor"
  | "deputy_mayor";

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
  ward_parshad: "Ward Parshad",
  mayor: "Mayor",
  deputy_mayor: "Deputy Mayor",
};

export const ATTENDANCE_ROLE_LABELS_HI: Record<AttendanceRole, string> = {
  jamadar: "जमादार",
  driver_supervisor: "ड्राइवर सुपरवाइज़र",
  sanitation_officer: "सफाई अधिकारी",
  sanitation_prabhari: "सफाई प्रभारी",
  attendance_admin: "अटेंडेंस एडमिन",
  junior_engineer: "कनिष्ठ अभियंता",
  assistant_engineer_mechanical: "सहायक अभियंता (मैकेनिकल)",
  maintenance_nodal_clerk: "मेंटेनेंस नोडल क्लर्क",
  streetlight_contractor: "मेंटेनेंस कॉन्ट्रैक्टर (स्ट्रीट लाइट)",
  streetlight_je: "कनिष्ठ अभियंता (स्ट्रीट लाइट)",
  streetlight_ae: "सहायक अभियंता (स्ट्रीट लाइट)",
  streetlight_nodal_clerk: "स्ट्रीट लाइट नोडल क्लर्क",
  city_manager: "सिटी मैनेजर",
  deputy_municipal_commissioner: "उप नगर आयुक्त",
  municipal_commissioner: "नगर आयुक्त",
  pyau_je: "कनिष्ठ अभियंता (प्याऊ)",
  pyau_ae: "सहायक अभियंता (प्याऊ)",
  pyau_contractor: "मेंटेनेंस कॉन्ट्रैक्टर (प्याऊ)",
  apswmo: "एपीएसडब्ल्यूएमओ",
  ward_parshad: "वार्ड पार्षद",
  mayor: "मेयर",
  deputy_mayor: "उप मेयर",
};

/** Role label in the given UI language - use this instead of reading ATTENDANCE_ROLE_LABELS directly wherever a page already knows the current language. */
export function attendanceRoleLabel(role: AttendanceRole, lang: "en" | "hi"): string {
  return lang === "hi" ? ATTENDANCE_ROLE_LABELS_HI[role] : ATTENDANCE_ROLE_LABELS[role];
}

export const WARD_SCOPED_ROLES: AttendanceRole[] = ["jamadar", "driver_supervisor", "ward_parshad"];
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

export async function attendanceLogin(username: string, password: string, rememberMe: boolean = false): Promise<AttendanceUserInfo> {
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

  sessionStorage.setItem(TOKEN_KEY, data.token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(data.user));

  if (rememberMe) {
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  } else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  return data.user;
}

export function getAttendanceToken(): string | null {
  if (typeof window === "undefined") return null;
  const token = sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
  if (token && !sessionStorage.getItem(TOKEN_KEY)) {
    try {
      sessionStorage.setItem(TOKEN_KEY, token);
    } catch {}
  }
  return token;
}

export function getAttendanceUserInfo(): AttendanceUserInfo | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY);
  if (raw && !sessionStorage.getItem(USER_KEY)) {
    try {
      sessionStorage.setItem(USER_KEY, raw);
    } catch {}
  }
  return raw ? (JSON.parse(raw) as AttendanceUserInfo) : null;
}

export function attendanceLogout(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
