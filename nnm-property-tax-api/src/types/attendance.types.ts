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
  | "deputy_mayor"
  | "encroachment_staff"
  | "mobile_court_staff"
  | "je_civil"
  | "je_mechanical"
  | "ae_civil"
  | "ae_mechanical"
  | "yojana_prabhari";

export const ATTENDANCE_ROLES: AttendanceRole[] = [
  "jamadar",
  "driver_supervisor",
  "sanitation_officer",
  "sanitation_prabhari",
  "attendance_admin",
  "junior_engineer",
  "assistant_engineer_mechanical",
  "maintenance_nodal_clerk",
  "streetlight_contractor",
  "streetlight_je",
  "streetlight_ae",
  "streetlight_nodal_clerk",
  "city_manager",
  "deputy_municipal_commissioner",
  "municipal_commissioner",
  "pyau_je",
  "pyau_ae",
  "pyau_contractor",
  "apswmo",
  "ward_parshad",
  "mayor",
  "deputy_mayor",
  "encroachment_staff",
  "mobile_court_staff",
  "je_civil",
  "je_mechanical",
  "ae_civil",
  "ae_mechanical",
  "yojana_prabhari",
];

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
  encroachment_staff: "Encroachment Staff",
  mobile_court_staff: "Mobile Court Staff",
  je_civil: "Junior Engineer (Civil)",
  je_mechanical: "Junior Engineer (Mechanical)",
  ae_civil: "Assistant Engineer (Civil)",
  ae_mechanical: "Assistant Engineer (Mechanical)",
  yojana_prabhari: "Yojana Prabhari",
};

/** Ward-scoped roles must have a ward_id; cross-ward roles never do. The 3 fleet roles are cross-ward - they oversee the whole vehicle/asset registry, not one ward's workers.
 * The street light roles are all cross-ward too, including streetlight_contractor - a contractor covers a SET of wards, tracked separately via contractor_wards, not the single ward_id used by jamadar/driver_supervisor.
 * ward_parshad is ward-scoped - they only report faults for their own ward. mayor/deputy_mayor are cross-ward - they report for any ward, same as the other oversight-style roles. */
export const WARD_SCOPED_ROLES: AttendanceRole[] = ["jamadar", "driver_supervisor", "ward_parshad"];
export const CROSS_WARD_ROLES: AttendanceRole[] = [
  "sanitation_officer",
  "sanitation_prabhari",
  "attendance_admin",
  "junior_engineer",
  "assistant_engineer_mechanical",
  "maintenance_nodal_clerk",
  "streetlight_contractor",
  "streetlight_je",
  "streetlight_ae",
  "streetlight_nodal_clerk",
  "city_manager",
  "deputy_municipal_commissioner",
  "municipal_commissioner",
  "pyau_je",
  "pyau_ae",
  "pyau_contractor",
  "apswmo",
  "mayor",
  "deputy_mayor",
  "encroachment_staff",
  "mobile_court_staff",
  // Engineers work in the wards the Commissioner assigns them (engineer_wards), not one fixed ward_id.
  "je_civil",
  "je_mechanical",
  "ae_civil",
  "ae_mechanical",
  "yojana_prabhari",
];

/** The single engineer logins by discipline (they also carry the streetlight / pyau JE and AE work - mechanical). */
export const ENGINEER_ROLES = ["je_civil", "je_mechanical", "ae_civil", "ae_mechanical"] as const;
export type EngineerRole = (typeof ENGINEER_ROLES)[number];

/**
 * The Mechanical JE / AE logins made before project monitoring carry their module's role - fleet (junior_engineer /
 * assistant_engineer_mechanical), street lights (streetlight_je / _ae), pyau (pyau_je / _ae). In project monitoring
 * they are the Mechanical JE / AE. (Only there: their ward scope in those modules is unchanged.)
 */
