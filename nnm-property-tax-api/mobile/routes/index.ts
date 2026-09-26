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

// /admin/auth (public login) MUST be mounted before /admin (which
// requires an admin session for everything under it) - Express tries
// mounts in registration order, so the more specific path needs to win.
apiRouter.use("/admin/auth", adminAuthRouter);
apiRouter.use("/admin", adminRouter);