import { Router } from "express";
import { propertyRouter } from "./property.routes";
import { operatorRouter } from "./operator.routes";
import { shopRouter } from "./shop.routes";
import { shopRentalApplicationRouter } from "./shopRentalApplication.routes";
import { shopRentalPreferenceRouter } from "./shopRentalPreference.routes";
import { tradeLicenseApplicationRouter } from "./tradeLicenseApplication.routes";
import { verifyRouter } from "./verify.routes";
import { authRouter } from "./auth.routes";
import { paymentsRouter } from "./payments.routes";
import { adminAuthRouter } from "./adminAuth.routes";
import { adminRouter } from "./admin.routes";
import { getFormOptions } from "../controllers/formOptions.controller";
import { dashboardSummaryRouter } from "./dashboardSummary.routes";
import { attendanceRouter } from "./attendance.routes";
import { taxCollectorRouter } from "./taxCollector.routes";
import { streetlightRouter } from "./streetlight.routes";
import { streetlightPublicRouter } from "./streetlightPublic.routes";
import { pyauRouter } from "./pyau.routes";
import { enforcementRouter, encroachmentRouter, mobileCourtRouter } from "./enforcement.routes";
import { publicDocumentRouter } from "./publicDocument.routes";
import { documentManagerRouter } from "./documentManager.routes";
import { whosWhoManagerRouter, whosWhoPublicRouter } from "./whosWho.routes";
import { publicMutationRouter } from "./publicMutation.routes";
import { publicNewHoldingRouter } from "./publicNewHolding.routes";
import { publicSubmersibleRouter } from "./publicSubmersible.routes";
import { publicStreetlightRouter } from "./publicStreetlight.routes";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

apiRouter.get("/form-options", getFormOptions);
apiRouter.use("/auth", authRouter);
apiRouter.use("/properties", propertyRouter);
apiRouter.use("/operator", operatorRouter);
apiRouter.use("/shops", shopRouter);
apiRouter.use("/shop-rental-applications", shopRentalApplicationRouter);
apiRouter.use("/shop-rental-preferences", shopRentalPreferenceRouter);
apiRouter.use("/trade-license-applications", tradeLicenseApplicationRouter);
apiRouter.use("/verify", verifyRouter);
apiRouter.use("/payments", paymentsRouter);
apiRouter.use("/tax-collectors", taxCollectorRouter);

apiRouter.use("/dashboard-summary", dashboardSummaryRouter);
// Fully separate module - its own auth, its own tables, nothing shared with the property tax / shop / trade license system above.
apiRouter.use("/attendance", attendanceRouter);
// City Manager encroachment removal and APSWMO mobile court (migration 122) - attendance login.
apiRouter.use("/enforcement", enforcementRouter);
apiRouter.use("/encroachment", encroachmentRouter);
apiRouter.use("/mobile-court", mobileCourtRouter);

// Street light monitoring module - reuses the attendance_users login
// system (new roles added there) for staff-facing endpoints, plus a
// genuinely public, unauthenticated endpoint for citizen grievances.
apiRouter.use("/streetlight", streetlightRouter);
apiRouter.use("/streetlight-grievance", streetlightPublicRouter);

// Submersible pyau maintenance module - purely internal, no public
// channel, no repair deadline/SLA - just an issue-to-repair log with
// its own dedicated JE/AE/contractor roles (kept separate from the
// street light module's, per what was asked for).
apiRouter.use("/pyau", pyauRouter);

// Documents/reports the Commissioner publishes on the public website - read-only and unauthenticated here; managed via /admin/public-documents.
apiRouter.use("/public-documents", publicDocumentRouter);
// Document upload + APSWMO approval for the admin / operator / attendance logins.
apiRouter.use("/document-manager", documentManagerRouter);
// Who's Who page: public read-only list + photos, and the operator -> City Manager -> DMC entry workflow.
apiRouter.use("/whos-who", whosWhoPublicRouter);
apiRouter.use("/whos-who-manager", whosWhoManagerRouter);
// Online mutation applications from the public (migration 131).
apiRouter.use("/public/mutation", publicMutationRouter);
apiRouter.use("/public/new-holding", publicNewHoldingRouter);
apiRouter.use("/public/streetlights", publicStreetlightRouter);
apiRouter.use("/public/submersibles", publicSubmersibleRouter);

// /admin/auth (public login) MUST be mounted before /admin (which
// requires an admin session for everything under it) - Express tries
// mounts in registration order, so the more specific path needs to win.
apiRouter.use("/admin/auth", adminAuthRouter);
apiRouter.use("/admin", adminRouter);