import type { AttendanceRole, EngineerRole } from "./attendance.types";

/** Project monitoring (migration 171) - categories, stages and who may do what. */

export const PROJECT_STAGES = [
  "approved",
  "tendered",
  "tender_finalised",
  "work_order_issued",
  "in_progress",
  "completed",
  "payment_done",
  "past_completed",
  "cancelled",
] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];

export const PROJECT_STAGE_LABELS: Record<ProjectStage, string> = {
  approved: "Approved",
  tendered: "Gone for tender",
  tender_finalised: "Tender finalised",
  work_order_issued: "Work order given",
  in_progress: "Work in progress",
  completed: "Completed",
  payment_done: "Payment done",
  past_completed: "Past project (completed before the portal)",
  cancelled: "Cancelled / dropped",
};

/** Ongoing = not yet finished; past = finished (including the ones finished before the portal). */
export const ONGOING_STAGES: ProjectStage[] = ["approved", "tendered", "tender_finalised", "work_order_issued", "in_progress"];
export const PAST_STAGES: ProjectStage[] = ["completed", "payment_done", "past_completed"];

export type Discipline = "civil" | "mechanical" | "both";

export const PROJECT_CATEGORIES = {
  road_pcc: { label: "Road - PCC", discipline: "civil" },
  road_bituminous: { label: "Road - Bituminous", discipline: "civil" },
  drain: { label: "Drain / Nala", discipline: "civil" },
  building: { label: "Building", discipline: "civil" },
  park_pond: { label: "Park / Pond", discipline: "civil" },
  boundary_wall: { label: "Boundary wall", discipline: "civil" },
  other_civil: { label: "Other civil work", discipline: "civil" },
  streetlight_highmast: { label: "Streetlight / High mast", discipline: "mechanical" },
  submersible_pyau: { label: "Submersible / Pyau", discipline: "mechanical" },
  water_supply_pump: { label: "Water supply / Pump", discipline: "mechanical" },
  electrical: { label: "Electrical work", discipline: "mechanical" },
  vehicle_machinery: { label: "Vehicle / Machinery", discipline: "mechanical" },
  other_mechanical: { label: "Other mechanical work", discipline: "mechanical" },
} as const satisfies Record<string, { label: string; discipline: "civil" | "mechanical" }>;
export type ProjectCategory = keyof typeof PROJECT_CATEGORIES;
export const PROJECT_CATEGORY_KEYS = Object.keys(PROJECT_CATEGORIES) as [ProjectCategory, ...ProjectCategory[]];

export const PROJECT_MILESTONES = ["day_minus_1", "day_0", "day_1", "pct_10", "pct_20", "pct_50", "pct_75", "pct_90"] as const;
export type ProjectMilestone = (typeof PROJECT_MILESTONES)[number];
export const MAX_PHOTOS_PER_MILESTONE = 4;

/** The Commissioner (and the module super-admin): everything, ward assignment, per-project monitor. */
export const PROJECT_ADMIN_ROLES: AttendanceRole[] = ["municipal_commissioner", "attendance_admin"];
/** Who enters projects - one by one or by Excel - and moves their stages. */
export const PROJECT_ENTRY_ROLES: AttendanceRole[] = [...PROJECT_ADMIN_ROLES, "yojana_prabhari"];
/** Who sees every project (read only for the ones not in the lists above). */
export const PROJECT_VIEW_ALL_ROLES: AttendanceRole[] = [...PROJECT_ENTRY_ROLES, "deputy_municipal_commissioner"];

export const engineerDiscipline = (role: EngineerRole): "civil" | "mechanical" => (role.endsWith("_civil") ? "civil" : "mechanical");
/** The engineer kinds that monitor a project of this discipline. */
export function monitorRolesFor(d: Discipline): EngineerRole[] {
  if (d === "civil") return ["je_civil", "ae_civil"];
  if (d === "mechanical") return ["je_mechanical", "ae_mechanical"];
  return ["je_civil", "ae_civil", "je_mechanical", "ae_mechanical"];
}
