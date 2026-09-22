import { Router } from "express";
import { postAttendanceLogin } from "../controllers/attendanceAuth.controller";
import {
  getAttendanceWards,
  getAttendanceWardsWithUsage,
  deleteAttendanceWardHandler,
  deleteAllUnusedWardsHandler,
  getAttendanceShifts,
} from "../controllers/attendanceLookup.controller";
import {
  getMyWardWorkersToday,
  postMarkStaffIn,
  postMarkStaffAbsent,
  postMarkStaffOut,
  postMarkStaffAbsentByOfficer,
} from "../controllers/fieldStaffAttendance.controller";
import {
  getMyWardDriversToday,
  postMarkDriverIn,
  postMarkDriverAbsent,
  postMarkDriverOut,
} from "../controllers/fieldDriverAttendance.controller";
import {
  postUploadWardPhoto,
  getWardPhotoToday,
  getWardPhotoByDate,
  getAllWardsPhotoRoundup,
  getWardPhotoFile,
} from "../controllers/fieldStaffDailyPhoto.controller";
import { postStaffFeedback, getStaffFeedbackHandler } from "../controllers/fieldStaffFeedback.controller";
import { getAttendanceStaffReport, getAttendanceDriverReport } from "../controllers/attendanceReport.controller";
import { downloadStaffMonthlyReport, downloadDriverMonthlyReport } from "../controllers/attendanceMonthlyReport.controller";
import { requireAttendanceReportAccess } from "../middleware/requireAttendanceReportAccess";
import {
  listAttendanceUsersHandler,
  createAttendanceUserHandler,
  setAttendanceUserActiveHandler,
  listDeactivatedAttendanceUsersHandler,
  verifyAttendanceUserForDeletionHandler,
  deleteAttendanceUserHandler,
} from "../controllers/attendanceUserManagement.controller";
import { getAttendanceDashboardSummaryHandler } from "../controllers/attendanceDashboardSummary.controller";
import {
  listAllStaffHandler,
  listStaffJobRolesHandler,
  createStaffHandler,
  setStaffRolesHandler,
  setStaffActiveHandler,
  updateStaffDetailsHandler,
  deleteStaffHandler,
  suspendStaffHandler,
  unsuspendStaffHandler,
  transferStaffHandler,
  uploadStaffRosterHandler,
  uploadStaffMergedImportHandler,
  deactivateAllStaffHandler,
  purgeAllFieldRecordsHandler,
  listAllDriversHandler,
  createDriverHandler,
  setDriverActiveHandler,
  transferDriverHandler,
  updateDriverDetailsHandler,
  assignDriverHandler,
  uploadDriverRosterHandler,
  uploadVehicleStaffImportHandler,
  listAllAssistantsHandler,
  createAssistantHandler,
  setAssistantActiveHandler,
  transferAssistantHandler,
  updateAssistantDetailsHandler,
  reassignAssistantDriverHandler,
  uploadAssistantRosterHandler,
} from "../controllers/fieldRoster.controller";
import {
  getMyWardAssistantsToday,
  postMarkAssistantIn,
  postMarkAssistantAbsent,
  postMarkAssistantOut,
} from "../controllers/fieldAssistantAttendance.controller";
import {
  listAllAssetsHandler,
  createAssetHandler,
  setAssetWardsHandler,
  setAssetActiveHandler,
  listDeactivatedAssetsHandler,
  verifyAssetForDeletionHandler,
  deleteAssetHandler,
  listAssetMaintenanceLogHandler,
  logAssetMaintenanceHandler,
  setAssetTrackingTypeHandler,
  listAssetLogbookHandler,
  logAssetReadingHandler,
} from "../controllers/asset.controller";
import { getFleetRegistry, postBaselineSurvey, getBaselineSurvey, getBaselineSurveySummary, downloadBaselineSurveyPdf } from "../controllers/assetBaselineSurvey.controller";
import { postUploadAssetPhoto, getAssetPhotos, getAssetPhotoFile, deleteAssetPhotoHandler } from "../controllers/assetPhoto.controller";
import { requireAttendanceRole } from "../middleware/requireAttendanceRole";
import { loginRateLimiter } from "../middleware/loginRateLimiter";

export const attendanceRouter = Router();

const OFFICER_ROLES = ["sanitation_officer", "sanitation_prabhari", "attendance_admin"] as const;

// Public
attendanceRouter.post("/auth/login", loginRateLimiter, postAttendanceLogin);

