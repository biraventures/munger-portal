import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { whosWhoRepository, type WhosWhoFields, type WhosWhoFiles } from "../repositories/whosWho.repository";
import {
  WHOS_WHO_DESIGNATIONS,
  WHOS_WHO_DESIGNATION_KEYS,
  WHOS_WHO_MESSAGE_MAX_WORDS,
  WHOS_WHO_VERIFICATION_CHECKS,
  WHOS_WHO_WARD_COUNT,
  type WhosWhoMeta,
  type WhosWhoStatus,
} from "../types/whosWho.types";

export const MAX_PHOTO_BYTES = 1024 * 1024; // the page compresses to well under this before upload
export const MAX_SIGNED_FORM_BYTES = 5 * 1024 * 1024;
const SIGNED_FORM_TYPES: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };

const idSchema = z.object({ id: z.coerce.number().int().positive() });
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format");

const fieldsSchema = z.object({
  designation: z.enum(WHOS_WHO_DESIGNATION_KEYS),
  wardNo: z.coerce.number().int().min(1).max(WHOS_WHO_WARD_COUNT).nullish(),
  areaCharge: z.string().trim().max(150).nullish(),
  nameEn: z.string().trim().min(2, "Name (English) is required.").max(150),
  nameHi: z.string().trim().max(150).nullish(),
  dateAssumedOffice: dateSchema,
  contactNumber: z.string().trim().min(1, "Contact number is required."),
  contactIsPersonal: z.boolean(),
  email: z.string().trim().email("Invalid email").max(200).nullish().or(z.literal("")),
  publicMessage: z.string().trim().max(800).nullish(),
  formNo: z.string().trim().max(50).nullish(),
  consentConfirmed: z.literal(true, { errorMap: () => ({ message: "Confirm that the signed consent (Part A) is on the form." }) }),
  photoBase64: z.string().min(1).nullish(),
  signedFormName: z.string().trim().max(255).nullish(),
  signedFormBase64: z.string().min(1).nullish(),
});

type ParsedFields = z.infer<typeof fieldsSchema>;

function normalizeContact(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0") && /^0[6-9]\d{9}$/.test(d)) d = d.slice(1);
  if (d.length < 10 || d.length > 12) throw ApiError.badRequest("Contact number must have 10 digits (mobile) or a landline number with STD code.");
  return d;
}

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

function today(): string {
  const d = new Date(Date.now() + 5.5 * 3600 * 1000); // IST
  return d.toISOString().slice(0, 10);
}

function toFields(p: ParsedFields): WhosWhoFields {
  const isWard = p.designation === "ward_councillor";
  if (isWard && !p.wardNo) throw ApiError.badRequest(`Ward No. (1 to ${WHOS_WHO_WARD_COUNT}) is required for a Ward Councillor.`);
  if (p.dateAssumedOffice > today()) throw ApiError.badRequest("Date of assuming office cannot be in the future.");
  const message = p.publicMessage?.trim() || null;
  if (message && wordCount(message) > WHOS_WHO_MESSAGE_MAX_WORDS) {
    throw ApiError.badRequest(`Public message is ${wordCount(message)} words - the limit is ${WHOS_WHO_MESSAGE_MAX_WORDS}.`);
  }
  return {
    designation: p.designation,
    wardNo: isWard ? p.wardNo! : null,
    areaCharge: p.areaCharge?.trim() || null,
    nameEn: p.nameEn,
    nameHi: p.nameHi?.trim() || null,
    dateAssumedOffice: p.dateAssumedOffice,
    contactNumber: normalizeContact(p.contactNumber),
    contactIsPersonal: p.contactIsPersonal,
    email: p.email?.trim() || null,
    publicMessage: message,
    formNo: p.formNo?.trim() || null,
  };
}

