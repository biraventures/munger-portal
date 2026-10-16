import type { Request, Response } from "express";
import { z } from "zod";
import { holdingNoSchema } from "../utils/holdingNoSchema";
import {
  submitTradeLicenseApplication,
  submitPublicTradeLicenseApplication,
  getRenewalAutofill,
  approveTradeLicenseApplication,
  rejectTradeLicenseApplication,
  listTradeLicenseApplications,
  getTradeLicenseApplicationDetail,
  getTradeLicenseApplicationByNumber,
  updateDocumentChecklistItem,
  getTradeLicenseReportingStats,
} from "../services/tradeLicenseApplication.service";
import { TRADE_LICENSE_APPROVAL_STAGE_ORDER } from "../types/admin.types";
import fs from "node:fs";
import { asyncHandler } from "../middleware/asyncHandler";
import { applicationDocumentFile, stageDocument } from "../services/tradeLicenseDocuments.service";
import { ApiError } from "../utils/ApiError";

const applicationInputSchema = z.object({
  applicationType: z.enum(["new", "renewal"]),
  bplProofAttached: z.boolean().default(false),
  applicantName: z.string().min(1),
  relationType: z.enum(["S/O", "W/O"]).nullish(),
  relationName: z.string().nullish(),
  entityName: z.string().min(1),
  entityNameHindi: z.string().nullish(),
  entityType: z.enum(["fully_owned", "partnership", "pvt_limited", "public_ltd"]).nullish(),
  completeAddress: z.string().min(1),
  holdingNo: holdingNoSchema.nullish(),
  holdingReceiptAttached: z.boolean().default(false),
  typeOfBusiness: z.string().nullish(),
  durationYears: z.coerce.number().refine((v) => [1, 3, 5].includes(v), "Duration must be 1, 3, or 5 years"),
  tanOrGstrNumber: z.string().nullish(),
  panNumber: z.string().nullish(),
  mobile: z.string().nullish(),
  email: z.string().email().nullish().or(z.literal("")),
  commercialAreaSqft: z.coerce.number().min(0).nullish(),
  areaOwnership: z.enum(["self_owned", "rented"]).nullish(),
  houseownerName: z.string().nullish(),
  annualTurnoverBracket: z.enum(["upto_10L", "above_10L"]).nullish(),
  isBpl: z.boolean().nullish(),
  isGstRegistered: z.boolean().nullish(),
  firmPanNumber: z.string().trim().max(20).nullish(),
  businessCategory: z.string().max(255).nullish(),
  isNnmShop: z.boolean().nullish(),
  nnmShopNo: z.string().trim().max(50).nullish(),
  documents: z.array(z.object({ id: z.union([z.string().regex(/^\d+$/), z.number().int().positive()]), token: z.string().regex(/^[0-9a-f]{48}$/) })).max(12).default([]),
});

/** The online form must answer the yes/no questions and name the type of business. */
const publicApplicationInputSchema = applicationInputSchema.extend({
  isBpl: z.boolean({ required_error: "Answer whether the applicant is BPL." }),
  isGstRegistered: z.boolean({ required_error: "Answer whether the business is registered under GST." }),
  isNnmShop: z.boolean({ required_error: "Answer whether the business is in a Nagar Nigam Munger stall/shop." }),
  businessCategory: z.string({ required_error: "Choose the type of business." }).min(1, "Choose the type of business.").max(255),
  areaOwnership: z.enum(["self_owned", "rented"], { required_error: "Choose whether the business premises are self-owned or rented / leased." }),
  mobile: z.string().transform((v) => v.replace(/[\s-]/g, "").replace(/^(\+91|91|0)(?=\d{10}$)/, "")).pipe(z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number.")),
});

/** POST /api/v1/trade-license-applications — operator only, for an application received offline. */
export const postSubmitTradeLicenseApplication = asyncHandler(async (req: Request, res: Response) => {
  const parsed = applicationInputSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0]?.message ?? "Invalid application data", parsed.error.flatten().fieldErrors);

  const operatorDisplayName = req.operator!.displayName;
  const { documents, ...input } = parsed.data;
  const result = await submitTradeLicenseApplication(input, operatorDisplayName, null, documents);
  res.status(200).json(result);
});

/** POST /api/v1/trade-license-applications/public — public, a citizen applying directly. */
export const postSubmitPublicTradeLicenseApplication = asyncHandler(async (req: Request, res: Response) => {
  const parsed = publicApplicationInputSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0]?.message ?? "Invalid application data", parsed.error.flatten().fieldErrors);

  const { documents, ...input } = parsed.data;
  const result = await submitPublicTradeLicenseApplication(input, documents);
  res.status(200).json(result);
});

const renewalAutofillQuerySchema = z.object({ holdingNo: holdingNoSchema, mobile: z.string().transform((v) => v.replace(/[\s-]/g, "")).pipe(z.string().regex(/^(\+?91|0)?[6-9]\d{9}$/, "Enter the 10-digit mobile number registered on your last application")) });

