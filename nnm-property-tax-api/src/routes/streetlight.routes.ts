import { Router } from "express";
import {
  listInstallationAgenciesHandler,
  createInstallationAgencyHandler,
  setInstallationAgencyActiveHandler,
  listLightsHandler,
  createLightHandler,
  uploadLightsCsvHandler,
  setLightActiveHandler,
  listContractorWardsHandler,
  assignContractorWardHandler,
  listFaultsHandler,
  reportFaultHandler,
  getLightRepairHistorySummaryHandler,
  markFaultRepairedHandler,
  linkFaultToLightHandler,
  listFaultPenaltiesHandler,
  listAllPenaltiesHandler,
  myPenaltyTotalHandler,
  getWardStatusDashboardHandler,
  getStreetStatusDashboardHandler,
  getSegmentLightStatusHandler,
} from "../controllers/streetlight.controller";
import {
  postRequestLightChangeHandler,
  listLightChangeRequestsHandler,
  postApproveLightChangeHandler,
  postRejectLightChangeHandler,
} from "../controllers/lightChangeRequest.controller";
import {
  uploadStreetWiseLightsAttendanceHandler,
  listStreetSegmentsAttendanceHandler,
  setStreetSegmentGpsAttendanceHandler,
  listLightsForSegmentAttendanceHandler,
  listStreetlightCityManagersAttendanceHandler,
  getStreetlightCityManagerAssignmentAttendanceHandler,
  assignStreetlightCityManagerAttendanceHandler,
  getStreetlightDelayReportAttendanceHandler,
  exportStreetlightDelayReportAttendanceHandler,
  deleteAllStreetlightDataHandler,
  listDeactivatedLightsHandler,
  verifyLightForDeletionHandler,
  deleteVerifiedLightHandler,
} from "../controllers/streetlightCommissioner.controller";
import { requireAttendanceRole } from "../middleware/requireAttendanceRole";

export const streetlightRouter = Router();

// attendance_admin included throughout - the general super-admin
// login for this whole module system (used consistently this way for
// fleet/assets elsewhere), which had been missed here initially -
// without it, an attendance_admin login could view every list but
// couldn't create/upload/assign/manage anything.
const REGISTRY_MANAGE_ROLES = [
  "streetlight_nodal_clerk",
  "streetlight_ae",
  "streetlight_je",
  "city_manager",
  "municipal_commissioner",
  "deputy_municipal_commissioner",
  "attendance_admin",
] as const;

const OVERSIGHT_ROLES = ["city_manager", "municipal_commissioner", "deputy_municipal_commissioner", "attendance_admin"] as const;

// --- Installation agencies - municipal_commissioner manages this list, per what was explicitly asked for ---
streetlightRouter.get("/agencies", requireAttendanceRole(), listInstallationAgenciesHandler);
streetlightRouter.post("/agencies", requireAttendanceRole(["municipal_commissioner", "attendance_admin"]), createInstallationAgencyHandler);
streetlightRouter.patch(
  "/agencies/:id/active",
  requireAttendanceRole(["municipal_commissioner", "attendance_admin"]),
  setInstallationAgencyActiveHandler,
);

// --- Lights registry (streetlights and high-mast, filtered by ?lightType=) ---
streetlightRouter.get("/lights", requireAttendanceRole(), listLightsHandler);
streetlightRouter.post("/lights", requireAttendanceRole([...REGISTRY_MANAGE_ROLES]), createLightHandler);
streetlightRouter.post("/lights/bulk-upload", requireAttendanceRole([...REGISTRY_MANAGE_ROLES]), uploadLightsCsvHandler);
streetlightRouter.patch("/lights/:id/active", requireAttendanceRole([...REGISTRY_MANAGE_ROLES]), setLightActiveHandler);

// --- Light change requests (add/status/deactivate/reactivate/delete)
// - proposed by JE/AE/nodal clerk/contractor, approved through
// city_manager -> deputy_municipal_commissioner ->
// municipal_commissioner in order. Nothing applies until the final
// approval. See lightChangeRequest.controller.ts. ---
const LIGHT_CHANGE_REQUESTER_ROLES = ["streetlight_je", "streetlight_ae", "streetlight_nodal_clerk", "streetlight_contractor"] as const;
const LIGHT_CHANGE_APPROVER_ROLES = ["city_manager", "deputy_municipal_commissioner", "municipal_commissioner"] as const;
streetlightRouter.post("/light-change-requests", requireAttendanceRole([...LIGHT_CHANGE_REQUESTER_ROLES]), postRequestLightChangeHandler);
streetlightRouter.get("/light-change-requests", requireAttendanceRole(), listLightChangeRequestsHandler);
streetlightRouter.post("/light-change-requests/:id/approve", requireAttendanceRole([...LIGHT_CHANGE_APPROVER_ROLES]), postApproveLightChangeHandler);
streetlightRouter.post("/light-change-requests/:id/reject", requireAttendanceRole([...LIGHT_CHANGE_APPROVER_ROLES]), postRejectLightChangeHandler);

