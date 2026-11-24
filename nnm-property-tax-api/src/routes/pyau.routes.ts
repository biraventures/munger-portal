import { Router } from "express";
import {
  listPyausHandler,
  createPyauHandler,
  uploadPyauCsvHandler,
  updatePyauHandler,
  deletePyauHandler,
  deletePyausByWardHandler,
  deleteAllPyausHandler,
  setPyauActiveHandler,
  listPyauContractorWardsHandler,
  assignPyauContractorWardHandler,
  listPyauIssuesForPyauHandler,
  listAllPyauIssuesHandler,
  reportPyauIssueHandler,
  markPyauIssueRepairedHandler,
} from "../controllers/pyau.controller";
import {
  deletePyauItem,
  getPyauApplication,
  getPyauAuditTrail,
  getPyauDashboard,
  getPyauHistory,
  getPyauIssue,
  getPyauPhoto,
  postPyau,
  postPyauAgency,
  postPyauApplication,
  postPyauFault,
  postPyauItem,
  postPyauRepaired,
  putPyau,
} from "../controllers/pyauOfficer.controller";
import { requireAttendanceRole } from "../middleware/requireAttendanceRole";

export const pyauRouter = Router();

// Registry management - JE/AE and the contractor's own oversight; "purely internal for now" so no separate nodal-clerk-style role was asked for.
// attendance_admin included too - the general super-admin login for
// this module system, missed initially the same way as in the street
// light module's routes.
// je_mechanical / ae_mechanical: the single Mechanical JE / AE logins also do the pyau JE / AE work.
const REGISTRY_MANAGE_ROLES = ["pyau_je", "pyau_ae", "je_mechanical", "ae_mechanical", "attendance_admin"] as const;

// --- Pyau registry ---
pyauRouter.get("/pyaus", requireAttendanceRole(), listPyausHandler);
pyauRouter.post("/pyaus", requireAttendanceRole([...REGISTRY_MANAGE_ROLES]), createPyauHandler);
pyauRouter.post("/pyaus/bulk-upload", requireAttendanceRole([...REGISTRY_MANAGE_ROLES]), uploadPyauCsvHandler);
pyauRouter.patch("/pyaus/:id/active", requireAttendanceRole([...REGISTRY_MANAGE_ROLES]), setPyauActiveHandler);
pyauRouter.patch("/pyaus/:id", requireAttendanceRole([...REGISTRY_MANAGE_ROLES]), updatePyauHandler);
// Order matters here: /pyaus/all and /pyaus/ward/:wardId must be
// registered before the generic /pyaus/:id delete route, or Express
// would try to match "all"/"ward" as the :id parameter first.
pyauRouter.delete("/pyaus/all", requireAttendanceRole(["attendance_admin"]), deleteAllPyausHandler);
pyauRouter.delete("/pyaus/ward/:wardId", requireAttendanceRole([...REGISTRY_MANAGE_ROLES]), deletePyausByWardHandler);
pyauRouter.delete("/pyaus/:id", requireAttendanceRole([...REGISTRY_MANAGE_ROLES]), deletePyauHandler);

// --- Contractor-ward assignment (45 wards / 3 contractor groups) ---
pyauRouter.get("/contractor-wards", requireAttendanceRole(), listPyauContractorWardsHandler);
pyauRouter.post("/contractor-wards", requireAttendanceRole([...REGISTRY_MANAGE_ROLES]), assignPyauContractorWardHandler);

// --- Issues / maintenance log - "any issue will be marked by JE or AE" ---
pyauRouter.get("/pyaus/:id/issues", requireAttendanceRole(), listPyauIssuesForPyauHandler);
pyauRouter.get("/issues", requireAttendanceRole(), listAllPyauIssuesHandler);
pyauRouter.post("/issues", requireAttendanceRole([...REGISTRY_MANAGE_ROLES]), reportPyauIssueHandler);
pyauRouter.patch(
  "/issues/:id/repaired",
  requireAttendanceRole(["pyau_contractor", ...REGISTRY_MANAGE_ROLES]),
  markPyauIssueRepairedHandler,
);

// --- Submersible dashboard of the JE / AE (Mechanical) - details, agency, contractor, builder maintenance, repairs with
// items / cost / photos and the ward parshad's application, audit trail. Moved here from the admin portal; the JE / AE
// see only their assigned wards. The Commissioner, DMC and City Manager view every ward. ---
const PYAU_OFFICER_EDIT = ["je_mechanical", "ae_mechanical", "attendance_admin"] as const;
const PYAU_OFFICER_VIEW = [...PYAU_OFFICER_EDIT, "municipal_commissioner", "deputy_municipal_commissioner", "city_manager"] as const;
const officerView = requireAttendanceRole([...PYAU_OFFICER_VIEW]);
const officerEdit = requireAttendanceRole([...PYAU_OFFICER_EDIT]);
pyauRouter.get("/officer/dashboard", officerView, getPyauDashboard);
pyauRouter.get("/officer/audit-trail", officerView, getPyauAuditTrail);
pyauRouter.post("/officer/agencies", officerEdit, postPyauAgency);
pyauRouter.post("/officer/pyaus", officerEdit, postPyau);
pyauRouter.put("/officer/pyaus/:id", officerEdit, putPyau);
pyauRouter.get("/officer/pyaus/:id/history", officerView, getPyauHistory);
pyauRouter.post("/officer/pyaus/:id/fault", officerEdit, postPyauFault);
pyauRouter.get("/officer/issues/:id", officerView, getPyauIssue);
pyauRouter.post("/officer/issues/:id/application", officerEdit, postPyauApplication);
pyauRouter.get("/officer/issues/:id/application", officerView, getPyauApplication);
pyauRouter.post("/officer/issues/:id/items", officerEdit, postPyauItem);
pyauRouter.delete("/officer/items/:id", officerEdit, deletePyauItem);
pyauRouter.post("/officer/issues/:id/repaired", officerEdit, postPyauRepaired);
pyauRouter.get("/officer/photos/:id", officerView, getPyauPhoto);
