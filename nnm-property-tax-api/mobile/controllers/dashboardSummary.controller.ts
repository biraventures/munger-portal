import type { Request, Response } from "express";
import {
  getDashboardSummary,
  listHoldingsForDashboard,
  listPropertyChangesForDashboard,
  listShopsForDashboard,
  listShopApplicationsForDashboard,
  listTradeLicenseApplicationsForDashboard,
  listTradeLicensesIssuedForDashboard,
} from "../services/dashboardSummary.service";
import { asyncHandler } from "../middleware/asyncHandler";

/** GET /api/v1/dashboard-summary — operator or admin. One aggregated read for the dashboard overview widget. */
export const getDashboardSummaryHandler = asyncHandler(async (_req: Request, res: Response) => {
  const summary = await getDashboardSummary();
  res.status(200).json(summary);
});

/** GET /api/v1/dashboard-summary/holdings?page=&pageSize=&ward= */
export const getDashboardHoldingsHandler = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json(await listHoldingsForDashboard(req.query.page, req.query.pageSize, req.query.ward));
});

/** GET /api/v1/dashboard-summary/property-changes?page=&pageSize= */
export const getDashboardPropertyChangesHandler = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json(await listPropertyChangesForDashboard(req.query.page, req.query.pageSize));
});

/** GET /api/v1/dashboard-summary/shops?page=&pageSize= */
export const getDashboardShopsHandler = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json(await listShopsForDashboard(req.query.page, req.query.pageSize));
});

/** GET /api/v1/dashboard-summary/shop-applications?page=&pageSize= */
export const getDashboardShopApplicationsHandler = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json(await listShopApplicationsForDashboard(req.query.page, req.query.pageSize));
});

/** GET /api/v1/dashboard-summary/trade-license-applications?page=&pageSize= */
export const getDashboardTradeLicenseApplicationsHandler = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json(await listTradeLicenseApplicationsForDashboard(req.query.page, req.query.pageSize));
});

/** GET /api/v1/dashboard-summary/trade-licenses-issued?page=&pageSize= */
export const getDashboardTradeLicensesIssuedHandler = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json(await listTradeLicensesIssuedForDashboard(req.query.page, req.query.pageSize));
});