// Any authenticated attendance user (dropdown data)
attendanceRouter.get("/wards", requireAttendanceRole(), getAttendanceWards);
// Order matters: /wards/usage and /wards/unused must be registered
// before /wards/:id, or Express would try to match "usage"/"unused"
// as the :id parameter first.
attendanceRouter.get("/wards/usage", requireAttendanceRole(["attendance_admin"]), getAttendanceWardsWithUsage);
attendanceRouter.delete("/wards/unused", requireAttendanceRole(["attendance_admin"]), deleteAllUnusedWardsHandler);
attendanceRouter.delete("/wards/:id", requireAttendanceRole(["attendance_admin"]), deleteAttendanceWardHandler);
attendanceRouter.get("/shifts", requireAttendanceRole(), getAttendanceShifts);

// --- Field staff (Jamadar, own ward - any officer role can pass a wardId in the URL to view any ward, e.g. for feedback lookup) ---
attendanceRouter.get(
  "/staff/ward/:wardId/today",
  requireAttendanceRole(["jamadar", ...OFFICER_ROLES]),
  getMyWardWorkersToday,
);
attendanceRouter.post("/staff/:staffId/mark-in", requireAttendanceRole(["jamadar", "attendance_admin"]), postMarkStaffIn);
attendanceRouter.post(
  "/staff/:staffId/mark-absent",
  requireAttendanceRole(["jamadar", "attendance_admin"]),
  postMarkStaffAbsent,
);
attendanceRouter.post("/staff/:staffId/mark-out", requireAttendanceRole(["jamadar", "attendance_admin"]), postMarkStaffOut);
attendanceRouter.post(
  "/staff/:staffId/mark-absent-officer",
  requireAttendanceRole([...OFFICER_ROLES]),
  postMarkStaffAbsentByOfficer,
);

// --- Drivers (Driver Supervisor, own ward - any officer role can pass a wardId in the URL) ---
attendanceRouter.get(
  "/drivers/ward/:wardId/today",
  requireAttendanceRole(["driver_supervisor", ...OFFICER_ROLES]),
  getMyWardDriversToday,
);
attendanceRouter.post(
  "/drivers/:driverId/mark-in",
  requireAttendanceRole(["driver_supervisor", "attendance_admin"]),
  postMarkDriverIn,
);
attendanceRouter.post(
  "/drivers/:driverId/mark-absent",
  requireAttendanceRole(["driver_supervisor", "attendance_admin"]),
  postMarkDriverAbsent,
);
attendanceRouter.post(
  "/drivers/:driverId/mark-out",
  requireAttendanceRole(["driver_supervisor", "attendance_admin"]),
  postMarkDriverOut,
);

// --- Assistants (same access pattern as Drivers above) ---
attendanceRouter.get(
  "/assistants/ward/:wardId/today",
  requireAttendanceRole(["driver_supervisor", ...OFFICER_ROLES]),
  getMyWardAssistantsToday,
);
attendanceRouter.post(
  "/assistants/:assistantId/mark-in",
  requireAttendanceRole(["driver_supervisor", "attendance_admin"]),
  postMarkAssistantIn,
);
attendanceRouter.post(
  "/assistants/:assistantId/mark-absent",
  requireAttendanceRole(["driver_supervisor", "attendance_admin"]),
  postMarkAssistantAbsent,
);
attendanceRouter.post(
  "/assistants/:assistantId/mark-out",
  requireAttendanceRole(["driver_supervisor", "attendance_admin"]),
  postMarkAssistantOut,
);

// --- Daily group photo ---
attendanceRouter.post("/photos/upload", requireAttendanceRole(["jamadar"]), postUploadWardPhoto);
attendanceRouter.get(
  "/photos/ward/:wardId/today",
  requireAttendanceRole(["jamadar", ...OFFICER_ROLES]),
  getWardPhotoToday,
);
attendanceRouter.get("/photos/ward/:wardId", requireAttendanceRole([...OFFICER_ROLES]), getWardPhotoByDate);
attendanceRouter.get("/photos/all", requireAttendanceRole([...OFFICER_ROLES]), getAllWardsPhotoRoundup);
attendanceRouter.get(
  "/photos/file/ward/:wardId",
  requireAttendanceRole(["jamadar", ...OFFICER_ROLES]),
  getWardPhotoFile,
);

// --- Feedback ---
attendanceRouter.post("/staff/:staffId/feedback", requireAttendanceRole([...OFFICER_ROLES]), postStaffFeedback);
attendanceRouter.get("/staff/:staffId/feedback", requireAttendanceRole([...OFFICER_ROLES]), getStaffFeedbackHandler);

// --- Reports ---
attendanceRouter.get("/reports/staff", requireAttendanceRole([...OFFICER_ROLES]), getAttendanceStaffReport);
attendanceRouter.get("/reports/drivers", requireAttendanceRole([...OFFICER_ROLES]), getAttendanceDriverReport);