/** GET /api/v1/trade-license-applications/renewal-autofill?holdingNo=...&mobile=... — public, but only answers when the mobile matches the one on the holding's last application. */
export const getRenewalAutofillHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = renewalAutofillQuerySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0]?.message ?? "Invalid holding number or mobile number");
  const result = await getRenewalAutofill(parsed.data.holdingNo, parsed.data.mobile);
  res.locals.autofillMatched = result.found; // lets the rate limiter count only misses
  res.status(200).json(result);
});

const listQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  myStage: z.string().optional().transform((v) => v === "true"),
});

/** GET /api/v1/admin/trade-license-applications?status=pending&myStage=true */
export const getTradeLicenseApplications = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Invalid query", parsed.error.flatten().fieldErrors);

  const admin = req.admin!;
  const applications = await listTradeLicenseApplications(parsed.data.status, parsed.data.myStage ? admin.role : undefined);
  res.status(200).json({ applications, myRole: admin.role, stageOrder: TRADE_LICENSE_APPROVAL_STAGE_ORDER });
});

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

/** GET /api/v1/admin/trade-license-applications/:id */
export const getTradeLicenseApplicationById = asyncHandler(async (req: Request, res: Response) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid id");
  const detail = await getTradeLicenseApplicationDetail(parsed.data.id);
  res.status(200).json(detail);
});

const decisionBodySchema = z.object({ notes: z.string().optional() });

/** POST /api/v1/admin/trade-license-applications/:id/approve */
export const postApproveTradeLicenseApplication = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = idParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid id");
  const bodyParsed = decisionBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input");

  const updated = await approveTradeLicenseApplication(paramsParsed.data.id, req.admin!, bodyParsed.data.notes);
  res.status(200).json({ application: updated });
});

const rejectBodySchema = z.object({ notes: z.string().min(1, "A reason is required to reject") });

/** POST /api/v1/admin/trade-license-applications/:id/reject */
export const postRejectTradeLicenseApplication = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = idParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid id");
  const bodyParsed = rejectBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("A reason is required to reject", bodyParsed.error.flatten().fieldErrors);

  const updated = await rejectTradeLicenseApplication(paramsParsed.data.id, req.admin!, bodyParsed.data.notes);
  res.status(200).json({ application: updated });
});

const applicationNumberParamSchema = z.object({ applicationNumber: z.string().trim().min(1) });

/** GET /api/v1/trade-license-applications/by-number/:applicationNumber — operator only. */
export const getTradeLicenseApplicationByNumberHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = applicationNumberParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid application number");
  const detail = await getTradeLicenseApplicationByNumber(parsed.data.applicationNumber);
  res.status(200).json(detail);
});

const checklistParamSchema = z.object({ checklistItemId: z.coerce.number().int().positive() });
const checklistBodySchema = z.object({ submitted: z.boolean(), comments: z.string().nullish() });

/** PUT /api/v1/trade-license-applications/checklist/:checklistItemId — operator only. */
export const putDocumentChecklistItem = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = checklistParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid checklist item id");
  const bodyParsed = checklistBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  const checkedBy = req.operator!.displayName;
  const updated = await updateDocumentChecklistItem(paramsParsed.data.checklistItemId, bodyParsed.data.submitted, bodyParsed.data.comments ?? null, checkedBy);
  res.status(200).json({ item: updated });
});

/** GET /api/v1/admin/trade-license-applications/stats — admin only, the reporting dashboard. */
export const getTradeLicenseStats = asyncHandler(async (_req: Request, res: Response) => {
  const stats = await getTradeLicenseReportingStats();
  res.status(200).json(stats);
});
/** POST /api/v1/trade-license-applications/documents?type=&fileName= — public: one file (raw body), returns {id, token} to submit with the application. */
export const postStageTradeLicenseDocument = asyncHandler(async (req: Request, res: Response) => {
  const type = String(req.query.type ?? "");
  const fileName = typeof req.query.fileName === "string" ? req.query.fileName : "";
  res.status(201).json(await stageDocument(req, type, fileName));
});

const docParamSchema = z.object({ id: z.coerce.number().int().positive(), docId: z.coerce.number().int().positive() });

/** GET /api/v1/admin/trade-license-applications/:id/documents/:docId (and the operator equivalent) — the uploaded file. */
export const getTradeLicenseDocumentFile = asyncHandler(async (req: Request, res: Response) => {
  const p = docParamSchema.safeParse(req.params);
  if (!p.success) throw ApiError.badRequest("Invalid id");
  const f = await applicationDocumentFile(p.data.id, p.data.docId);
  res.setHeader("Content-Type", f.mime);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", `inline; filename="${f.fileName.replace(/[^\w.\- ]/g, "_")}"`);
  fs.createReadStream(f.full).pipe(res);
});
