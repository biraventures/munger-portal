import type { Request, Response } from "express";
import { z } from "zod";
import {
  submitAgreementChange,
  approveShopAgreementChange,
  rejectShopAgreementChange,
  listShopAgreementChangeRequests,
  getShopAgreementChangeRequestDetail,
  getAgreementForPrint,
} from "../services/shopAgreement.service";
import { SHOP_APPROVAL_STAGE_ORDER } from "../types/admin.types";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const shopNoParamSchema = z.object({ shopNo: z.string().trim().min(1).max(32) });

const agreementInputSchema = z.object({
  agreementNumber: z.string().nullish(),
  agreementHolderName: z.string().nullish(),
  demandRegisterHolderName: z.string().nullish(),
  holderName: z.string().trim().nullish(),
  holderRelationType: z.enum(["S/O", "D/O", "W/O", "C/O"]).nullish(),
  holderRelationName: z.string().nullish(),
  holderMobile: z.string().nullish(),
  holderAddress: z.string().nullish(),
  idProofNumber: z.string().nullish(),
  agreementRent: z.coerce.number().min(0).nullish(),
  demandRegisterRent: z.coerce.number().min(0).nullish(),
  baseMonthlyRent: z.coerce.number().positive().nullish(),
  escalationPct: z.coerce.number().min(0).optional(),
  escalationIntervalYears: z.coerce.number().int().min(1).optional(),
  agreementStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").nullish(),
  agreementEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  securityDeposit: z.coerce.number().min(0).optional(),
  lateFeePctPerMonth: z.coerce.number().min(0).nullish(),
  jointHolderName: z.string().nullish(),
  jointHolderRelation: z.string().nullish(),
  jointHolderIdProofNumber: z.string().nullish(),
  presentOccupantName: z.string().nullish(),
  presentOccupantAadhaar: z
    .string()
    .regex(/^\d{4}\s?\d{4}\s?\d{4}$/, "Aadhaar number should be 12 digits")
    .nullish()
    .or(z.literal("")),
  presentOccupantYearsApprox: z.string().nullish(),
  notes: z.string().nullish(),
  dataStatus: z.enum(["complete", "partial"]).optional(),
  changeReason: z.string().min(1, "A reason is required"),
});

/** POST /api/v1/shops/:shopNo/agreement — operator only. Always queued for the full 5-stage approval chain. */
export const postSubmitAgreementChange = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = shopNoParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid shop number");

  const bodyParsed = agreementInputSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid agreement data", bodyParsed.error.flatten().fieldErrors);

  const operatorDisplayName = req.operator!.displayName;
  const result = await submitAgreementChange(
    paramsParsed.data.shopNo,
    { ...bodyParsed.data, shopNo: paramsParsed.data.shopNo },
    operatorDisplayName,
  );
  res.status(200).json(result);
});

const agreementIdParamSchema = z.object({ agreementId: z.coerce.number().int().positive() });

/** GET /api/v1/shops/agreements/:agreementId/print — operator only. The formal permit/agreement document. */
export const getPrintableAgreement = asyncHandler(async (req: Request, res: Response) => {
  const parsed = agreementIdParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid agreement id");
  const permit = await getAgreementForPrint(parsed.data.agreementId);
  res.status(200).json(permit);
});

const listQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  myStage: z.string().optional().transform((v) => v === "true"),
});

/** GET /api/v1/admin/shop-agreement-requests?status=pending&myStage=true */
export const getShopAgreementRequests = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Invalid query", parsed.error.flatten().fieldErrors);

  const admin = req.admin!;
  const requests = await listShopAgreementChangeRequests(parsed.data.status, parsed.data.myStage ? admin.role : undefined);
  res.status(200).json({ requests, myRole: admin.role, stageOrder: SHOP_APPROVAL_STAGE_ORDER });
});

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

/** GET /api/v1/admin/shop-agreement-requests/:id */
export const getShopAgreementRequestById = asyncHandler(async (req: Request, res: Response) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid id");
  const detail = await getShopAgreementChangeRequestDetail(parsed.data.id);
  res.status(200).json(detail);
});

const decisionBodySchema = z.object({ notes: z.string().optional() });

/** POST /api/v1/admin/shop-agreement-requests/:id/approve */
export const postApproveShopAgreementRequest = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = idParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid id");
  const bodyParsed = decisionBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input");

  const updated = await approveShopAgreementChange(paramsParsed.data.id, req.admin!, bodyParsed.data.notes);
  res.status(200).json({ request: updated });
});

const rejectBodySchema = z.object({ notes: z.string().min(1, "A reason is required to reject") });

/** POST /api/v1/admin/shop-agreement-requests/:id/reject */
export const postRejectShopAgreementRequest = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = idParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid id");
  const bodyParsed = rejectBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("A reason is required to reject", bodyParsed.error.flatten().fieldErrors);

  const updated = await rejectShopAgreementChange(paramsParsed.data.id, req.admin!, bodyParsed.data.notes);
  res.status(200).json({ request: updated });
});