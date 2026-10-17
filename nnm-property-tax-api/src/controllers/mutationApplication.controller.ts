import fs from "node:fs";
import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { holdingNoSchema } from "../utils/holdingNoSchema";
import {
  addDocument,
  applicationStatus,
  createDraft,
  documentFileForStaff,
  draftDocuments,
  getApplicationForStaff,
  linkApplicationToHolding,
  listApplications,
  lookupHoldingForMutation,
  rejectApplication,
  removeDocument,
  submitApplication,
  openForEdit,
  saveEdit,
  addEditDocument,
  removeEditDocument,
} from "../services/mutationApplication.service";
import { buildTimeline, publicTimeline } from "../services/mutationAudit.service";

const mobile = z.string().trim().transform((s) => s.replace(/[\s-]/g, "").replace(/^(\+91|91|0)(?=\d{10}$)/, "")).pipe(z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number."));
const landRecord = {
  khataNo: z.string().trim().max(64).nullish(),
  khesraNo: z.string().trim().max(64).nullish(),
  surveySheetNo: z.string().trim().max(64).nullish(),
  surveyWard: z.enum(["A", "B", "C", "D", "E", "F"]).nullish().or(z.literal("").transform(() => null)),
};
const yearRange = z.string().trim().regex(/^\d{4}-\d{4}$/, "Year as YYYY-YYYY, e.g. 2024-2025").nullish().or(z.literal(""));

/** GET /api/v1/public/mutation/holding/:holdingNo - ward, address, paid-till years and whether dues are pending. */
export const getHoldingForMutation = asyncHandler(async (req: Request, res: Response) => {
  const p = z.object({ holdingNo: holdingNoSchema }).safeParse(req.params);
  if (!p.success) throw ApiError.badRequest("Enter a valid holding number.");
  const result = await lookupHoldingForMutation(p.data.holdingNo);
  res.locals.lookupMatched = result.found;
  res.status(200).json(result);
});

const createSchema = z
  .object({
    holdingNo: z.string().trim().max(32).nullish(),
    manual: z
      .object({
        oldHoldingNo: z.string().trim().min(1, "Enter the old holding number.").max(32),
        ward: z.string().trim().min(1, "Enter the ward.").max(16),
        address: z.string().trim().min(3, "Enter the address.").max(500),
        taxPaidTillYear: yearRange,
        solidWastePaidTillYear: yearRange,
      })
      .nullish(),
    newOwnerName: z.string().trim().min(2, "Enter the new owner's name.").max(255),
    newOwnerRelationType: z.enum(["S/O", "D/O", "W/O", "C/O"]).nullish(),
    newOwnerRelationName: z.string().trim().max(255).nullish(),
    newOwnerMobile: mobile,
    newOwnerAadhaar: z.string().trim().transform((s) => s.replace(/\s/g, "")).pipe(z.string().regex(/^\d{12}$/, "Aadhaar number must be 12 digits.")),
    newOwnerEmail: z.string().trim().email("Enter a valid email address.").max(120).nullish().or(z.literal("")),
    applicantName: z.string().trim().min(2, "Enter the applicant's name.").max(255),
    applicantMobile: mobile,
    transferBasis: z.enum(["sale_deed", "partition", "gift", "inheritance", "auction"]),
    transferDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date of transfer."),
    latitude: z.number().min(24).max(27),
    longitude: z.number().min(85).max(88),
    gpsAccuracy: z.number().nonnegative().max(100000).nullish(),
    ...landRecord,
  })
  .refine((d) => !!d.holdingNo || !!d.manual, { message: "Enter the holding number, or the old holding number with the ward." });

/** POST /api/v1/public/mutation/applications - starts a draft; returns its id and the upload token for the documents. */
export const postCreateApplication = asyncHandler(async (req: Request, res: Response) => {
  const b = createSchema.safeParse(req.body);
  if (!b.success) {
    const first = b.error.issues[0];
    throw ApiError.badRequest(first?.path[0] === "latitude" || first?.path[0] === "longitude" ? "Capture the GPS location at the holding (within Munger)." : first?.message ?? "Check the form.", b.error.flatten().fieldErrors);
  }
  res.status(201).json(await createDraft({ ...b.data, newOwnerEmail: b.data.newOwnerEmail || null }, req.ip ?? null));
});

const idParam = z.string().regex(/^\d{1,18}$/);
function token(req: Request): string {
  const t = req.header("x-upload-token") ?? (typeof req.query.token === "string" ? req.query.token : "");
  return t.slice(0, 100);
}

/** POST /api/v1/public/mutation/applications/:id/documents?type=&fileName= (raw body, header X-Upload-Token). */
export const postApplicationDocument = asyncHandler(async (req: Request, res: Response) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) throw ApiError.notFound("Application not found.");
  const type = String(req.query.type ?? "");
  const fileName = typeof req.query.fileName === "string" ? req.query.fileName : "";
  res.status(201).json({ document: await addDocument(req, id.data, token(req), type, fileName) });
});

