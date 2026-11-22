import fs from "node:fs";
import path from "node:path";
import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { holdingNoSchema } from "../utils/holdingNoSchema";
import {
  decideReceivingRemoval,
  getNotice,
  listSurveys,
  pendingRemovalCount,
  receivingLog,
  removedCopyFile,
  requestReceivingRemoval,
  markComplied,
  markPrinted,
  noticesToPrint,
  receivingCopyFile,
  recordSurvey,
  surveyFile,
  uploadReceivingCopy,
} from "../services/tradeLicenseNotice.service";

const fyRegex = /^\d{4}-\d{4}$/;
const mobile = z.string().trim().transform((s) => s.replace(/[\s-]/g, "").replace(/^(\+91|91|0)(?=\d{10}$)/, "")).pipe(z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit phone number."));
const fileSchema = z.object({ base64: z.string().min(1), mime: z.string().min(1).max(40) });

const surveySchema = z.object({
  holdingNo: holdingNoSchema,
  hasLicense: z.boolean(),
  licenseYear: z.string().regex(fyRegex).nullish(),
  licenseValidTill: z.string().regex(fyRegex).nullish(),
  licenseNo: z.string().trim().max(50).nullish(),
  licensePhoto: fileSchema.nullish(),
  personName: z.string().trim().max(255).nullish(),
  businessName: z.string().trim().max(255).nullish(),
  address: z.string().trim().max(500).nullish(),
  phone: mobile.nullish().or(z.literal("")),
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
  gpsAccuracyM: z.number().min(0).max(100000).nullish(),
  isNnmShop: z.boolean({ required_error: "Answer whether the business is in a Nagar Nigam stall/shop." }),
  nnmShopNo: z.string().trim().max(50).nullish(),
});

/** POST /api/v1/admin/tl-survey - Tax Collector records a business visit (and a notice is raised when needed). */
export const postTlSurvey = asyncHandler(async (req: Request, res: Response) => {
  const b = surveySchema.safeParse(req.body);
  if (!b.success) throw ApiError.badRequest(b.error.issues[0]?.message ?? "Check the form.", b.error.flatten().fieldErrors);
  res.status(201).json(await recordSurvey({ ...b.data, phone: b.data.phone || null }, req.admin!));
});

const listQuery = z.object({
  status: z.enum(["licensed", "notice_1", "notice_2", "legal_action_due", "complied"]).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  q: z.string().trim().max(60).optional(),
  receiving: z.enum(["missing", "uploaded", "removal"]).optional(),
});

/** GET /api/v1/admin/tl-surveys - own records for a Tax Collector; all for the City Manager and senior officers. */
export const getTlSurveys = asyncHandler(async (req: Request, res: Response) => {
  const q = listQuery.safeParse(req.query);
  if (!q.success) throw ApiError.badRequest("Invalid filters");
  const mine = req.admin!.role === "tax_collector";
  res.status(200).json({ surveys: await listSurveys({ ...q.data, q: q.data.q || undefined, recordedBy: mine ? req.admin!.username : undefined }) });
});

/** GET /api/v1/admin/tl-notices/print-queue?date=&all=1 - Tax Collector's notices to print (unprinted by default). */
export const getTlPrintQueue = asyncHandler(async (req: Request, res: Response) => {
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().safeParse(req.query.date || undefined);
  if (!date.success) throw ApiError.badRequest("Invalid date");
  res.status(200).json({ notices: await noticesToPrint(req.admin!.username, { date: date.data, includePrinted: req.query.all === "1" }) });
});

/** POST /api/v1/admin/tl-notices/mark-printed { ids } */
export const postTlMarkPrinted = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ ids: z.array(z.coerce.number().int().positive()).min(1).max(500) }).safeParse(req.body);
  if (!b.success) throw ApiError.badRequest("Invalid request");
  res.status(200).json({ marked: await markPrinted(b.data.ids.map(String), req.admin!.username, req.admin!.displayName) });
});

/** GET /api/v1/admin/tl-notices/:id - one notice (reprint). */
export const getTlNotice = asyncHandler(async (req: Request, res: Response) => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!id.success) throw ApiError.badRequest("Invalid id");
  res.status(200).json({ notice: await getNotice(String(id.data)) });
});