export const ENGINEER_ROLE_ALIASES: Partial<Record<AttendanceRole, EngineerRole>> = {
  junior_engineer: "je_mechanical",
  streetlight_je: "je_mechanical",
  pyau_je: "je_mechanical",
  assistant_engineer_mechanical: "ae_mechanical",
  streetlight_ae: "ae_mechanical",
  pyau_ae: "ae_mechanical",
};
/** Every login role that works as a project engineer. */
export const ENGINEER_LOGIN_ROLES: AttendanceRole[] = [...ENGINEER_ROLES, ...(Object.keys(ENGINEER_ROLE_ALIASES) as AttendanceRole[])];
/** The project engineer kind of a login role (null: not an engineer). */
export const engineerKindOf = (role: string): EngineerRole | null =>
  (ENGINEER_ROLES as readonly string[]).includes(role) ? (role as EngineerRole) : (ENGINEER_ROLE_ALIASES[role as AttendanceRole] ?? null);
/** The login roles of one engineer kind. */
export const loginRolesOf = (kind: EngineerRole): AttendanceRole[] => ENGINEER_LOGIN_ROLES.filter((r) => engineerKindOf(r) === kind);

export interface AttendanceUserRow {
  id: number;
  username: string;
  password_hash: string;
  display_name: string;
  role: AttendanceRole;
  ward_id: number | null;
  active: boolean;
  verified_for_deletion_by: string | null;
  verified_for_deletion_at: string | null;
  deleted_at: string | null;
}

export interface AttendanceLoginResult {
  token: string;
  user: {
    id: number;
    username: string;
    displayName: string;
    role: AttendanceRole;
    wardId: number | null;
    wardName: string | null;
  };
}

/** Payload embedded in the JWT - a distinct `type` from "operator"/"admin" so tokens can never cross over between the systems. */
export interface AttendanceTokenPayload {
  type: "attendance";
  sub: number; // attendance_users id
  username: string;
  displayName: string;
  role: AttendanceRole;
  wardId: number | null;
}

export interface AttendanceWardRow {
  id: number;
  ward_name: string;
}

export interface AttendanceShiftRow {
  id: number;
  shift_name: string;
  start_time: string;
  end_time: string;
  grace_minutes: number;
}

export type AttendanceStatus = "present" | "half_day" | "absent_informed" | "absent_not_informed" | "absent";

export interface FieldStaffRow {
  id: number;
  name: string;
  name_hi: string | null;
  external_id: string | null;
  father_name: string | null;
  ward_id: number;
  shift_id: number | null;
  active: boolean;
  suspended: boolean;
  suspended_reason: string | null;
  suspended_at: string | null;
}

export interface FieldStaffAttendanceRow {
  id: number;
  date: string;
  staff_id: number;
  staff_name: string;
  ward_id: number;
  in_time: Date | null;
  out_time: Date | null;
  status: AttendanceStatus;
  marked_by: string;
  remarks: string | null;
}

export interface FieldStaffFeedbackRow {
  id: number;
  created_at: Date;
  staff_id: number;
  staff_name: string;
  ward_id: number;
  given_by: string;
  given_by_role: string;
  type: "positive" | "negative";
  comment: string | null;
}

export interface FieldStaffDailyPhotoRow {
  id: number;
  date: string;
  ward_id: number;
  uploaded_by: string;
  photo_path: string;
  uploaded_at: Date;
}

export interface FieldDriverRow {
  id: number;
  name: string;
  name_hi: string | null;
  external_id: string | null;
  father_name: string | null;
  dl_number: string | null;
  ward_id: number;
  shift_id: number | null;
  active: boolean;
  asset_id: number | null;
  supervisor_id: number | null;
}

export interface FieldDriverAttendanceRow {
  id: number;
  date: string;
  driver_id: number;
  driver_name: string;
  ward_id: number;
  in_time: Date | null;
  out_time: Date | null;
  status: AttendanceStatus;
  marked_by: string;
  remarks: string | null;
}

export interface FieldAssistantAttendanceRow {
  id: number;
  date: string;
  assistant_id: number;
  assistant_name: string;
  ward_id: number;
  in_time: Date | null;
  out_time: Date | null;
  status: AttendanceStatus;
  marked_by: string;
  remarks: string | null;
}

export interface StaffJobRoleRow {
  id: number;
  role_name: string;
}