// --- Monthly report downloads (Sanitation Officer, Attendance Admin, or the property-tax Commissioner login) ---
attendanceRouter.get("/reports/monthly/staff.csv", requireAttendanceReportAccess, downloadStaffMonthlyReport);
attendanceRouter.get("/reports/monthly/drivers.csv", requireAttendanceReportAccess, downloadDriverMonthlyReport);

// --- User management (attendance_admin only) ---
attendanceRouter.get("/users", requireAttendanceRole(["attendance_admin"]), listAttendanceUsersHandler);
attendanceRouter.post("/users", requireAttendanceRole(["attendance_admin"]), createAttendanceUserHandler);
attendanceRouter.patch("/users/:id/active", requireAttendanceRole(["attendance_admin"]), setAttendanceUserActiveHandler);
attendanceRouter.get("/users/deactivated", requireAttendanceRole(["apswmo", "attendance_admin"]), listDeactivatedAttendanceUsersHandler);
attendanceRouter.post("/users/:id/verify-for-deletion", requireAttendanceRole(["apswmo", "attendance_admin"]), verifyAttendanceUserForDeletionHandler);
attendanceRouter.delete("/users/:id", requireAttendanceRole(["attendance_admin"]), deleteAttendanceUserHandler);

// --- Field staff roster management ---
// GET/transfer: attendance_admin OR sanitation_officer (an officer
// needs to see the roster to transfer anyone, and can move workers
// between wards, but cannot create/rename/deactivate). Everything
// else here stays attendance_admin-only.
attendanceRouter.get("/staff/all", requireAttendanceRole(["attendance_admin", "sanitation_officer"]), listAllStaffHandler);
attendanceRouter.get("/staff-job-roles", requireAttendanceRole(), listStaffJobRolesHandler);
attendanceRouter.post("/staff", requireAttendanceRole(["attendance_admin"]), createStaffHandler);
attendanceRouter.patch("/staff/:id/active", requireAttendanceRole(["attendance_admin"]), setStaffActiveHandler);
attendanceRouter.patch("/staff/:id/details", requireAttendanceRole(["attendance_admin", "sanitation_officer"]), updateStaffDetailsHandler);
attendanceRouter.delete("/staff/:id", requireAttendanceRole(["attendance_admin"]), deleteStaffHandler);
attendanceRouter.patch("/staff/:id/suspend", requireAttendanceRole(["attendance_admin"]), suspendStaffHandler);
attendanceRouter.patch("/staff/:id/unsuspend", requireAttendanceRole(["attendance_admin"]), unsuspendStaffHandler);
attendanceRouter.patch("/staff/:id/roles", requireAttendanceRole(["attendance_admin"]), setStaffRolesHandler);
attendanceRouter.patch("/staff/:id/transfer", requireAttendanceRole(["attendance_admin", "sanitation_officer"]), transferStaffHandler);
attendanceRouter.post("/staff/bulk-upload", requireAttendanceRole(["attendance_admin"]), uploadStaffRosterHandler);
attendanceRouter.post("/staff/merged-import", requireAttendanceRole(["attendance_admin"]), uploadStaffMergedImportHandler);
attendanceRouter.post("/staff/deactivate-all", requireAttendanceRole(["attendance_admin"]), deactivateAllStaffHandler);
attendanceRouter.post("/field-records/purge-all", requireAttendanceRole(["attendance_admin"]), purgeAllFieldRecordsHandler);

// --- Field driver roster management (same admin/officer split as staff above) ---
attendanceRouter.get("/drivers/all", requireAttendanceRole(["attendance_admin", "sanitation_officer"]), listAllDriversHandler);
attendanceRouter.post("/drivers", requireAttendanceRole(["attendance_admin"]), createDriverHandler);
attendanceRouter.patch("/drivers/:id/active", requireAttendanceRole(["attendance_admin"]), setDriverActiveHandler);
attendanceRouter.patch("/drivers/:id/transfer", requireAttendanceRole(["attendance_admin", "sanitation_officer"]), transferDriverHandler);
attendanceRouter.patch("/drivers/:id/details", requireAttendanceRole(["attendance_admin", "sanitation_officer"]), updateDriverDetailsHandler);
attendanceRouter.patch("/drivers/:id/assign", requireAttendanceRole(["attendance_admin"]), assignDriverHandler);
attendanceRouter.post("/drivers/bulk-upload", requireAttendanceRole(["attendance_admin"]), uploadDriverRosterHandler);
attendanceRouter.post("/drivers/vehicle-staff-import", requireAttendanceRole(["attendance_admin"]), uploadVehicleStaffImportHandler);

