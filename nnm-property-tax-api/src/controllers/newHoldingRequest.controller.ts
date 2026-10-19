import fs from "node:fs";
import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { USE_TYPE_MULTIPLIER, SOLID_WASTE_RATE } from "../constants/taxRates";
import {
  addDocument,
  approveAndCreate,
  assignRequest,
  createDraft,
  darogaForward,
  dmcForward,
  documentFileForStaff,
  draftDocuments,
  getRequestForStaff,
  listRequests,
  OWNERSHIP_BASIS,
  pendingCount,
  rejectRequest,
  removeDocument,
  requestStatus,
  returnToApplicant,
  saveEdit,
  sendBackToDaroga,
  submitFieldReport,
  submitRequest,
  updateDraft,
  viewRequest,
} from "../services/newHoldingRequest.service";
import { fieldReportSchema } from "./changeRequest.controller";

const mobile = z
  .string()
  .trim()
  .transform((s) => s.replace(/[\s-]/g, "").replace(/^(\+91|91|0)(?=\d{10}$)/, ""))
  .pipe(z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number."));
const fy = (msg: string) => z.string().trim().regex(/^\d{4}-\d{4}$/, msg).refine((s) => Number(s.slice(5)) === Number(s.slice(0, 4)) + 1, msg);

const FLOOR_LABELS = [
  "Basement - B",
  "Ground Floor - 0",
  "First Floor - 1",
  "Second Floor - 2",
  "Third Floor - 3",
  "Fourth Floor - 4",
  "Fifth Floor - 5",
  "Sixth Floor - 6",
  "Seventh Floor - 7",
  "Eighth Floor - 8",
] as const;

const floorSchema = z.object({
  floorLabel: z.enum(FLOOR_LABELS, { errorMap: () => ({ message: "Choose the floor." }) }),
  buildupSqft: z.coerce.number().positive("Enter the built-up area of each floor.").max(1_000_000),
  constType: z.enum(["RCC", "Asbestos", "Other"]),
  usageType: z.string().refine((u) => u in USE_TYPE_MULTIPLIER, "Choose the use of each floor."),
  occupancy: z.enum(["self", "rented"]),
  yearBuilt: fy("Year as YYYY-YYYY").nullish().or(z.literal("").transform(() => null)),
});

const propertyFields = {
  ownerName: z.string().trim().min(2, "Enter the owner's name.").max(255),
  relationType: z.enum(["S/O", "D/O", "W/O", "C/O"]).nullish().or(z.literal("").transform(() => null)),
  relationName: z.string().trim().max(255).nullish(),
  ownerMobile: mobile,
  ownerAadhaar: z.string().trim().transform((s) => s.replace(/\s/g, "")).pipe(z.string().regex(/^(\d{12})?$/, "Aadhaar number must be 12 digits.")).nullish(),
  ownerEmail: z.string().trim().email("Enter a valid email address.").max(120).nullish().or(z.literal("")),
  applicantName: z.string().trim().min(2, "Enter the applicant's name.").max(255),
  applicantMobile: mobile,
  address: z.string().trim().min(5, "Enter the full address of the property.").max(500),
  landmark: z.string().trim().max(255).nullish(),
  ward: z.coerce.number().int().min(1, "Choose the ward.").max(45, "Choose the ward.").transform(String),
  pincode: z.string().trim().regex(/^(\d{6})?$/, "PIN code must be 6 digits.").nullish(),
  ownershipBasis: z.enum(Object.keys(OWNERSHIP_BASIS) as [string, ...string[]], { errorMap: () => ({ message: "Choose how the land is owned." }) }),
  khataNo: z.string().trim().max(64).nullish(),
  khesraNo: z.string().trim().max(64).nullish(),
  surveySheetNo: z.string().trim().max(64).nullish(),
  surveyWard: z.enum(["A", "B", "C", "D", "E", "F"]).nullish().or(z.literal("").transform(() => null)),
  plotAreaSqft: z.coerce.number().positive("Enter the area of the plot in sq ft.").max(10_000_000),
  roadType: z.enum(["PMR", "MR", "OR"], { errorMap: () => ({ message: "Choose the type of road in front of the property." }) }),
  rainWaterHarvesting: z.boolean().default(false),
  constructionYear: fy("Choose the year of construction."),
  floors: z.array(floorSchema).min(1, "Add at least one floor of the building.").max(10),
};
const gpsFields = {
  latitude: z.number().min(24).max(27),
  longitude: z.number().min(85).max(88),
  gpsAccuracy: z.number().nonnegative().max(100000).nullish(),
};
const draftSchema = z.object({ ...propertyFields, ...gpsFields });
const editSchema = z.object({ ...propertyFields, resubmit: z.boolean().default(false) });

function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const b = schema.safeParse(body);
  if (!b.success) {
    const first = b.error.issues[0];
    const gps = first?.path[0] === "latitude" || first?.path[0] === "longitude";
    throw ApiError.badRequest(gps ? "Capture the GPS location at the property (within Munger)." : first?.message ?? "Check the form.");
  }
  return b.data;
}

