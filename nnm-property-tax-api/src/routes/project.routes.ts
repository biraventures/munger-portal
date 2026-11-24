import { Router } from "express";
import {
  addDocumentHandler,
  addPhotoHandler,
  assignWardsHandler,
  auditTrailHandler,
  bulkImportHandler,
  createProjectHandler,
  deleteProjectHandler,
  exportReportHandler,
  engineerSetupHandler,
  getDocumentHandler,
  getPhotoHandler,
  getProjectHandler,
  listProjectsHandler,
  markGpsHandler,
  removeDocumentHandler,
  removePhotoHandler,
  setMonitorsHandler,
  templateHandler,
  updateProjectHandler,
  updateSiteHandler,
  wardReportHandler,
} from "../controllers/project.controller";
import { requireAttendanceRole } from "../middleware/requireAttendanceRole";
import { ENGINEER_LOGIN_ROLES } from "../types/attendance.types";
import { PROJECT_ADMIN_ROLES, PROJECT_ENTRY_ROLES, PROJECT_VIEW_ALL_ROLES } from "../types/project.types";

/** Project monitoring (Asset Management portal, attendance login) - see services/project.service.ts. */
export const projectRouter = Router();

// Engineers include the older fleet / street light / pyau JE and AE logins (Mechanical).
const ANY = [...PROJECT_VIEW_ALL_ROLES, ...ENGINEER_LOGIN_ROLES];
const WORK = [...PROJECT_ENTRY_ROLES, ...ENGINEER_LOGIN_ROLES];

projectRouter.get("/", requireAttendanceRole(ANY), listProjectsHandler);
projectRouter.get("/ward-report", requireAttendanceRole(ANY), wardReportHandler);
projectRouter.get("/export", requireAttendanceRole(ANY), exportReportHandler);
projectRouter.get("/template", requireAttendanceRole(PROJECT_ENTRY_ROLES), templateHandler);
projectRouter.post("/bulk-upload", requireAttendanceRole(PROJECT_ENTRY_ROLES), bulkImportHandler);
projectRouter.get("/engineers", requireAttendanceRole(PROJECT_VIEW_ALL_ROLES), engineerSetupHandler);
projectRouter.put("/engineer-wards", requireAttendanceRole(PROJECT_ADMIN_ROLES), assignWardsHandler);
projectRouter.get("/audit-trail", requireAttendanceRole(PROJECT_VIEW_ALL_ROLES), auditTrailHandler);
projectRouter.get("/photos/:id", requireAttendanceRole(ANY), getPhotoHandler);
projectRouter.delete("/photos/:id", requireAttendanceRole(WORK), removePhotoHandler);
projectRouter.get("/documents/:id", requireAttendanceRole(ANY), getDocumentHandler);
projectRouter.delete("/documents/:id", requireAttendanceRole(WORK), removeDocumentHandler);
projectRouter.post("/", requireAttendanceRole(PROJECT_ENTRY_ROLES), createProjectHandler);
projectRouter.get("/:id", requireAttendanceRole(ANY), getProjectHandler);
projectRouter.put("/:id", requireAttendanceRole(PROJECT_ENTRY_ROLES), updateProjectHandler);
projectRouter.delete("/:id", requireAttendanceRole(PROJECT_ADMIN_ROLES), deleteProjectHandler);
projectRouter.patch("/:id/site", requireAttendanceRole(WORK), updateSiteHandler);
projectRouter.post("/:id/gps", requireAttendanceRole(WORK), markGpsHandler);
projectRouter.post("/:id/documents", requireAttendanceRole(WORK), addDocumentHandler);
projectRouter.post("/:id/photos", requireAttendanceRole(WORK), addPhotoHandler);
projectRouter.put("/:id/monitors", requireAttendanceRole(PROJECT_ADMIN_ROLES), setMonitorsHandler);