// --- Status dashboard, ward-wise and street-wise - City Manager, DMC, Municipal Commissioner ---
streetlightRouter.get("/status-dashboard/wards", requireAttendanceRole([...OVERSIGHT_ROLES]), getWardStatusDashboardHandler);
streetlightRouter.get("/status-dashboard/streets", requireAttendanceRole([...OVERSIGHT_ROLES]), getStreetStatusDashboardHandler);
streetlightRouter.get("/status-dashboard/segments/:id/lights", requireAttendanceRole([...OVERSIGHT_ROLES]), getSegmentLightStatusHandler);

// --- Commissioner's tools, brought over from the admin login so
// everything streetlight-related lives on this side (asset
// management) too - street-wise bulk import, street segment GPS,
// City Manager assignment, and the delay report. Same underlying
// services as their admin-side counterparts in
// streetlightAdmin.controller.ts, which are untouched. ---
const COMMISSIONER_ROLES = ["municipal_commissioner", "attendance_admin"] as const;
streetlightRouter.post("/street-wise-bulk-upload", requireAttendanceRole([...COMMISSIONER_ROLES]), uploadStreetWiseLightsAttendanceHandler);
streetlightRouter.get("/street-segments", requireAttendanceRole(), listStreetSegmentsAttendanceHandler);
streetlightRouter.patch("/street-segments/:id/gps", requireAttendanceRole([...COMMISSIONER_ROLES]), setStreetSegmentGpsAttendanceHandler);
streetlightRouter.get("/street-segments/:id/lights", requireAttendanceRole(), listLightsForSegmentAttendanceHandler);
streetlightRouter.get("/streetlight-city-managers", requireAttendanceRole([...COMMISSIONER_ROLES]), listStreetlightCityManagersAttendanceHandler);
streetlightRouter.get("/streetlight-city-manager-assignment", requireAttendanceRole([...COMMISSIONER_ROLES]), getStreetlightCityManagerAssignmentAttendanceHandler);
streetlightRouter.post("/streetlight-city-manager-assignment", requireAttendanceRole([...COMMISSIONER_ROLES]), assignStreetlightCityManagerAttendanceHandler);
streetlightRouter.get("/streetlight-delay-report", requireAttendanceRole([...COMMISSIONER_ROLES]), getStreetlightDelayReportAttendanceHandler);
streetlightRouter.get("/streetlight-delay-report/export", requireAttendanceRole([...COMMISSIONER_ROLES]), exportStreetlightDelayReportAttendanceHandler);
streetlightRouter.delete("/all-data", requireAttendanceRole([...COMMISSIONER_ROLES]), deleteAllStreetlightDataHandler);
streetlightRouter.get("/deactivated", requireAttendanceRole([...COMMISSIONER_ROLES]), listDeactivatedLightsHandler);
streetlightRouter.post("/deactivated/:id/verify-for-deletion", requireAttendanceRole(["city_manager", "attendance_admin"]), verifyLightForDeletionHandler);
streetlightRouter.delete("/deactivated/:id", requireAttendanceRole([...COMMISSIONER_ROLES]), deleteVerifiedLightHandler);

// --- Contractor-ward assignment ---
streetlightRouter.get("/contractor-wards", requireAttendanceRole(), listContractorWardsHandler);
streetlightRouter.post("/contractor-wards", requireAttendanceRole([...REGISTRY_MANAGE_ROLES]), assignContractorWardHandler);

// --- Faults - any logged-in attendance role can report ("all staff"), per what was explicitly asked for ---
streetlightRouter.get("/faults", requireAttendanceRole(), listFaultsHandler);
streetlightRouter.post("/faults", requireAttendanceRole(), reportFaultHandler);
streetlightRouter.get("/lights/:id/repair-history-summary", requireAttendanceRole(["municipal_commissioner", "attendance_admin"]), getLightRepairHistorySummaryHandler);
streetlightRouter.patch(
  "/faults/:id/repaired",
  requireAttendanceRole(["streetlight_contractor", ...REGISTRY_MANAGE_ROLES]),
  markFaultRepairedHandler,
);
streetlightRouter.patch("/faults/:id/link-light", requireAttendanceRole([...REGISTRY_MANAGE_ROLES]), linkFaultToLightHandler);

// --- Penalties ---
streetlightRouter.get("/faults/:id/penalties", requireAttendanceRole(), listFaultPenaltiesHandler);
streetlightRouter.get("/penalties", requireAttendanceRole([...OVERSIGHT_ROLES]), listAllPenaltiesHandler);
streetlightRouter.get("/penalties/mine", requireAttendanceRole(), myPenaltyTotalHandler);