const idParam = z.string().regex(/^\d{1,18}$/);
const uploadToken = (req: Request) => (req.header("x-upload-token") ?? "").slice(0, 100);
const editToken = (req: Request) => (req.header("x-edit-token") ?? "").slice(0, 100);
const appNo = z.string().trim().regex(/^[A-Za-z0-9]{6,24}$/, "Enter the application number.");

function id(req: Request, key = "id"): string {
  const r = idParam.safeParse(req.params[key]);
  if (!r.success) throw ApiError.notFound("Request not found.");
  return r.data;
}

// --- public -----------------------------------------------------------------------------------------------------

/** POST /api/v1/public/new-holding/requests - starts a draft; returns its id and upload token. */
export const postCreateRequest = asyncHandler(async (req: Request, res: Response) => {
  const d = parseBody(draftSchema, req.body);
  res.status(201).json(await createDraft({ ...d, ownerEmail: d.ownerEmail || null }, req.ip ?? null));
});

/** PUT /api/v1/public/new-holding/requests/:id (X-Upload-Token) */
export const putUpdateDraft = asyncHandler(async (req: Request, res: Response) => {
  const d = parseBody(draftSchema, req.body);
  await updateDraft(id(req), uploadToken(req), { ...d, ownerEmail: d.ownerEmail || null });
  res.status(200).json({ requestId: req.params.id });
});

/** POST /api/v1/public/new-holding/requests/:id/documents?type=&fileName=&label= (raw body; X-Upload-Token or X-Edit-Token) */
export const postDocument = asyncHandler(async (req: Request, res: Response) => {
  const type = String(req.query.type ?? "");
  const fileName = typeof req.query.fileName === "string" ? req.query.fileName : "";
  const label = typeof req.query.label === "string" ? req.query.label.slice(0, 100) : null;
  res.status(201).json({ document: await addDocument(req, id(req), uploadToken(req), editToken(req), type, fileName, label) });
});

/** GET /api/v1/public/new-holding/requests/:id/documents (X-Upload-Token) */
export const getDraftDocuments = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({ documents: await draftDocuments(id(req), uploadToken(req)) });
});

/** DELETE /api/v1/public/new-holding/requests/:id/documents/:docId (X-Upload-Token or X-Edit-Token) */
export const deleteDocument = asyncHandler(async (req: Request, res: Response) => {
  await removeDocument(id(req), uploadToken(req), editToken(req), id(req, "docId"));
  res.status(200).json({ ok: true });
});

/** POST /api/v1/public/new-holding/requests/:id/submit (X-Upload-Token) */
export const postSubmit = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json(await submitRequest(id(req), uploadToken(req)));
});

/** GET /api/v1/public/new-holding/status/:applicationNo - progress only. */
export const getStatus = asyncHandler(async (req: Request, res: Response) => {
  const n = appNo.safeParse(req.params.applicationNo);
  if (!n.success) throw ApiError.badRequest("Enter the application number.");
  res.status(200).json(await requestStatus(n.data));
});

/** POST /api/v1/public/new-holding/view { applicationNo, mobile } - the applicant's own view; an edit session when allowed. */
export const postView = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ applicationNo: appNo, mobile }).safeParse(req.body);
  if (!b.success) throw ApiError.badRequest(b.error.issues[0]?.message ?? "Check the details.");
  const result = await viewRequest(b.data.applicationNo, b.data.mobile);
  res.locals.viewMatched = true;
  res.status(200).json(result);
});

/** PUT /api/v1/public/new-holding/edit/:id (X-Edit-Token) { ...details, resubmit } */
export const putEdit = asyncHandler(async (req: Request, res: Response) => {
  const d = parseBody(editSchema, req.body);
  const { resubmit, ...input } = d;
  res.status(200).json(await saveEdit(id(req), editToken(req), { ...input, ownerEmail: input.ownerEmail || null }, resubmit));
});

// --- staff ------------------------------------------------------------------------------------------------------

const viewer = (req: Request) => ({ username: req.admin!.username, displayName: req.admin!.displayName, role: req.admin!.role });
const STATUSES = ["submitted", "returned", "at_surveyor", "daroga_review", "at_dmc", "at_commissioner", "created", "rejected"] as const;

/** GET /api/v1/admin/new-holding-requests?status=&ward= */
export const getRequests = asyncHandler(async (req: Request, res: Response) => {
  const s = z.enum(STATUSES).optional().safeParse(req.query.status || undefined);
  if (!s.success) throw ApiError.badRequest("Invalid filter");
  const ward = typeof req.query.ward === "string" && req.query.ward.trim() ? req.query.ward.trim().slice(0, 16) : undefined;
  res.status(200).json({ requests: await listRequests({ status: s.data, ward }, viewer(req)), pending: await pendingCount(viewer(req)) });
});