// --- Field assistants (same admin/officer split as staff/drivers above) ---
attendanceRouter.get("/assistants/all", requireAttendanceRole(["attendance_admin", "sanitation_officer"]), listAllAssistantsHandler);
attendanceRouter.post("/assistants", requireAttendanceRole(["attendance_admin"]), createAssistantHandler);
attendanceRouter.patch("/assistants/:id/active", requireAttendanceRole(["attendance_admin"]), setAssistantActiveHandler);
attendanceRouter.patch("/assistants/:id/transfer", requireAttendanceRole(["attendance_admin", "sanitation_officer"]), transferAssistantHandler);
attendanceRouter.patch("/assistants/:id/details", requireAttendanceRole(["attendance_admin", "sanitation_officer"]), updateAssistantDetailsHandler);
attendanceRouter.patch("/assistants/:id/reassign-driver", requireAttendanceRole(["attendance_admin"]), reassignAssistantDriverHandler);
attendanceRouter.post("/assistants/bulk-upload", requireAttendanceRole(["attendance_admin"]), uploadAssistantRosterHandler);

// --- Assets (vehicles/tricycles/hand carts) - view: any attendance login; edit: attendance_admin + the 3 fleet oversight roles ---
const FLEET_EDIT_ROLES = ["attendance_admin", "junior_engineer", "assistant_engineer_mechanical", "maintenance_nodal_clerk"] as const;
attendanceRouter.get("/assets", requireAttendanceRole(), listAllAssetsHandler);
attendanceRouter.post("/assets", requireAttendanceRole([...FLEET_EDIT_ROLES]), createAssetHandler);
attendanceRouter.get("/fleet-registry", requireAttendanceRole(), getFleetRegistry);
attendanceRouter.get("/assets/baseline-survey-summary", requireAttendanceRole(), getBaselineSurveySummary);
attendanceRouter.get("/assets/:id/baseline-survey", requireAttendanceRole(), getBaselineSurvey);
attendanceRouter.get("/assets/:id/baseline-survey/pdf", requireAttendanceRole(), downloadBaselineSurveyPdf);
attendanceRouter.post("/assets/:id/baseline-survey", requireAttendanceRole([...FLEET_EDIT_ROLES]), postBaselineSurvey);
attendanceRouter.post("/assets/:id/photos", requireAttendanceRole([...FLEET_EDIT_ROLES]), postUploadAssetPhoto);
attendanceRouter.get("/assets/:id/photos", requireAttendanceRole(), getAssetPhotos);
attendanceRouter.get("/asset-photos/:photoId/file", requireAttendanceRole(), getAssetPhotoFile);
attendanceRouter.delete("/asset-photos/:photoId", requireAttendanceRole([...FLEET_EDIT_ROLES]), deleteAssetPhotoHandler);
attendanceRouter.patch("/assets/:id/wards", requireAttendanceRole([...FLEET_EDIT_ROLES]), setAssetWardsHandler);
attendanceRouter.patch("/assets/:id/active", requireAttendanceRole([...FLEET_EDIT_ROLES]), setAssetActiveHandler);
attendanceRouter.get("/assets/deactivated", requireAttendanceRole([...FLEET_EDIT_ROLES]), listDeactivatedAssetsHandler);
attendanceRouter.post("/assets/:id/verify-for-deletion", requireAttendanceRole(["junior_engineer", "attendance_admin"]), verifyAssetForDeletionHandler);
attendanceRouter.delete("/assets/:id", requireAttendanceRole([...FLEET_EDIT_ROLES]), deleteAssetHandler);
attendanceRouter.get("/assets/:id/maintenance-log", requireAttendanceRole(), listAssetMaintenanceLogHandler);
attendanceRouter.post("/assets/:id/maintenance-log", requireAttendanceRole([...FLEET_EDIT_ROLES]), logAssetMaintenanceHandler);
attendanceRouter.patch("/assets/:id/tracking-type", requireAttendanceRole([...FLEET_EDIT_ROLES]), setAssetTrackingTypeHandler);
attendanceRouter.get("/assets/:id/logbook", requireAttendanceRole(), listAssetLogbookHandler);
attendanceRouter.post("/assets/:id/logbook", requireAttendanceRole(["driver_supervisor", "attendance_admin"]), logAssetReadingHandler);

// --- Officer dashboard ---
attendanceRouter.get(
  "/dashboard-summary",
  requireAttendanceRole([...OFFICER_ROLES]),
  getAttendanceDashboardSummaryHandler,
);