/** POST /api/v1/admin/tl-surveys/:id/complied { licenseYear, licenseValidTill, licenseNo, photo } */
export const postTlComplied = asyncHandler(async (req: Request, res: Response) => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  const b = z.object({ licenseYear: z.string().regex(fyRegex, "Choose the licence year."), licenseValidTill: z.string().regex(fyRegex, "Choose the valid-till year."), licenseNo: z.string().trim().max(50).nullish(), photo: fileSchema }).safeParse(req.body);
  if (!id.success) throw ApiError.badRequest("Invalid id");
  if (!b.success) throw ApiError.badRequest(b.error.issues[0]?.message ?? "Upload the licence copy.");
  await markComplied(String(id.data), b.data, req.admin!);
  res.status(200).json({ ok: true });
});

/** GET /api/v1/admin/tl-surveys/:id/file/:which (license | complied) */
export const getTlSurveyFile = asyncHandler(async (req: Request, res: Response) => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  const which = z.enum(["license", "complied"]).safeParse(req.params.which);
  if (!id.success || !which.success) throw ApiError.badRequest("Invalid request");
  const full = await surveyFile(String(id.data), which.data, req.admin!);
  const ext = path.extname(full).toLowerCase();
  res.setHeader("Content-Type", ext === ".pdf" ? "application/pdf" : ext === ".png" ? "image/png" : "image/jpeg");
  res.setHeader("X-Content-Type-Options", "nosniff");
  fs.createReadStream(full).pipe(res);
});

/** POST /api/v1/admin/tl-notices/:id/receiving { photo, latitude, longitude } - the signed receiving half, photographed. */
export const postTlReceivingCopy = asyncHandler(async (req: Request, res: Response) => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  const b = z
    .object({ photo: fileSchema, latitude: z.number().min(-90).max(90).nullish(), longitude: z.number().min(-180).max(180).nullish() })
    .safeParse(req.body);
  if (!id.success) throw ApiError.badRequest("Invalid id");
  if (!b.success) throw ApiError.badRequest("Take a photo of the receiving copy or attach it (photo / PDF).");
  await uploadReceivingCopy(String(id.data), b.data, req.admin!);
  res.status(200).json({ ok: true });
});

/** GET /api/v1/admin/tl-notices/:id/receiving - the receiving copy photo. */
export const getTlReceivingCopy = asyncHandler(async (req: Request, res: Response) => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!id.success) throw ApiError.badRequest("Invalid id");
  res.sendFile(await receivingCopyFile(String(id.data), req.admin!));
});

const noticeId = (v: unknown) => {
  const id = z.coerce.number().int().positive().safeParse(v);
  if (!id.success) throw ApiError.badRequest("Invalid id");
  return String(id.data);
};

/** POST /api/v1/admin/tl-notices/:id/receiving/remove-request { reason } - ask the DMC to remove an uploaded receiving copy. */
export const postTlReceivingRemovalRequest = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ reason: z.string().trim().min(5, "Write why the receiving copy should be removed").max(500) }).safeParse(req.body);
  if (!b.success) throw ApiError.badRequest(b.error.issues[0]?.message ?? "Write the reason.");
  await requestReceivingRemoval(noticeId(req.params.id), b.data.reason, req.admin!);
  res.status(200).json({ ok: true });
});

/** POST /api/v1/admin/tl-notices/:id/receiving/remove-decision { approve, remark } - DMC. */
export const postTlReceivingRemovalDecision = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ approve: z.boolean(), remark: z.string().trim().max(500).nullish() }).safeParse(req.body);
  if (!b.success) throw ApiError.badRequest("Approve or reject.");
  await decideReceivingRemoval(noticeId(req.params.id), b.data.approve, b.data.remark ?? null, req.admin!);
  res.status(200).json({ ok: true });
});

/** GET /api/v1/admin/tl-notices/:id/receiving/log - uploads, removal requests and decisions. */
export const getTlReceivingLog = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({ log: await receivingLog(noticeId(req.params.id)) });
});

/** GET /api/v1/admin/tl-notices/receiving-removed/:logId - a removed receiving copy. */
export const getTlRemovedCopy = asyncHandler(async (req: Request, res: Response) => {
  res.sendFile(await removedCopyFile(noticeId(req.params.logId)));
});

/** GET /api/v1/admin/tl-notices/receiving-removals/count - removals waiting for the DMC. */
export const getTlRemovalCount = asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json({ pending: await pendingRemovalCount() });
});
