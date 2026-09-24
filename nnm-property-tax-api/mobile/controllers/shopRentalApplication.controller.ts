import type { Request, Response } from "express";
import { z } from "zod";
import {
  submitRentalApplication,
  submitPublicRentalApplication,
  approveRentalApplication,
  rejectRentalApplication,
  listRentalApplications,
  getRentalApplicationDetail,
} from "../services/shopRentalApplication.service";
import { SHOP_APPROVAL_STAGE_ORDER } from "../types/admin.types";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const applicationInputSchema = z.object({
  shopNo: z.string().trim().min(1).max(32),
  applicantName: z.string().min(1),
  applicantRelationType: z.enum(["S/O", "D/O", "W/O", "C/O"]).nullish(),
  applicantRelationName: z.string().nullish(),
  applicantMobile: z.string().nullish(),
  applicantAddress: z.string().nullish(),
  applicantIdProofNumber: z.string().nullish(),
  applicantBusinessName: z.string().nullish(),
  proposedMonthlyRent: z.coerce.number().positive(),
  applicantPropertyHoldingNo: z.string().nullish(),
});

/** POST /api/v1/shop-rental-applications — operator only, shop must currently be vacant. */
export const postSubmitRentalApplication = asyncHandler(async (req: Request, res: Response) => {
  const parsed = applicationInputSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid application data", parsed.error.flatten().fieldErrors);

  const operatorDisplayName = req.operator!.displayName;
  const result = await submitRentalApplication(parsed.data, operatorDisplayName);
  res.status(200).json(result);
});

/** POST /api/v1/shop-rental-applications/public — public, a citizen applying for a vacant shop directly. */
export const postSubmitPublicRentalApplication = asyncHandler(async (req: Request, res: Response) => {
  const parsed = applicationInputSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid application data", parsed.error.flatten().fieldErrors);

  const result = await submitPublicRentalApplication(parsed.data);
  res.status(200).json(result);
});

const listQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  myStage: z.string().optional().transform((v) => v === "true"),
});

/** GET /api/v1/admin/shop-rental-applications?status=pending&myStage=true */
export const getRentalApplications = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Invalid query", parsed.error.flatten().fieldErrors);

  const admin = req.admin!;
  const applications = await listRentalApplications(parsed.data.status, parsed.data.myStage ? admin.role : undefined);
  res.status(200).json({ applications, myRole: admin.role, stageOrder: SHOP_APPROVAL_STAGE_ORDER });
});

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

/** GET /api/v1/admin/shop-rental-applications/:id */
export const getRentalApplicationById = asyncHandler(async (req: Request, res: Response) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid id");
  const detail = await getRentalApplicationDetail(parsed.data.id);
  res.status(200).json(detail);
});

const decisionBodySchema = z.object({ notes: z.string().optional() });

/** POST /api/v1/admin/shop-rental-applications/:id/approve */
export const postApproveRentalApplication = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = idParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid id");
  const bodyParsed = decisionBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input");

  const updated = await approveRentalApplication(paramsParsed.data.id, req.admin!, bodyParsed.data.notes);
  res.status(200).json({ application: updated });
});

const rejectBodySchema = z.object({ notes: z.string().min(1, "A reason is required to reject") });

/** POST /api/v1/admin/shop-rental-applications/:id/reject */
export const postRejectRentalApplication = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = idParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid id");
  const bodyParsed = rejectBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("A reason is required to reject", bodyParsed.error.flatten().fieldErrors);

  const updated = await rejectRentalApplication(paramsParsed.data.id, req.admin!, bodyParsed.data.notes);
  res.status(200).json({ application: updated });
});