import fs from "node:fs";
import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { env } from "../config/env";
import * as bp from "../services/buildingPermit.service";

const idParam = z.string().regex(/^\d{1,18}$/);
const mobile = z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number.");
const appNo = z.string().trim().regex(/^[A-Za-z0-9]{6,24}$/, "Enter the application number.");
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.");
const text = (max: number) => z.string().trim().max(max);

function token(req: Request): string {
  return req.header("x-upload-token") ?? (typeof req.query.token === "string" ? req.query.token : "");
}

function sendFile(res: Response, f: { fullPath: string; mime: string; name: string }, download = false) {
  if (!fs.existsSync(f.fullPath)) throw ApiError.notFound("The file is missing from storage.");
  res.setHeader("Content-Type", f.mime);
  res.setHeader("Content-Disposition", `${download ? "attachment" : "inline"}; filename="${f.name.replace(/"/g, "")}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  fs.createReadStream(f.fullPath).pipe(res);
}

// ------------------------------------------------------------------------------------------------------- public

export const getFeeRates = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ rates: bp.FEE_RATES, useTypes: bp.USE_TYPES, applicantDocs: bp.APPLICANT_DOCS, onlinePaymentEnabled: env.ONLINE_PAYMENT_ENABLED });
});

export const postCalculate = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ useType: z.string(), plotAreaSqm: z.coerce.number().positive(), builtUpSqm: z.coerce.number().positive().max(1e7) }).safeParse(req.body);
  if (!b.success) throw ApiError.badRequest("Enter the use, plot area and built-up area.");
  if (!bp.USE_TYPES[b.data.useType]) throw ApiError.badRequest("Choose the use of the building.");
  res.json(bp.computeFees(b.data.useType, b.data.plotAreaSqm, b.data.builtUpSqm));
});

const applicationSchema = z.object({
  applicantName: text(150).min(2, "Enter the applicant's name."),
  relationName: text(150).nullish(),
  mobile,
  email: z.string().trim().email("Enter a valid email or leave it blank.").max(150).nullish().or(z.literal("")),
  applicantAddress: text(500).min(5, "Enter the applicant's address."),
  aadhaarNo: z.string().trim().min(12, "Enter the 12-digit Aadhaar number.").max(14),
  panNo: text(10).nullish(),
  holdingNo: text(32).nullish(),
  ward: text(16).min(1, "Enter the ward number."),
  mauza: text(100).nullish(),
  thanaNo: text(20).nullish(),
  khataNo: text(50).min(1, "Enter the khata number."),
  khesraNo: text(50).min(1, "Enter the khesra (plot) number."),
  siteAddress: text(500).min(5, "Enter the address of the site."),
  plotAreaSqm: z.coerce.number().positive("Enter the plot area.").max(1e8),
  useType: z.string(),
  floors: z.array(z.object({ floor: text(40), areaSqm: z.coerce.number().min(0).max(1e7) })).min(1).max(30),
  architectName: text(150).min(2, "Enter the architect's name."),
  architectRegNo: text(60).min(2, "Enter the architect's UDHD registration number."),
  architectMobile: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid architect mobile or leave it blank.").nullish().or(z.literal("")),
});

function parseApplication(body: unknown) {
  const b = applicationSchema.safeParse(body);
  if (!b.success) throw ApiError.badRequest(b.error.issues[0]?.message ?? "Check the form.", b.error.flatten().fieldErrors);
  return { ...b.data, email: b.data.email || null, architectMobile: b.data.architectMobile || null };
}

export const postCreate = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await bp.createDraft(parseApplication(req.body), req.ip ?? null));
});

export const putDetails = asyncHandler(async (req: Request, res: Response) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) throw ApiError.notFound("Application not found.");
  res.json(await bp.updateDetails(id.data, token(req), parseApplication(req.body)));
});

export const postDocument = asyncHandler(async (req: Request, res: Response) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) throw ApiError.notFound("Application not found.");
  const docType = String(req.query.docType ?? "");
  const fileName = String(req.query.fileName ?? "document");
  res.status(201).json({ document: await bp.applicantAddDocument(req, id.data, token(req), docType, fileName) });
});

export const getDocuments = asyncHandler(async (req: Request, res: Response) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) throw ApiError.notFound("Application not found.");
  res.json({ documents: await bp.applicantDocuments(id.data, token(req)) });
});

export const deleteDocument = asyncHandler(async (req: Request, res: Response) => {
  const id = idParam.safeParse(req.params.id);
  const doc = idParam.safeParse(req.params.docId);
  if (!id.success || !doc.success) throw ApiError.notFound("Document not found.");
  await bp.applicantRemoveDocument(id.data, token(req), doc.data);
  res.json({ ok: true });
});

export const postSubmit = asyncHandler(async (req: Request, res: Response) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) throw ApiError.notFound("Application not found.");
  res.json(await bp.submit(id.data, token(req)));
});

const lookupSchema = z.object({ applicationNo: appNo, mobile });

export const postStatus = asyncHandler(async (req: Request, res: Response) => {
  const b = lookupSchema.safeParse(req.body);
  if (!b.success) throw ApiError.badRequest(b.error.issues[0]?.message ?? "Enter the application number and mobile number.");
  const view = await bp.applicantView(b.data.applicationNo, b.data.mobile);
  res.locals.lookupMatched = true;
  res.json({ ...view, permitDocuments: view.status === "approved" ? await bp.applicantPermitDocs(b.data.applicationNo, b.data.mobile) : [] });
});

export const postPermitLetter = asyncHandler(async (req: Request, res: Response) => {
  const b = lookupSchema.safeParse(req.body);
  if (!b.success) throw ApiError.badRequest("Enter the application number and mobile number.");
  res.json(await bp.applicantPermitLetter(b.data.applicationNo, b.data.mobile));
});

export const postPermitFile = asyncHandler(async (req: Request, res: Response) => {
  const b = lookupSchema.extend({ docId: idParam }).safeParse(req.body);
  if (!b.success) throw ApiError.badRequest("Invalid request.");
  sendFile(res, await bp.applicantPermitFile(b.data.applicationNo, b.data.mobile, b.data.docId), true);
});

export const postPayInitiate = asyncHandler(async (req: Request, res: Response) => {
  const b = lookupSchema.safeParse(req.body);
  if (!b.success) throw ApiError.badRequest("Enter the application number and mobile number.");
  res.json(await bp.initiateOnlinePayment(b.data.applicationNo, b.data.mobile));
});

/** POST /public/building-permit/pay/callback - bank form post; outcome comes only from the bank's status API. */
export const postPayCallback = asyncHandler(async (req: Request, res: Response) => {
  const orderId = typeof req.body?.merchantTxnNo === "string" ? req.body.merchantTxnNo.trim() : "";
  if (!/^[A-Za-z0-9-]{1,64}$/.test(orderId)) throw ApiError.badRequest("Invalid confirmation payload");
  const r = await bp.confirmOnlineOrder(orderId, req.body);
  const frontendUrl = env.FRONTEND_URL.replace(/\/+$/, "");
  const basePath = env.FRONTEND_BASE_PATH.replace(/^\/+|\/+$/g, "");
  const baseUrl = basePath && !frontendUrl.endsWith(`/${basePath}`) ? `${frontendUrl}/${basePath}` : frontendUrl;
  res.redirect(`${baseUrl}/building-permit/status?app=${encodeURIComponent(r.applicationNo ?? "")}&payment=${encodeURIComponent(r.status)}`);
});

// ------------------------------------------------------------------------------------------------------- office

const actor = (req: Request): bp.Actor => ({ username: req.admin!.username, role: req.admin!.role });
const remarks = z.string().trim().min(3, "Enter remarks.").max(2000);

function appId(req: Request): string {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) throw ApiError.notFound("Application not found.");
  return id.data;
}

export const getOfficeList = asyncHandler(async (req: Request, res: Response) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const q = typeof req.query.q === "string" ? req.query.q.slice(0, 50) : undefined;
  res.json(await bp.listForOffice({ status, q }));
});

export const getOfficeDetail = asyncHandler(async (req: Request, res: Response) => {
  res.json(await bp.detailForOffice(appId(req)));
});

export const getOfficeFile = asyncHandler(async (req: Request, res: Response) => {
  const doc = idParam.safeParse(req.params.docId);
  if (!doc.success) throw ApiError.notFound("Document not found.");
  sendFile(res, await bp.officeDocumentFile(appId(req), doc.data));
});

export const postOfficeDocument = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({ document: await bp.officeUpload(req, appId(req), String(req.query.docType ?? ""), String(req.query.fileName ?? "document"), actor(req)) });
});

export const deleteOfficeDocument = asyncHandler(async (req: Request, res: Response) => {
  const doc = idParam.safeParse(req.params.docId);
  if (!doc.success) throw ApiError.notFound("Document not found.");
  await bp.officeRemoveDocument(appId(req), doc.data);
  res.json({ ok: true });
});

export const postSiteReport = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ report: z.enum(["aa", "amin", "ae"]), finding: z.enum(["satisfactory", "not_satisfactory"]), remarks }).safeParse(req.body);
  if (!b.success) throw ApiError.badRequest(b.error.issues[0]?.message ?? "Invalid request");
  res.json(await bp.recordSiteReport(appId(req), b.data.report, b.data.finding, b.data.remarks, actor(req)));
});

export const postSiteComplete = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ remarks: z.string().trim().max(2000).nullish() }).safeParse(req.body ?? {});
  res.json(await bp.completeSiteVerification(appId(req), b.success ? b.data.remarks || null : null, actor(req)));
});

export const postScrutiny = asyncHandler(async (req: Request, res: Response) => {
  const b = z
    .object({ builtUpSqm: z.coerce.number().positive().max(1e7), plotAreaSqm: z.coerce.number().positive().max(1e8), useType: z.string(), remarks })
    .safeParse(req.body);
  if (!b.success) throw ApiError.badRequest(b.error.issues[0]?.message ?? "Enter the verified areas and remarks.");
  res.json(await bp.technicalScrutiny(appId(req), b.data, actor(req)));
});

export const postCounterPayment = asyncHandler(async (req: Request, res: Response) => {
  const b = z
    .object({ mode: z.enum(["Cash", "Demand Draft", "Bank Challan", "UPI", "Card", "NEFT/RTGS"]), ref: z.string().trim().min(2, "Enter the receipt / challan number.").max(80), paidOn: dateStr, amount: z.coerce.number().positive() })
    .safeParse(req.body);
  if (!b.success) throw ApiError.badRequest(b.error.issues[0]?.message ?? "Enter the payment details.");
  res.json(await bp.recordCounterPayment(appId(req), b.data, actor(req)));
});

export const postProcessing = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ physicalSets: z.boolean(), affidavitOriginal: z.boolean(), documentsVerified: z.boolean(), remarks: z.string().trim().max(2000).default("") }).safeParse(req.body);
  if (!b.success) throw ApiError.badRequest("Invalid request");
  res.json(await bp.completeProcessing(appId(req), b.data, actor(req)));
});

export const postAuthority = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ orderNo: z.string().trim().min(1, "Enter the order number.").max(80), orderDate: dateStr, remarks: z.string().trim().max(2000).nullish() }).safeParse(req.body);
  if (!b.success) throw ApiError.badRequest(b.error.issues[0]?.message ?? "Enter the order details.");
  res.json(await bp.recordAuthorityApproval(appId(req), { ...b.data, remarks: b.data.remarks ?? null }, actor(req)));
});

export const postIssue = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ validTill: dateStr }).safeParse(req.body);
  if (!b.success) throw ApiError.badRequest("Enter the validity date.");
  res.json(await bp.issuePermit(appId(req), b.data, actor(req)));
});

export const postReturn = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ remarks }).safeParse(req.body);
  if (!b.success) throw ApiError.badRequest("Write what the applicant must correct.");
  res.json(await bp.returnToApplicant(appId(req), b.data.remarks, actor(req)));
});

export const postReject = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ remarks }).safeParse(req.body);
  if (!b.success) throw ApiError.badRequest("Write the reason for rejection.");
  res.json(await bp.rejectApplication(appId(req), b.data.remarks, actor(req)));
});

export const getOfficePermitLetter = asyncHandler(async (req: Request, res: Response) => {
  res.json(await bp.officePermitLetter(appId(req)));
});
