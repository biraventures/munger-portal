import { Router } from "express";
import { propertyRouter } from "./property.routes";
import { dashboardSummaryRouter } from "./dashboardSummary.routes";
import { taxCollectorRouter } from "./taxCollector.routes";
import { tcAuthRouter } from "./tcAuth.routes";

export const mobileRouter = Router();

mobileRouter.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});
// mobileRouter.use("/auth", authRouter);
mobileRouter.use("/properties", propertyRouter);
// mobileRouter.use(
//   "/properties",
//   (req, res, next) => {
//     console.log("fhdhgdghghfc");
//     next();
//   },
//   propertyRouter,
// );
mobileRouter.use("/tax-collectors", taxCollectorRouter);
;
mobileRouter.use("/dashboard-summary", dashboardSummaryRouter);

//Tc auth routes
mobileRouter.use("/tc", tcAuthRouter);