/** GET /api/v1/public/mutation/applications/:id/documents - the draft's uploads so far. */
export const getDraftDocuments = asyncHandler(async (req: Request, res: Response) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) throw ApiError.notFound("Application not found.");
  res.status(200).json({ documents: await draftDocuments(id.data, token(req)) });
});

/** DELETE /api/v1/public/mutation/applications/:id/documents/:docId */
export const deleteDraftDocument = asyncHandler(async (req: Request, res: Response) => {
  const id = idParam.safeParse(req.params.id);
  const doc = idParam.safeParse(req.params.docId);
  if (!id.success || !doc.success) throw ApiError.notFound("Document not found.");
  await removeDocument(id.data, token(req), doc.data);
  res.status(200).json({ ok: true });
});

/** POST /api/v1/public/mutation/applications/:id/submit */
export const postSubmitApplication = asyncHandler(async (req: Request, res: Response) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) throw ApiError.notFound("Application not found.");
  res.status(200).json(await submitApplication(id.data, token(req)));
});

/** GET /api/v1/public/mutation/status/:applicationNo - progress, with the trail of desks and dates (no officer names). */
export const getApplicationStatus = asyncHandler(async (req: Request, res: Response) => {
  const n = z.string().trim().regex(/^[A-Za-z0-9]{6,24}$/).safeParse(req.params.applicationNo);
  if (!n.success) throw ApiError.badRequest("Enter the application number.");
  const status = await applicationStatus(n.data);
  const trail = publicTimeline(await buildTimeline({ applicationId: status.id }));
  const { id: _id, ...rest } = status;
  res.status(200).json({ ...rest, trail });
});

const editOpenSchema = z.object({
  applicationNo: z.string().trim().regex(/^[A-Za-z0-9]{6,24}$/, "Enter the application number."),
  mobile,
  holdingNo: z.string().trim().min(1, "Enter the holding number given in the application.").max(32),
});

/** POST /api/v1/public/mutation/edit/open - application number + mobile + holding number -> a 60-minute edit session. */
export const postOpenForEdit = asyncHandler(async (req: Request, res: Response) => {
  const b = editOpenSchema.safeParse(req.body);
  if (!b.success) throw ApiError.badRequest(b.error.issues[0]?.message ?? "Check the details.");
  const result = await openForEdit(b.data.applicationNo, b.data.mobile, b.data.holdingNo);
  res.locals.editMatched = true;
  res.status(200).json(result);
});

const editSchema = z.object({
  manual: z.object({ oldHoldingNo: z.string().trim().min(1).max(32), ward: z.string().trim().min(1).max(16), address: z.string().trim().min(3).max(500) }).nullish(),
  newOwnerName: z.string().trim().min(2, "Enter the new owner's name.").max(255),
  newOwnerRelationType: z.enum(["S/O", "D/O", "W/O", "C/O"]).nullish(),
  newOwnerRelationName: z.string().trim().max(255).nullish(),
  newOwnerMobile: mobile,
  newOwnerAadhaar: z.string().trim().transform((s) => s.replace(/\s/g, "")).pipe(z.string().regex(/^(\d{12})?$/, "Aadhaar number must be 12 digits.")).nullish(),
  newOwnerEmail: z.string().trim().email("Enter a valid email address.").max(120).nullish().or(z.literal("")),
  applicantName: z.string().trim().min(2, "Enter the applicant's name.").max(255),
  applicantMobile: mobile,
  transferBasis: z.enum(["sale_deed", "partition", "gift", "inheritance", "auction"]),
  transferDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date of transfer."),
  ...landRecord,
});

