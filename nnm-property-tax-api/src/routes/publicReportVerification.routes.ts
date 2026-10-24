import { Router } from "express";
import { getPendingCount, listPublicReports, postApprove, postReject } from "../controllers/publicReportVerification.controller";
import { requireAttendanceRole } from "../middleware/requireAttendanceRole";
import { VERIFY_ROLES, VIEW_ROLES } from "../services/publicAssetReport.service";

/** Asset Management (attendance login): the City Manager verifies complaints from the public website before repair. */
export const publicReportVerificationRouter = Router();

publicReportVerificationRouter.get("/", requireAttendanceRole([...VIEW_ROLES]), listPublicReports);
publicReportVerificationRouter.get("/pending-count", requireAttendanceRole([...VIEW_ROLES]), getPendingCount);
publicReportVerificationRouter.post("/:id/approve", requireAttendanceRole([...VERIFY_ROLES]), postApprove);
publicReportVerificationRouter.post("/:id/reject", requireAttendanceRole([...VERIFY_ROLES]), postReject);
