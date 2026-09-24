import { Router } from "express";
import {
  getDashboardSummaryHandler,
  getDashboardHoldingsHandler,
  getDashboardPropertyChangesHandler,
  getDashboardShopsHandler,
  getDashboardShopApplicationsHandler,
  getDashboardTradeLicenseApplicationsHandler,
  getDashboardTradeLicensesIssuedHandler,
} from "../controllers/dashboardSummary.controller";
import { requireOperatorOrAdmin } from "../middleware/requireOperatorOrAdmin";

export const dashboardSummaryRouter = Router();

dashboardSummaryRouter.use(requireOperatorOrAdmin);

dashboardSummaryRouter.get("/", getDashboardSummaryHandler);
dashboardSummaryRouter.get("/holdings", getDashboardHoldingsHandler);
dashboardSummaryRouter.get("/property-changes", getDashboardPropertyChangesHandler);
dashboardSummaryRouter.get("/shops", getDashboardShopsHandler);
dashboardSummaryRouter.get("/shop-applications", getDashboardShopApplicationsHandler);
dashboardSummaryRouter.get("/trade-license-applications", getDashboardTradeLicenseApplicationsHandler);
dashboardSummaryRouter.get("/trade-licenses-issued", getDashboardTradeLicensesIssuedHandler);