import type { Request, Response } from "express";
import { z } from "zod";
import { shopRepository } from "../repositories/shop.repository";
import { searchShopByShopNo, searchShopForCitizen } from "../services/shopSearch.service";
import { getPerSqftRateReport } from "../services/shopReporting.service";
import { getNextShopNoForMarket } from "../services/shopNumbering.service";
import { importShopsCsv } from "../services/shopCsvImport.service";
import { KNOWN_MARKET_CODES } from "../constants/marketCodes";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const shopNoParamSchema = z.object({ shopNo: z.string().trim().min(1).max(32) });

/** GET /api/v1/shops/:shopNo — operator/admin only, shop number alone is enough for trusted staff. */
export const getShopByShopNo = asyncHandler(async (req: Request, res: Response) => {
  const parsed = shopNoParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid shop number");
  const result = await searchShopByShopNo(parsed.data.shopNo);
  if (!result.found) throw ApiError.notFound(result.message ?? "Shop not found");
  res.status(200).json(result);
});

const lookupBodySchema = z.object({
  shopNo: z.string().trim().min(1, "Shop number is required").max(32),
  mobileNo: z.string().trim().min(1, "Mobile number is required").max(15),
});

/** POST /api/v1/shops/lookup — public, two-factor citizen search (same pattern as property tax's postPropertyLookup, including the masked mobile hint on mismatch). */
export const postShopLookup = asyncHandler(async (req: Request, res: Response) => {
  const parsed = lookupBodySchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);
  const result = await searchShopForCitizen(parsed.data.shopNo, parsed.data.mobileNo);
  if (!result.found) {
    throw ApiError.notFound(result.message ?? "No matching shop found.", {
      mobileMismatch: result.mobileMismatch ?? false,
      registeredMobileLastTwoDigits: result.registeredMobileLastTwoDigits ?? null,
    });
  }
  res.status(200).json(result);
});

/**
 * GET /api/v1/shops/vacant - public. Lists vacant shops (no personal
 * data) so citizens can browse what's available before applying.
 * Requires publication_stage='approved' in addition to status='vacant'
 * - a newly-entered shop otherwise appeared here immediately (status
 * defaults to 'vacant' on creation), before Stall Prabhari, City
 * Manager, and Deputy Commissioner had a chance to review it, drawing
 * unnecessary public attention to unconfirmed entries.
 */
export const listVacantShops = asyncHandler(async (_req: Request, res: Response) => {
  const allShops = await shopRepository.listAll();
  const vacant = allShops
    .filter((s) => s.status === "vacant" && s.publication_stage === "approved")
    .map((s) => ({ shopNo: s.shop_no, marketName: s.market_name, location: s.location, areaSqft: s.area_sqft }));
  res.status(200).json({ shops: vacant });
});

const createShopSchema = z.object({
  shopNo: z.string().trim().min(1).max(32),
  marketName: z.string().nullish(),
  location: z.string().trim().nullish(),
  ward: z.string().nullish(),
  areaSqft: z.coerce.number().min(0).nullish(),
  totalAreaSqft: z.coerce.number().min(0).nullish(),
  builtUpAreaSqft: z.coerce.number().min(0).nullish(),
  status: z.enum(["vacant", "occupied", "under_notice", "terminated"]).optional(),
});

/** POST /api/v1/shops — operator only. Shop physical details are direct, no approval chain (only agreement changes are). */
export const postCreateShop = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createShopSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid shop data", parsed.error.flatten().fieldErrors);

  const existing = await shopRepository.findByShopNo(parsed.data.shopNo);
  if (existing) throw ApiError.badRequest(`Shop ${parsed.data.shopNo} already exists.`);

  const operatorDisplayName = req.operator!.displayName;
  await shopRepository.upsert(parsed.data.shopNo, parsed.data, operatorDisplayName, true);
  res.status(201).json({ shopNo: parsed.data.shopNo });
});

/** GET /api/v1/admin/shops — admin only, full listing (for the categorized/export views). */
export const listAllShops = asyncHandler(async (_req: Request, res: Response) => {
  const shops = await shopRepository.listAll();
  res.status(200).json({ shops });
});

/** GET /api/v1/admin/shops/per-sqft-report — admin only. */
export const getPerSqftReport = asyncHandler(async (_req: Request, res: Response) => {
  const entries = await getPerSqftRateReport();
  res.status(200).json({ entries });
});

/** GET /api/v1/shops/markets — operator only. Known markets (from the migrated data) plus any already used in the live shops table, for the market dropdown. */
export const getMarketList = asyncHandler(async (_req: Request, res: Response) => {
  const usedMarkets = await shopRepository.listDistinctMarketNames();
  const known = Object.keys(KNOWN_MARKET_CODES);
  const combined = Array.from(new Set([...known, ...usedMarkets])).sort();
  res.status(200).json({ markets: combined });
});

const nextNumberQuerySchema = z.object({ marketName: z.string().trim().min(1) });

/** GET /api/v1/shops/next-number?marketName=... — operator only. Preview for a NEW shop's auto-generated number; an EXISTING/old shop is entered manually instead, bypassing this entirely. */
export const getNextShopNumber = asyncHandler(async (req: Request, res: Response) => {
  const parsed = nextNumberQuerySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Invalid market name");
  const shopNo = await getNextShopNoForMarket(parsed.data.marketName);
  res.status(200).json({ shopNo });
});

const csvUploadSchema = z.object({ csvContent: z.string().min(1, "File appears to be empty") });

/**
 * POST /api/v1/admin/shops/bulk-upload - commissioner only. Creates
 * shops directly (bypassing the operator/approval flow entirely,
 * since this is a bulk data-load, not a day-to-day operation) and, for
 * any row with a Holder Name, a matching agreement via
 * shopAgreementRepository.insertPartial (data_status='partial') - see
 * shopCsvImport.service.ts for the exact expected columns.
 */
export const uploadShopsCsvHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = csvUploadSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);
  const result = await importShopsCsv(parsed.data.csvContent, req.admin!.displayName);
  res.status(200).json(result);
});

/**
 * GET /api/v1/shops - operator or admin. Every shop with its current
 * agreement summary in one call - powers the full-screen shop list
 * (shop no, market, rent paid till, rent, agreement date), replacing
 * a page that showed nothing until a specific shop number was typed in.
 */
export const listShopsWithSummary = asyncHandler(async (_req: Request, res: Response) => {
  const shops = await shopRepository.listAllWithAgreementSummary();
  res.status(200).json({
    shops: shops.map((s) => ({
      shopNo: s.shop_no,
      marketName: s.market_name,
      location: s.location,
      status: s.status,
      holderName: s.holder_name,
      baseMonthlyRent: s.base_monthly_rent,
      rentPaidTillMonth: s.rent_paid_till_month,
      agreementStartDate: s.agreement_start_date,
      latestDemandNo: s.latest_demand_no,
      latestDemandDate: s.latest_demand_date,
      demandHolderName: s.demand_holder_name,
      demandBaseRentAmount: s.demand_base_rent_amount,
    })),
  });
});