function decodePhoto(b64: string): { mime: string; data: Buffer } {
  const data = Buffer.from(b64, "base64");
  if (data.length === 0) throw ApiError.badRequest("The photograph is empty.");
  if (data.length > MAX_PHOTO_BYTES) throw ApiError.badRequest("The photograph is too large - the limit is 1 MB.");
  if (data[0] === 0xff && data[1] === 0xd8) return { mime: "image/jpeg", data };
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", data };
  throw ApiError.badRequest("The photograph must be a JPG or PNG image.");
}

function decodeSignedForm(name: string, b64: string): { name: string; mime: string; data: Buffer } {
  const data = Buffer.from(b64, "base64");
  if (data.length === 0) throw ApiError.badRequest("The scanned form is empty.");
  if (data.length > MAX_SIGNED_FORM_BYTES) throw ApiError.badRequest("The scanned form is too large - the limit is 5 MB.");
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  const mime = SIGNED_FORM_TYPES[ext];
  if (!mime) throw ApiError.badRequest("The scanned form must be a PDF, JPG or PNG file.");
  const okMagic =
    mime === "application/pdf" ? data.subarray(0, 5).toString("latin1") === "%PDF-"
    : mime === "image/jpeg" ? data[0] === 0xff && data[1] === 0xd8
    : data[0] === 0x89 && data[1] === 0x50;
  if (!okMagic) throw ApiError.badRequest("The scanned form file is not a valid PDF/JPG/PNG.");
  return { name: name.replace(/[\\/"]/g, "_"), mime, data };
}

function parseBody(body: unknown): ParsedFields {
  const parsed = fieldsSchema.safeParse(body);
  if (!parsed.success) {
    const fe = parsed.error.flatten().fieldErrors;
    const first = Object.values(fe).flat()[0];
    throw ApiError.badRequest(first || "Invalid input", fe);
  }
  return parsed.data;
}

async function loadEntry(req: Request): Promise<WhosWhoMeta> {
  const p = idSchema.safeParse(req.params);
  if (!p.success) throw ApiError.badRequest("Invalid entry id");
  const e = await whosWhoRepository.findMetaById(String(p.data.id));
  if (!e) throw ApiError.notFound("Entry not found.");
  const u = req.whosWhoUser!;
  if (u.role === "operator" && e.entered_by_key !== u.key && e.status !== "published") throw new ApiError(403, "Not allowed.");
  return e;
}

function requireRole(req: Request, ...roles: string[]): void {
  if (!roles.includes(req.whosWhoUser!.role)) throw new ApiError(403, "Your role cannot do this step.");
}

function sendBinary(res: Response, mime: string, data: Buffer, fileName?: string): void {
  res.setHeader("Content-Type", mime);
  if (fileName) res.setHeader("Content-Disposition", `inline; filename="${fileName.replace(/"/g, "")}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.status(200).send(data);
}

// ------------------------------------------------------------------ staff

/** GET /api/v1/whos-who-manager/me */
export const getWhosWhoMe = asyncHandler(async (req: Request, res: Response) => {
  const u = req.whosWhoUser!;
  res.status(200).json({
    displayName: u.displayName,
    role: u.role,
    designations: WHOS_WHO_DESIGNATIONS,
    verificationChecks: WHOS_WHO_VERIFICATION_CHECKS,
    wardCount: WHOS_WHO_WARD_COUNT,
    messageMaxWords: WHOS_WHO_MESSAGE_MAX_WORDS,
    maxSignedFormBytes: MAX_SIGNED_FORM_BYTES,
  });
});

/** GET /api/v1/whos-who-manager/entries - operators see their own entries plus everything published (to pick one to update); reviewers see all. */
export const listWhosWhoEntries = asyncHandler(async (req: Request, res: Response) => {
  const u = req.whosWhoUser!;
  if (u.role === "operator") {
    const [own, published] = await Promise.all([
      whosWhoRepository.list({ enteredByKey: u.key }),
      whosWhoRepository.list({ statuses: ["published"] }),
    ]);
    const seen = new Set(own.map((e) => e.id));
    res.status(200).json({ entries: [...own, ...published.filter((e) => !seen.has(e.id))] });
    return;
  }
  res.status(200).json({ entries: await whosWhoRepository.list({}) });
});

/** POST /api/v1/whos-who-manager/entries - operator. A new entry, or (with replacesId) an update to a published one. */
export const createWhosWhoEntry = asyncHandler(async (req: Request, res: Response) => {
  requireRole(req, "operator");
  const u = req.whosWhoUser!;
  const body = parseBody(req.body);
  const replaces = z.object({ replacesId: z.coerce.number().int().positive().nullish() }).safeParse(req.body);
  const replacesId = replaces.success && replaces.data.replacesId ? String(replaces.data.replacesId) : null;
  if (replacesId) {
    const old = await whosWhoRepository.findMetaById(replacesId);
    if (!old || old.status !== "published") throw ApiError.badRequest("The entry being updated is not published.");
    if (await whosWhoRepository.hasOpenReplacement(replacesId)) {
      throw ApiError.badRequest("An update for this entry is already in progress.");
    }
  }
  if (!body.photoBase64) throw ApiError.badRequest("A photograph is required.");
  if (!body.signedFormBase64 || !body.signedFormName) throw ApiError.badRequest("Upload the scanned signed form.");
  const entry = await whosWhoRepository.create(
    toFields(body),
    { photo: decodePhoto(body.photoBase64), signedForm: decodeSignedForm(body.signedFormName, body.signedFormBase64) },
    { name: u.displayName, key: u.key },
    replacesId,
  );
  res.status(201).json({ entry });
});

/** PUT /api/v1/whos-who-manager/entries/:id - operator corrects a returned entry and resubmits it. */
export const resubmitWhosWhoEntry = asyncHandler(async (req: Request, res: Response) => {
  requireRole(req, "operator");
  const e = await loadEntry(req);
  if (e.entered_by_key !== req.whosWhoUser!.key) throw new ApiError(403, "Only the operator who entered this can correct it.");
  if (e.status !== "returned") throw ApiError.badRequest("Only an entry that was sent back can be corrected.");
  const body = parseBody(req.body);
  const files: WhosWhoFiles = {};
  if (body.photoBase64) files.photo = decodePhoto(body.photoBase64);
  if (body.signedFormBase64 && body.signedFormName) files.signedForm = decodeSignedForm(body.signedFormName, body.signedFormBase64);
  const entry = await whosWhoRepository.resubmit(e.id, toFields(body), files);
  if (!entry) throw ApiError.badRequest("This entry can no longer be corrected.");
  res.status(200).json({ entry });
});

/** DELETE /api/v1/whos-who-manager/entries/:id - operator withdraws an unpublished entry. */
export const withdrawWhosWhoEntry = asyncHandler(async (req: Request, res: Response) => {
  requireRole(req, "operator");
  const e = await loadEntry(req);
  const ok = await whosWhoRepository.withdraw(e.id, req.whosWhoUser!.key);
  if (!ok) throw ApiError.badRequest("Only your own entry that is awaiting verification or was sent back can be withdrawn.");
  res.status(200).json({ ok: true });
});

/** POST /api/v1/whos-who-manager/entries/:id/verify - City Manager. All checks must be ticked. */
export const verifyWhosWhoEntry = asyncHandler(async (req: Request, res: Response) => {
  requireRole(req, "verifier");
  const e = await loadEntry(req);
  const b = z.object({ checks: z.record(z.boolean()) }).safeParse(req.body);
  if (!b.success) throw ApiError.badRequest("Verification checks are required.");
  const missing = WHOS_WHO_VERIFICATION_CHECKS.filter((c) => b.data.checks[c.key] !== true);
  if (missing.length) throw ApiError.badRequest(`Tick every check before forwarding (missing: ${missing.map((m) => m.label).join("; ")}). Otherwise send it back.`);
  const checks = Object.fromEntries(WHOS_WHO_VERIFICATION_CHECKS.map((c) => [c.key, true]));
  const entry = await whosWhoRepository.verify(e.id, req.whosWhoUser!.displayName, checks);
  if (!entry) throw ApiError.badRequest("This entry is not waiting for verification.");
  res.status(200).json({ entry });
});

/** POST /api/v1/whos-who-manager/entries/:id/return - City Manager or DMC sends it back to the operator. */
export const returnWhosWhoEntry = asyncHandler(async (req: Request, res: Response) => {
  requireRole(req, "verifier", "publisher");
  const e = await loadEntry(req);
  const b = z.object({ reason: z.string().trim().min(3).max(1000) }).safeParse(req.body);
  if (!b.success) throw ApiError.badRequest("Give a reason for sending it back.");
  const from: WhosWhoStatus = req.whosWhoUser!.role === "verifier" ? "pending_verification" : "pending_publication";
  const entry = await whosWhoRepository.sendBack(e.id, from, req.whosWhoUser!.displayName, b.data.reason);
  if (!entry) throw ApiError.badRequest("This entry is not at your stage.");
  res.status(200).json({ entry });
});

/** POST /api/v1/whos-who-manager/entries/:id/publish - DMC. */
export const publishWhosWhoEntry = asyncHandler(async (req: Request, res: Response) => {
  requireRole(req, "publisher");
  const e = await loadEntry(req);
  const r = await whosWhoRepository.publish(e.id, req.whosWhoUser!.displayName);
  if (r.error) throw ApiError.badRequest(r.error);
  res.status(200).json({ entry: r.entry });
});

/** POST /api/v1/whos-who-manager/entries/:id/archive - DMC takes a published entry off the website. */
export const archiveWhosWhoEntry = asyncHandler(async (req: Request, res: Response) => {
  requireRole(req, "publisher");
  const e = await loadEntry(req);
  const entry = await whosWhoRepository.archive(e.id, req.whosWhoUser!.displayName);
  if (!entry) throw ApiError.badRequest("Only a published entry can be archived.");
  res.status(200).json({ entry });
});

/** GET /api/v1/whos-who-manager/entries/:id/photo */
export const getWhosWhoPhotoForStaff = asyncHandler(async (req: Request, res: Response) => {
  const e = await loadEntry(req);
  const p = await whosWhoRepository.findPhoto(e.id);
  if (!p) throw ApiError.notFound("Photo not found.");
  sendBinary(res, p.photo_mime, p.photo_data);
});

/** GET /api/v1/whos-who-manager/entries/:id/signed-form - never public. */
export const getWhosWhoSignedForm = asyncHandler(async (req: Request, res: Response) => {
  const e = await loadEntry(req);
  if (req.whosWhoUser!.role === "operator" && e.entered_by_key !== req.whosWhoUser!.key) throw new ApiError(403, "Not allowed.");
  const f = await whosWhoRepository.findSignedForm(e.id);
  if (!f) throw ApiError.notFound("Form not found.");
  sendBinary(res, f.signed_form_mime, f.signed_form_data, f.signed_form_name);
});

// ----------------------------------------------------------------- public

/** GET /api/v1/whos-who - no login. Published entries only. */
export const listPublicWhosWho = asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json({ entries: await whosWhoRepository.listPublished(), designations: WHOS_WHO_DESIGNATIONS });
});

/** GET /api/v1/whos-who/:id/photo - no login. An unpublished entry looks the same as a missing one. */
export const getPublicWhosWhoPhoto = asyncHandler(async (req: Request, res: Response) => {
  const p = idSchema.safeParse(req.params);
  if (!p.success) throw ApiError.badRequest("Invalid id");
  const photo = await whosWhoRepository.findPhoto(String(p.data.id));
  if (!photo || photo.status !== "published") throw ApiError.notFound("Photo not found.");
  // The website may be served from a different origin than the API; helmet's default
  // same-origin resource policy would stop the <img> from loading there.
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Cache-Control", "public, max-age=3600");
  sendBinary(res, photo.photo_mime, photo.photo_data);
});