function editToken(req: Request): string {
  return (req.header("x-edit-token") ?? "").slice(0, 100);
}

/** PUT /api/v1/public/mutation/edit/:id (header X-Edit-Token) */
export const putEditApplication = asyncHandler(async (req: Request, res: Response) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) throw ApiError.notFound("Application not found.");
  const b = editSchema.safeParse(req.body);
  if (!b.success) throw ApiError.badRequest(b.error.issues[0]?.message ?? "Check the form.");
  res.status(200).json(await saveEdit(id.data, editToken(req), { ...b.data, newOwnerEmail: b.data.newOwnerEmail || null, newOwnerAadhaar: b.data.newOwnerAadhaar || null }));
});

/** POST /api/v1/public/mutation/edit/:id/documents?type=&fileName= (raw body, X-Edit-Token) */
export const postEditDocument = asyncHandler(async (req: Request, res: Response) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) throw ApiError.notFound("Application not found.");
  const type = String(req.query.type ?? "");
  const fileName = typeof req.query.fileName === "string" ? req.query.fileName : "";
  res.status(201).json({ document: await addEditDocument(req, id.data, editToken(req), type, fileName) });
});

/** DELETE /api/v1/public/mutation/edit/:id/documents/:docId (X-Edit-Token) */
export const deleteEditDocument = asyncHandler(async (req: Request, res: Response) => {
  const id = idParam.safeParse(req.params.id);
  const doc = idParam.safeParse(req.params.docId);
  if (!id.success || !doc.success) throw ApiError.notFound("Document not found.");
  await removeEditDocument(id.data, editToken(req), doc.data);
  res.status(200).json({ ok: true });
});

// --- staff -----------------------------------------------------------------------------------------------------

/** GET /api/v1/admin/mutation-applications?status= */
export const getMutationApplications = asyncHandler(async (req: Request, res: Response) => {
  const s = z.enum(["awaiting_holding", "in_chain", "rejected"]).optional().safeParse(req.query.status || undefined);
  if (!s.success) throw ApiError.badRequest("Invalid filter");
  res.status(200).json({ applications: await listApplications({ status: s.data }) });
});

/** GET /api/v1/admin/mutation-applications/:id - details and documents (also for the change request page). */
export const getMutationApplication = asyncHandler(async (req: Request, res: Response) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) throw ApiError.notFound("Application not found.");
  res.status(200).json(await getApplicationForStaff(id.data));
});

/** GET /api/v1/admin/mutation-applications/:id/documents/:docId/file */
export const getMutationApplicationDocument = asyncHandler(async (req: Request, res: Response) => {
  const id = idParam.safeParse(req.params.id);
  const doc = idParam.safeParse(req.params.docId);
  if (!id.success || !doc.success) throw ApiError.notFound("Document not found.");
  const f = await documentFileForStaff(id.data, doc.data);
  if (!fs.existsSync(f.fullPath)) throw ApiError.notFound("The file is missing from storage.");
  res.setHeader("Content-Type", f.mime);
  res.setHeader("Content-Disposition", `inline; filename="${f.name.replace(/"/g, "")}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  fs.createReadStream(f.fullPath).pipe(res);
});

/** POST /api/v1/admin/mutation-applications/:id/link { holdingNo } - Tax Daroga. */
export const postLinkMutationApplication = asyncHandler(async (req: Request, res: Response) => {
  const id = idParam.safeParse(req.params.id);
  const b = z.object({ holdingNo: holdingNoSchema }).safeParse(req.body);
  if (!id.success || !b.success) throw ApiError.badRequest("Enter a valid holding number.");
  res.status(200).json(await linkApplicationToHolding(id.data, b.data.holdingNo, req.admin!.displayName));
});

/** POST /api/v1/admin/mutation-applications/:id/reject { remarks } - Tax Daroga. */
export const postRejectMutationApplication = asyncHandler(async (req: Request, res: Response) => {
  const id = idParam.safeParse(req.params.id);
  const b = z.object({ remarks: z.string().trim().min(3, "Give the reason.").max(500) }).safeParse(req.body);
  if (!id.success) throw ApiError.notFound("Application not found.");
  if (!b.success) throw ApiError.badRequest(b.error.issues[0]?.message ?? "Give the reason.");
  await rejectApplication(id.data, b.data.remarks, req.admin!.displayName);
  res.status(200).json({ ok: true });
});