/** GET /api/v1/admin/new-holding-requests/pending-count */
export const getPendingCount = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json(await pendingCount(viewer(req)));
});

/** GET /api/v1/admin/new-holding-requests/:id - details, documents, field reports, audit trail, possible existing holdings. */
export const getRequest = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json(await getRequestForStaff(id(req), viewer(req)));
});

/** GET /api/v1/admin/new-holding-requests/:id/documents/:docId/file */
export const getRequestDocument = asyncHandler(async (req: Request, res: Response) => {
  const f = await documentFileForStaff(id(req), id(req, "docId"), viewer(req));
  if (!fs.existsSync(f.fullPath)) throw ApiError.notFound("The file is missing from storage.");
  res.setHeader("Content-Type", f.mime);
  res.setHeader("Content-Disposition", `inline; filename="${f.name.replace(/"/g, "")}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  fs.createReadStream(f.fullPath).pipe(res);
});

const remarks = (msg: string) => z.string().trim().min(3, msg).max(500);
function body<T extends z.ZodTypeAny>(schema: T, req: Request): z.infer<T> {
  const b = schema.safeParse(req.body);
  if (!b.success) throw ApiError.badRequest(b.error.issues[0]?.message ?? "Check the form.");
  return b.data;
}

/** POST /:id/assign - Tax Daroga: old holding no. from the demand register + Tax Surveyor for the field report. */
export const postAssign = asyncHandler(async (req: Request, res: Response) => {
  const b = body(
    z.object({
      registerOldHoldingNo: z.string().trim().min(1, "Enter the old holding number from the demand register.").max(32),
      surveyorUsername: z.string().trim().min(1, "Choose the Tax Surveyor."),
      remarks: z.string().trim().max(500).nullish(),
    }),
    req,
  );
  await assignRequest(id(req), b, viewer(req));
  res.status(200).json({ ok: true });
});

/** POST /:id/field-report - Tax Surveyor. */
export const postFieldReport = asyncHandler(async (req: Request, res: Response) => {
  await submitFieldReport(id(req), body(fieldReportSchema, req), viewer(req));
  res.status(200).json({ ok: true });
});

/** POST /:id/daroga-forward - Tax Daroga after the field report: comments, user charge type, corrections. */
export const postDarogaForward = asyncHandler(async (req: Request, res: Response) => {
  const b = body(
    z.object({
      remarks: remarks("Write your comments."),
      solidWasteChargeType: z.string().refine((t) => t in SOLID_WASTE_RATE, "Choose the solid waste user charge type."),
      isSlum: z.boolean().default(false),
      ward: propertyFields.ward.optional(),
      address: propertyFields.address.optional(),
      plotAreaSqft: propertyFields.plotAreaSqft.optional(),
      roadType: propertyFields.roadType.optional(),
      constructionYear: propertyFields.constructionYear.optional(),
      floors: propertyFields.floors.optional(),
    }),
    req,
  );
  await darogaForward(id(req), b, viewer(req));
  res.status(200).json({ ok: true });
});

/** POST /:id/dmc-forward - DMC. */
export const postDmcForward = asyncHandler(async (req: Request, res: Response) => {
  await dmcForward(id(req), body(z.object({ remarks: remarks("Write your comments.") }), req).remarks, viewer(req));
  res.status(200).json({ ok: true });
});

/** POST /:id/send-back - DMC / Commissioner: back to the Tax Daroga. */
export const postSendBack = asyncHandler(async (req: Request, res: Response) => {
  await sendBackToDaroga(id(req), body(z.object({ remarks: remarks("Say what the Tax Daroga must re-check.") }), req).remarks, viewer(req));
  res.status(200).json({ ok: true });
});

/** POST /:id/approve - Commissioner: final approval, the MMC- holding is created. */
export const postApprove = asyncHandler(async (req: Request, res: Response) => {
  const b = body(z.object({ remarks: z.string().trim().max(500).nullish() }), req);
  res.status(200).json(await approveAndCreate(id(req), b.remarks ?? null, viewer(req)));
});

/** POST /:id/return { remarks } - Tax Daroga: to the applicant for correction. */
export const postReturn = asyncHandler(async (req: Request, res: Response) => {
  await returnToApplicant(id(req), body(z.object({ remarks: remarks("Say what the applicant must correct.") }), req).remarks, viewer(req));
  res.status(200).json({ ok: true });
});

/** POST /:id/reject { remarks, existingHoldingNo? } - Tax Daroga / DMC / Commissioner. */
export const postReject = asyncHandler(async (req: Request, res: Response) => {
  const b = body(z.object({ remarks: remarks("Give the reason."), existingHoldingNo: z.string().trim().max(32).nullish() }), req);
  await rejectRequest(id(req), b.remarks, b.existingHoldingNo ?? null, viewer(req));
  res.status(200).json({ ok: true });
});
