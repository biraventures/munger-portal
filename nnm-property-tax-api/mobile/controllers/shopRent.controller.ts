import type { Request, Response } from "express";
import { z } from "zod";
import {
  generateRentDemand,
  listUnsettledShopDemands,
  getDemandNoticeForPrint,
  listShopDemandHistory,
} from "../services/shopRentDemand.service";
import { submitShopRentPayment, getShopReceiptForReprint, listShopPaymentHistory } from "../services/shopRentPayment.service";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const shopNoParamSchema = z.object({ shopNo: z.string().trim().min(1).max(32) });

const generateDemandSchema = z.object({
  monthsToCover: z.coerce.number().int().min(1).max(12).default(1),
});

/** POST /api/v1/shops/:shopNo/rent-demand — operator only. monthsToCover=1 for a monthly demand, up to 12 for annual. */
export const postGenerateRentDemand = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = shopNoParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid shop number");

  const bodyParsed = generateDemandSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  const generatedBy = req.operator!.displayName;
  const result = await generateRentDemand(paramsParsed.data.shopNo, bodyParsed.data.monthsToCover, generatedBy);
  res.status(200).json(result);
});

/** GET /api/v1/shops/:shopNo/rent-demands/unsettled — operator only, feeds the payment picker. */
export const getUnsettledRentDemands = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = shopNoParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid shop number");

  const demands = await listUnsettledShopDemands(paramsParsed.data.shopNo);
  res.status(200).json({ demands });
});

const demandNoParamSchema = z.object({ demandNo: z.string().trim().min(1) });

/** GET /api/v1/shop-rent-demands/:demandNo/print — operator only. */
export const getPrintableDemandNotice = asyncHandler(async (req: Request, res: Response) => {
  const parsed = demandNoParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid demand number");
  const notice = await getDemandNoticeForPrint(parsed.data.demandNo);
  res.status(200).json(notice);
});

const paymentSchema = z.object({
  demandNo: z.string().min(1, "Select a rent demand to pay against"),
  paymentMode: z.string().min(1),
  counter: z.string().trim().max(50).nullish(),
});

/** POST /api/v1/shops/:shopNo/rent-payments — operator only. */
export const postShopRentPaymentHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = shopNoParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid shop number");

  const bodyParsed = paymentSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid payment data", bodyParsed.error.flatten().fieldErrors);

  const collectedBy = req.operator!.displayName;
  const result = await submitShopRentPayment(paramsParsed.data.shopNo, bodyParsed.data, collectedBy);
  res.status(200).json(result);
});

/** GET /api/v1/shops/:shopNo/rent-demands/history — operator or admin. Every demand ever generated, settled or not. */
export const getShopDemandHistory = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = shopNoParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid shop number");

  const history = await listShopDemandHistory(paramsParsed.data.shopNo);
  res.status(200).json({ history });
});

const receiptNoParamSchema = z.object({ receiptNo: z.string().trim().min(1) });

/** GET /api/v1/shops/rent-payments/:receiptNo/print — operator or admin. Read-only reprint. */
export const getShopReceiptReprint = asyncHandler(async (req: Request, res: Response) => {
  const parsed = receiptNoParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid receipt number");
  const receipt = await getShopReceiptForReprint(parsed.data.receiptNo);
  res.status(200).json(receipt);
});

/** GET /api/v1/shops/:shopNo/rent-payments/history — operator or admin. Every payment ever collected. */
export const getShopPaymentHistory = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = shopNoParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid shop number");

  const history = await listShopPaymentHistory(paramsParsed.data.shopNo);
  res.status(200).json({ history });
});