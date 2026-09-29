import { Router } from "express";
import {
  getDashboardSummaryHandler,
  getDashboardHoldingsHandler,
} from "../../controllers/dashboardSummary.controller";
import { requireTaxCollector } from "../../middleware/requireTaxCollector";

export const dashboardSummaryRouter = Router();

dashboardSummaryRouter.use(requireTaxCollector);

dashboardSummaryRouter.get("/", getDashboardSummaryHandler);
dashboardSummaryRouter.get("/holdings", getDashboardHoldingsHandler);