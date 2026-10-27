import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Request } from "express";
import { pool } from "../config/db";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { normalizeWard } from "../utils/ward";
import { isValidAadhaar } from "./mutationApplication.service";
import { initiateSale, statusCheck } from "./iciciGateway";

/**
 * Building plan permit (migration 150). The public applies online; the Map Section Nodal Clerk takes the file through
 * every office stage, recording each report / decision with its supporting document:
 *
 *   submitted         site verification report (Assistant Architect) + Amin report + AE report
 *   scrutiny          technical scrutiny of the drawing - verified built-up area / plot area / use fix the final fee
 *   awaiting_payment  development fee + permit fee + labour cess, online (ICICI) or at the office counter
 *   processing        file processing and verification (3 physical drawing sets countersigned by a UDHD architect,
 *                     joint affidavit, documents checked against originals)
 *   authority         competent authority approval (order uploaded)
 *   sanctioned        building plan approval issued -> approved (permit number, approved drawing)
 *
 * The clerk can return the application to the applicant for correction (submitted / scrutiny / processing) or reject it.
 */

// ------------------------------------------------------------------------------------------------------------- fees

export const FEE_RATES = {
  developmentResidential: 10000, // residential, plot area up to 5 hectare
  developmentOther: 20000, // every other use, or residential above 5 hectare
  residentialPlotLimitSqm: 50000, // 5 hectare
  permitPerSqm: 110,
  labourCessPerSqm: 158.74,
} as const;

export const USE_TYPES: Record<string, string> = {
  residential: "Residential",
  commercial: "Commercial",
  mixed: "Mixed use (residential + commercial)",
  institutional: "Institutional",
  industrial: "Industrial",
  other: "Other",
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function computeFees(useType: string, plotAreaSqm: number, builtUpSqm: number) {
  const development = useType === "residential" && plotAreaSqm <= FEE_RATES.residentialPlotLimitSqm ? FEE_RATES.developmentResidential : FEE_RATES.developmentOther;
  const permit = r2(builtUpSqm * FEE_RATES.permitPerSqm);
  const labourCess = r2(builtUpSqm * FEE_RATES.labourCessPerSqm);
  return { development, permit, labourCess, total: r2(development + permit + labourCess) };
}

// -------------------------------------------------------------------------------------------------------- documents

type DocSpec = { label: string; pdf: boolean; images: boolean; required: boolean; maxPdfBytes?: number };

export const APPLICANT_DOCS: Record<string, DocSpec> = {
  sale_deed: { label: "Sale deed", pdf: true, images: true, required: true },
  jamabandi: { label: "Updated jamabandi receipt", pdf: true, images: true, required: true },
  aadhaar: { label: "Aadhaar card (photo / scan)", pdf: true, images: true, required: true },
  pan: { label: "PAN card (photo / scan)", pdf: true, images: true, required: true },
  photo: { label: "Passport size photograph", pdf: false, images: true, required: true },
  holding_receipt: { label: "Holding tax receipt", pdf: true, images: true, required: true },
  architect_site_visit: { label: "Site visit verification by the architect", pdf: true, images: true, required: true },
  drawing: { label: "Drawing sheets - 1 set (PDF)", pdf: true, images: false, required: true, maxPdfBytes: 10 * 1024 * 1024 },
  general_info: { label: "General information sheet with estimation sheet", pdf: true, images: true, required: true },
  joint_affidavit: { label: "Joint affidavit with nominee signature", pdf: true, images: true, required: true },
  other: { label: "Any other document", pdf: true, images: true, required: false },
};

export const OFFICE_DOCS: Record<string, DocSpec> = {
  aa_site_report: { label: "Site verification report - Assistant Architect", pdf: true, images: true, required: false },
  amin_report: { label: "Amin report", pdf: true, images: true, required: false },
  ae_report: { label: "AE report", pdf: true, images: true, required: false },
  scrutiny_note: { label: "Technical scrutiny note", pdf: true, images: true, required: false },
  payment_receipt: { label: "Fee payment receipt / challan", pdf: true, images: true, required: false },
  processing_note: { label: "File processing / verification note", pdf: true, images: true, required: false },
  authority_order: { label: "Competent authority approval order", pdf: true, images: true, required: false },
  approved_drawing: { label: "Approved drawing (stamped)", pdf: true, images: false, required: false, maxPdfBytes: 10 * 1024 * 1024 },
};

const PHOTO_MAX = 750 * 1024;
const PDF_MAX = 2 * 1024 * 1024;
const MAX_FILES_PER_TYPE = 3;

/** The three reports of the site stage, each needing its document and a finding. */
export const SITE_REPORTS = {
  aa: { doc: "aa_site_report", label: "Site verification report (Assistant Architect)" },
  amin: { doc: "amin_report", label: "Amin report" },
  ae: { doc: "ae_report", label: "AE report" },
} as const;

export const STATUS_LABELS: Record<string, string> = {
  draft: "Draft - not submitted",
  submitted: "Site verification (Assistant Architect, Amin, AE reports)",
  scrutiny: "Technical scrutiny of drawing",
  awaiting_payment: "Fee and labour cess payment due",
  processing: "File processing and verification",
  authority: "Awaiting competent authority approval",
  sanctioned: "Approved - building plan approval being issued",
  approved: "Building plan approved",
  returned: "Returned to applicant for correction",
  rejected: "Rejected",
};

// ------------------------------------------------------------------------------------------------------------- rows

interface AppRow {
  id: string;
  application_no: string | null;
  status: string;
  returned_from: string | null;
  upload_token_hash: string;
  applicant_name: string;
  relation_name: string | null;
  mobile: string;
  email: string | null;
  applicant_address: string;
  aadhaar_no: string;
  pan_no: string | null;
  holding_no: string | null;
  ward: string;
  mauza: string | null;
  thana_no: string | null;
  khata_no: string;
  khesra_no: string;
  site_address: string;
  plot_area_sqm: string;
  use_type: string;
  floors: { floor: string; areaSqm: number }[];
  built_up_area_sqm: string;
  architect_name: string;
  architect_reg_no: string;
  architect_mobile: string | null;
  fee_development: string;
  fee_permit: string;
  fee_labour_cess: string;
  fee_total: string;
  verified_built_up_sqm: string | null;
  verified_plot_area_sqm: string | null;
  verified_use_type: string | null;
  final_fee_development: string | null;
  final_fee_permit: string | null;
  final_fee_labour_cess: string | null;
  final_fee_total: string | null;
  paid_at: Date | null;
  payment_mode: string | null;
  payment_ref: string | null;
  payment_amount: string | null;
  permit_no: string | null;
  permit_issued_at: Date | null;
  permit_valid_till: string | null;
  authority_order_no: string | null;
  authority_order_date: string | null;
  applicant_message: string | null;
  created_at: Date;
  submitted_at: Date | null;
  updated_at: Date;
}

const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

async function findById(id: string): Promise<AppRow | null> {
  if (!/^\d{1,18}$/.test(id)) return null;
  const { rows } = await pool.query<AppRow>(`SELECT * FROM bp_applications WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

/** An application the applicant may still change (draft, or returned for correction) - needs its edit token. */
async function editableWithToken(id: string, token: string): Promise<AppRow> {
  const row = await findById(id);
  if (!row || !token || hashToken(token) !== row.upload_token_hash) throw ApiError.notFound("Application not found.");
  if (row.status !== "draft" && row.status !== "returned") throw ApiError.badRequest("This application is with the office and cannot be changed now.");
  return row;
}

// ---------------------------------------------------------------------------------------------- applicant: details

export interface ApplicationInput {
  applicantName: string;
  relationName?: string | null;
  mobile: string;
  email?: string | null;
  applicantAddress: string;
  aadhaarNo: string;
  panNo?: string | null;
  holdingNo?: string | null;
  ward: string;
  mauza?: string | null;
  thanaNo?: string | null;
  khataNo: string;
  khesraNo: string;
  siteAddress: string;
  plotAreaSqm: number;
  useType: string;
  floors: { floor: string; areaSqm: number }[];
  architectName: string;
  architectRegNo: string;
  architectMobile?: string | null;
}

function values(input: ApplicationInput) {
  const aadhaar = input.aadhaarNo.replace(/\s/g, "");
  if (!isValidAadhaar(aadhaar)) throw ApiError.badRequest("Enter a valid 12-digit Aadhaar number.");
  const pan = (input.panNo ?? "").trim().toUpperCase();
  if (pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) throw ApiError.badRequest("Enter a valid PAN (e.g. ABCDE1234F) or leave it blank.");
  if (!USE_TYPES[input.useType]) throw ApiError.badRequest("Choose the use of the building.");
  const floors = input.floors.filter((f) => f.floor.trim() && f.areaSqm > 0).map((f) => ({ floor: f.floor.trim().slice(0, 40), areaSqm: r2(f.areaSqm) }));
  if (floors.length === 0) throw ApiError.badRequest("Enter the built-up area of at least one floor.");
  const bua = r2(floors.reduce((t, f) => t + f.areaSqm, 0));
  const fees = computeFees(input.useType, input.plotAreaSqm, bua);
  return {
    applicant_name: input.applicantName.trim(),
    relation_name: input.relationName?.trim() || null,
    mobile: input.mobile,
    email: input.email?.trim() || null,
    applicant_address: input.applicantAddress.trim(),
    aadhaar_no: aadhaar,
    pan_no: pan || null,
    holding_no: input.holdingNo?.trim().toUpperCase() || null,
    ward: normalizeWard(input.ward) || input.ward.trim(),
    mauza: input.mauza?.trim() || null,
    thana_no: input.thanaNo?.trim() || null,
    khata_no: input.khataNo.trim(),
    khesra_no: input.khesraNo.trim(),
    site_address: input.siteAddress.trim(),
    plot_area_sqm: r2(input.plotAreaSqm),
    use_type: input.useType,
    floors: JSON.stringify(floors),
    built_up_area_sqm: bua,
    architect_name: input.architectName.trim(),
    architect_reg_no: input.architectRegNo.trim(),
    architect_mobile: input.architectMobile?.trim() || null,
    fee_development: fees.development,
    fee_permit: fees.permit,
    fee_labour_cess: fees.labourCess,
    fee_total: fees.total,
  };
}

export async function createDraft(input: ApplicationInput, ip: string | null) {
  const v = values(input);
  const token = crypto.randomBytes(24).toString("base64url");
  const cols = Object.keys(v) as (keyof typeof v)[];
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO bp_applications (${cols.join(", ")}, upload_token_hash, created_ip)
     VALUES (${cols.map((c, i) => (c === "floors" ? `$${i + 1}::jsonb` : `$${i + 1}`)).join(", ")}, $${cols.length + 1}, $${cols.length + 2}) RETURNING id`,
    [...cols.map((c) => v[c]), hashToken(token), ip],
  );
  return { applicationId: rows[0]!.id, uploadToken: token, fees: { development: v.fee_development, permit: v.fee_permit, labourCess: v.fee_labour_cess, total: v.fee_total } };
}

export async function updateDetails(id: string, token: string, input: ApplicationInput) {
  const app = await editableWithToken(id, token);
  const v = values(input);
  if (app.status === "returned" && v.mobile !== app.mobile) throw ApiError.badRequest("The mobile number cannot be changed after submission.");
  const cols = Object.keys(v) as (keyof typeof v)[];
  await pool.query(
    `UPDATE bp_applications SET ${cols.map((c, i) => `${c} = $${i + 2}${c === "floors" ? "::jsonb" : ""}`).join(", ")}, updated_at = now() WHERE id = $1`,
    [app.id, ...cols.map((c) => v[c])],
  );
  return { fees: { development: v.fee_development, permit: v.fee_permit, labourCess: v.fee_labour_cess, total: v.fee_total } };
}

// ---------------------------------------------------------------------------------------------------- file storage

async function streamToFile(req: Request, appId: string, docType: string, spec: DocSpec): Promise<{ rel: string; mime: string; size: number }> {
  const mime = String(req.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
  const ext = mime === "application/pdf" ? "pdf" : mime === "image/jpeg" || mime === "image/jpg" ? "jpg" : mime === "image/png" ? "png" : null;
  if (!ext || (ext === "pdf" && !spec.pdf) || (ext !== "pdf" && !spec.images)) {
    throw ApiError.badRequest(spec.pdf && spec.images ? "Upload a PDF, JPG or PNG file." : spec.pdf ? "Upload a PDF file." : "Upload a JPG or PNG photo.");
  }
  const limit = ext === "pdf" ? spec.maxPdfBytes ?? PDF_MAX : PHOTO_MAX;
  const tooBig = () => new ApiError(413, ext === "pdf" ? `The PDF is too large - at most ${Math.round(limit / 1024 / 1024)} MB.` : "The photo is too large - at most 750 KB.");
  if (Number(req.headers["content-length"] ?? 0) > limit) throw tooBig();
  const rel = path.join("building-permits", appId, `${docType}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`);
  const full = path.join(env.PHOTO_UPLOAD_DIR, rel);
  await fs.promises.mkdir(path.dirname(full), { recursive: true });
  let size = 0;
  let head = Buffer.alloc(0);
  try {
    await new Promise<void>((resolve, reject) => {
      const out = fs.createWriteStream(full);
      req.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (head.length < 8) head = Buffer.concat([head, chunk]).subarray(0, 8);
        if (size > limit) {
          reject(tooBig());
          req.unpipe(out);
          out.destroy();
        }
      });
      req.on("error", reject);
      out.on("error", reject);
      out.on("finish", resolve);
      req.pipe(out);
    });
    if (size === 0) throw ApiError.badRequest("The file is empty.");
    const ok = ext === "pdf" ? head.subarray(0, 5).toString("latin1") === "%PDF-" : ext === "jpg" ? head[0] === 0xff && head[1] === 0xd8 : head[0] === 0x89 && head[1] === 0x50;
    if (!ok) throw ApiError.badRequest(`This file does not look like a valid ${ext.toUpperCase()}.`);
  } catch (err) {
    await fs.promises.unlink(full).catch(() => undefined);
    throw err;
  }
  return { rel, mime: ext === "pdf" ? "application/pdf" : ext === "jpg" ? "image/jpeg" : "image/png", size };
}

async function storeDoc(req: Request, appId: string, docType: string, source: "applicant" | "office", fileName: string, by: string | null) {
  const spec = (source === "applicant" ? APPLICANT_DOCS : OFFICE_DOCS)[docType];
  if (!spec) throw ApiError.badRequest("Unknown document type.");
  const { rows: c } = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM bp_documents WHERE application_id = $1 AND doc_type = $2`, [appId, docType]);
  if ((c[0]?.n ?? 0) >= MAX_FILES_PER_TYPE) throw ApiError.badRequest(`At most ${MAX_FILES_PER_TYPE} files for one document - remove one first.`);
  const f = await streamToFile(req, appId, docType, spec);
  const { rows } = await pool.query(
    `INSERT INTO bp_documents (application_id, doc_type, source, file_path, mime_type, size_bytes, file_name, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id::text, doc_type, file_name, size_bytes::int, uploaded_at`,
    [appId, docType, source, f.rel, f.mime, f.size, fileName.replace(/[\\/"<>]/g, "_").slice(0, 255) || docType, by],
  );
  return { ...rows[0], label: spec.label };
}

async function listDocs(appId: string, source?: "applicant" | "office") {
  const { rows } = await pool.query<{ id: string; doc_type: string; source: string; file_name: string; size_bytes: number; mime_type: string; uploaded_by: string | null; uploaded_at: Date }>(
    `SELECT id::text, doc_type, source, file_name, size_bytes::int, mime_type, uploaded_by, uploaded_at FROM bp_documents
      WHERE application_id = $1 AND ($2::text IS NULL OR source = $2) ORDER BY source, doc_type, id`,
    [appId, source ?? null],
  );
  return rows.map((r) => ({ ...r, label: (r.source === "applicant" ? APPLICANT_DOCS : OFFICE_DOCS)[r.doc_type]?.label ?? r.doc_type }));
}

export async function applicantAddDocument(req: Request, id: string, token: string, docType: string, fileName: string) {
  const app = await editableWithToken(id, token);
  return storeDoc(req, app.id, docType, "applicant", fileName, null);
}

export async function applicantDocuments(id: string, token: string) {
  const app = await editableWithToken(id, token);
  return listDocs(app.id, "applicant");
}

export async function applicantRemoveDocument(id: string, token: string, docId: string) {
  const app = await editableWithToken(id, token);
  const { rows } = await pool.query<{ file_path: string }>(
    `DELETE FROM bp_documents WHERE id = $1 AND application_id = $2 AND source = 'applicant' RETURNING file_path`,
    [docId, app.id],
  );
  if (!rows[0]) throw ApiError.notFound("Document not found.");
  await fs.promises.unlink(path.join(env.PHOTO_UPLOAD_DIR, rows[0].file_path)).catch(() => undefined);
}

async function addEvent(appId: string, e: { stage: string; action: string; finding?: string | null; remarks?: string | null; by?: string | null; role?: string | null; isPublic?: boolean }, client = pool as { query: typeof pool.query }) {
  await client.query(
    `INSERT INTO bp_events (application_id, stage, action, finding, remarks, by_username, by_role, public) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [appId, e.stage, e.action, e.finding ?? null, e.remarks ?? null, e.by ?? null, e.role ?? null, e.isPublic ?? true],
  );
}

export async function submit(id: string, token: string) {
  const app = await editableWithToken(id, token);
  const docs = await listDocs(app.id, "applicant");
  const missing = Object.entries(APPLICANT_DOCS)
    .filter(([k, s]) => s.required && !docs.some((d) => d.doc_type === k))
    .map(([, s]) => s.label);
  if (missing.length) throw ApiError.badRequest(`Upload these documents before submitting: ${missing.join("; ")}.`);
  if (app.status === "draft") {
    const fy = (() => {
      const d = new Date(Date.now() + 330 * 60000);
      const y = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
      return `${String(y % 100).padStart(2, "0")}${String((y + 1) % 100).padStart(2, "0")}`; // 2026-27 -> "2627"
    })();
    const { rows } = await pool.query<{ application_no: string }>(
      `UPDATE bp_applications SET status = 'submitted', submitted_at = now(), updated_at = now(),
              application_no = 'BP' || $2 || lpad(nextval('bp_application_seq')::text, 5, '0')
        WHERE id = $1 AND status = 'draft' RETURNING application_no`,
      [app.id, fy],
    );
    if (!rows[0]) throw ApiError.badRequest("This application has already been submitted.");
    await addEvent(app.id, { stage: "application", action: "submitted", remarks: "Application submitted online" });
    return { applicationNo: rows[0].application_no, status: "submitted" };
  }
  // Returned for correction -> back to the stage it was returned from.
  const back = app.returned_from ?? "submitted";
  await pool.query(`UPDATE bp_applications SET status = $2, returned_from = NULL, applicant_message = NULL, updated_at = now() WHERE id = $1 AND status = 'returned'`, [app.id, back]);
  await addEvent(app.id, { stage: "application", action: "resubmitted", remarks: "Corrected application resubmitted by the applicant" });
  return { applicationNo: app.application_no!, status: back };
}

// ------------------------------------------------------------------------------------------------ applicant: status

function feeView(a: AppRow) {
  const final = a.final_fee_total != null;
  return {
    final,
    builtUpSqm: Number(final ? a.verified_built_up_sqm : a.built_up_area_sqm),
    development: Number(final ? a.final_fee_development : a.fee_development),
    permit: Number(final ? a.final_fee_permit : a.fee_permit),
    labourCess: Number(final ? a.final_fee_labour_cess : a.fee_labour_cess),
    total: Number(final ? a.final_fee_total : a.fee_total),
  };
}

async function findByNoAndMobile(applicationNo: string, mobile: string): Promise<AppRow> {
  const { rows } = await pool.query<AppRow>(`SELECT * FROM bp_applications WHERE application_no = $1 AND mobile = $2`, [applicationNo.trim().toUpperCase(), mobile.trim()]);
  if (!rows[0]) throw ApiError.notFound("No application with this number and mobile number.");
  return rows[0];
}

/** Applicant's view: status, timeline, fees, payment, permit. A returned application also gets a fresh edit token. */
export async function applicantView(applicationNo: string, mobile: string) {
  const a = await findByNoAndMobile(applicationNo, mobile);
  if (a.status === "awaiting_payment") await settlePendingOrdersFor(a.id);
  const app = (await findById(a.id))!;
  let editToken: string | null = null;
  if (app.status === "returned") {
    editToken = crypto.randomBytes(24).toString("base64url");
    await pool.query(`UPDATE bp_applications SET upload_token_hash = $2 WHERE id = $1`, [app.id, hashToken(editToken)]);
  }
  const { rows: events } = await pool.query<{ stage: string; action: string; remarks: string | null; at: Date }>(
    `SELECT stage, action, CASE WHEN action IN ('returned', 'rejected', 'submitted', 'resubmitted', 'paid_online', 'paid_counter', 'permit_issued') THEN remarks END AS remarks, at
       FROM bp_events WHERE application_id = $1 AND public ORDER BY at, id`,
    [app.id],
  );
  const { rows: pending } = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM bp_pg_orders WHERE application_id = $1 AND status = 'pending'`, [app.id]);
  return {
    applicationNo: app.application_no,
    applicantName: app.applicant_name,
    status: app.status,
    statusLabel: STATUS_LABELS[app.status],
    submittedAt: app.submitted_at,
    useType: USE_TYPES[app.verified_use_type ?? app.use_type],
    siteAddress: app.site_address,
    ward: app.ward,
    fees: feeView(app),
    payment: app.paid_at ? { paidAt: app.paid_at, mode: app.payment_mode, ref: app.payment_ref, amount: Number(app.payment_amount) } : null,
    onlinePaymentPending: (pending[0]?.n ?? 0) > 0,
    onlinePaymentEnabled: env.ONLINE_PAYMENT_ENABLED,
    message: app.applicant_message,
    permit: app.permit_no
      ? { permitNo: app.permit_no, issuedAt: app.permit_issued_at, validTill: app.permit_valid_till, authorityOrderNo: app.authority_order_no, authorityOrderDate: app.authority_order_date }
      : null,
    timeline: events.map((e) => ({ ...e, label: eventLabel(e.stage, e.action) })),
    edit: editToken ? { applicationId: app.id, token: editToken, details: detailsForEdit(app), documents: await listDocs(app.id, "applicant") } : null,
  };
}

function detailsForEdit(a: AppRow): ApplicationInput {
  return {
    applicantName: a.applicant_name,
    relationName: a.relation_name,
    mobile: a.mobile,
    email: a.email,
    applicantAddress: a.applicant_address,
    aadhaarNo: a.aadhaar_no,
    panNo: a.pan_no,
    holdingNo: a.holding_no,
    ward: a.ward,
    mauza: a.mauza,
    thanaNo: a.thana_no,
    khataNo: a.khata_no,
    khesraNo: a.khesra_no,
    siteAddress: a.site_address,
    plotAreaSqm: Number(a.plot_area_sqm),
    useType: a.use_type,
    floors: a.floors,
    architectName: a.architect_name,
    architectRegNo: a.architect_reg_no,
    architectMobile: a.architect_mobile,
  };
}

const EVENT_LABELS: Record<string, string> = {
  submitted: "Application submitted",
  resubmitted: "Corrected application resubmitted",
  report_aa: "Site verification report (Assistant Architect) recorded",
  report_amin: "Amin report recorded",
  report_ae: "AE report recorded",
  site_verified: "Site verification completed",
  scrutiny_done: "Technical scrutiny completed - fee finalised",
  paid_online: "Fee and labour cess paid online",
  paid_counter: "Fee and labour cess paid at the office",
  processing_done: "File processed and verified",
  authority_approved: "Approved by the competent authority",
  permit_issued: "Building plan approval issued",
  returned: "Returned to applicant for correction",
  rejected: "Application rejected",
};

function eventLabel(_stage: string, action: string): string {
  return EVENT_LABELS[action] ?? action.replace(/_/g, " ");
}

/** The approved drawing and approval order, for the applicant once the permit is issued. */
export async function applicantPermitFile(applicationNo: string, mobile: string, docId: string) {
  const a = await findByNoAndMobile(applicationNo, mobile);
  if (a.status !== "approved") throw ApiError.badRequest("The building plan is not approved yet.");
  const { rows } = await pool.query<{ file_path: string; mime_type: string; file_name: string }>(
    `SELECT file_path, mime_type, file_name FROM bp_documents WHERE id = $1 AND application_id = $2 AND source = 'office' AND doc_type IN ('approved_drawing', 'authority_order')`,
    [docId, a.id],
  );
  if (!rows[0]) throw ApiError.notFound("File not found.");
  return { fullPath: path.join(env.PHOTO_UPLOAD_DIR, rows[0].file_path), mime: rows[0].mime_type, name: rows[0].file_name };
}

export async function applicantPermitDocs(applicationNo: string, mobile: string) {
  const a = await findByNoAndMobile(applicationNo, mobile);
  if (a.status !== "approved") return [];
  return (await listDocs(a.id, "office")).filter((d) => d.doc_type === "approved_drawing" || d.doc_type === "authority_order");
}

// ---------------------------------------------------------------------------------------------------- online payment

function bpReturnUrl(): string {
  if (env.ICICI_BP_RETURN_URL) return env.ICICI_BP_RETURN_URL;
  return env.ICICI_RETURN_URL.replace(/\/properties\/pay\/online\/callback\/?$/, "/public/building-permit/pay/callback");
}

function newOrderId(): string {
  const ist = new Date(Date.now() + 330 * 60000).toISOString();
  const stamp = ist.slice(2, 4) + ist.slice(5, 7) + ist.slice(8, 10) + ist.slice(11, 13) + ist.slice(14, 16) + ist.slice(17, 19);
  return `BPA${stamp}${crypto.randomInt(0, 100000).toString().padStart(5, "0")}`;
}

export async function initiateOnlinePayment(applicationNo: string, mobile: string) {
  if (!env.ONLINE_PAYMENT_ENABLED) throw ApiError.badRequest("Online payment is not available at present. Please pay at the Nagar Nigam office.");
  const a = await findByNoAndMobile(applicationNo, mobile);
  if (a.status !== "awaiting_payment" || a.final_fee_total == null) throw ApiError.badRequest("No payment is due on this application now.");
  const orderId = newOrderId();
  const amount = Number(a.final_fee_total);
  await pool.query(`INSERT INTO bp_pg_orders (order_id, application_id, amount) VALUES ($1, $2, $3)`, [orderId, a.id, amount]);
  try {
    const { redirectUrl } = await initiateSale(
      orderId,
      { name: a.applicant_name, mobile: a.mobile, amount },
      { returnUrl: bpReturnUrl(), purpose: "BuildingPermit", mobileMissingMessage: "A valid 10-digit mobile number is needed for online payment." },
    );
    return { orderId, redirectUrl };
  } catch (err) {
    await pool.query(`UPDATE bp_pg_orders SET status = 'failed', failure_reason = $2, updated_at = now() WHERE order_id = $1`, [orderId, `Initiation failed: ${(err as Error).message}`]);
    throw err;
  }
}

/** Settles one order from the bank's status API only (never from the browser), once, under a per-order lock. */
export async function confirmOnlineOrder(orderId: string, callbackBody?: unknown): Promise<{ status: string; applicationNo: string | null }> {
  const lock = await pool.connect();
  try {
    await lock.query("SELECT pg_advisory_lock(hashtext($1))", [`bp_pg:${orderId}`]);
    const { rows } = await pool.query<{ application_id: string; amount: string; status: string; created_at: Date }>(`SELECT application_id, amount, status, created_at FROM bp_pg_orders WHERE order_id = $1`, [orderId]);
    const o = rows[0];
    if (!o) throw ApiError.notFound("Payment order not found.");
    const app = (await findById(o.application_id))!;
    if (callbackBody) await pool.query(`UPDATE bp_pg_orders SET gateway_response = $2::jsonb WHERE order_id = $1`, [orderId, JSON.stringify(callbackBody)]);
    if (o.status !== "pending") return { status: o.status, applicationNo: app.application_no };

    const v = await statusCheck(orderId);
    await pool.query(`UPDATE bp_pg_orders SET last_checked_at = now(), check_count = check_count + 1, bank_status_response = $2::jsonb WHERE order_id = $1`, [orderId, JSON.stringify(v.raw ?? null)]);
    const set = (status: string, reason: string | null, bankTxn: string | null = null) =>
      pool.query(`UPDATE bp_pg_orders SET status = $2, failure_reason = $3, bank_txn_id = COALESCE($4, bank_txn_id), updated_at = now() WHERE order_id = $1 AND status = 'pending'`, [orderId, status, reason, bankTxn]);

    if (v.state === "unknown") {
      const old = Date.now() - new Date(o.created_at).getTime() > 24 * 3600 * 1000;
      if (old && !/unreachable|not configured/.test(v.reason)) {
        await set("failed", `No confirmation from the bank within 24 hours (${v.reason})`);
        return { status: "failed", applicationNo: app.application_no };
      }
      return { status: "pending", applicationNo: app.application_no };
    }
    if (v.state === "failed") {
      await set("failed", v.reason);
      return { status: "failed", applicationNo: app.application_no };
    }
    if (v.amount != null && Math.abs(v.amount - Number(o.amount)) > 0.005) {
      await set("needs_review", `Bank amount ${v.amount} differs from order amount ${o.amount}`, v.bankTxnId);
      return { status: "needs_review", applicationNo: app.application_no };
    }
    const { rowCount } = await pool.query(
      `UPDATE bp_applications SET status = 'processing', paid_at = now(), payment_mode = 'Online', payment_ref = $2, payment_amount = $3, updated_at = now()
        WHERE id = $1 AND status = 'awaiting_payment'`,
      [app.id, v.bankTxnId ?? orderId, o.amount],
    );
    if (!rowCount) {
      await set("needs_review", "Paid at the bank but the application was no longer awaiting payment (already paid at the counter?)", v.bankTxnId);
      return { status: "needs_review", applicationNo: app.application_no };
    }
    await set("success", null, v.bankTxnId);
    await addEvent(app.id, { stage: "payment", action: "paid_online", remarks: `Rs ${Number(o.amount).toFixed(2)} paid online (order ${orderId})` });
    return { status: "success", applicationNo: app.application_no };
  } finally {
    await lock.query("SELECT pg_advisory_unlock(hashtext($1))", [`bp_pg:${orderId}`]).catch(() => undefined);
    lock.release();
  }
}

async function settlePendingOrdersFor(appId: string) {
  const { rows } = await pool.query<{ order_id: string }>(
    `SELECT order_id FROM bp_pg_orders WHERE application_id = $1 AND status = 'pending' AND (last_checked_at IS NULL OR last_checked_at < now() - interval '20 seconds')`,
    [appId],
  );
  for (const r of rows) await confirmOnlineOrder(r.order_id).catch((e) => console.error("[bp] status check", r.order_id, e));
}

/** Background: building permit orders whose applicant never came back from the bank page. */
export async function reconcilePendingBpOrders(): Promise<void> {
  if (!env.ONLINE_PAYMENT_ENABLED) return;
  const { rows } = await pool.query<{ order_id: string }>(
    `SELECT order_id FROM bp_pg_orders WHERE status = 'pending' AND created_at < now() - interval '5 minutes'
        AND (last_checked_at IS NULL OR last_checked_at < now() - CASE WHEN check_count < 6 THEN interval '15 minutes' ELSE interval '60 minutes' END)
      ORDER BY created_at LIMIT 20`,
  );
  for (const r of rows) await confirmOnlineOrder(r.order_id).catch((e) => console.error("[bp] reconcile", r.order_id, e));
}

// ------------------------------------------------------------------------------------------------------- office side

export interface Actor {
  username: string;
  role: string;
}

export async function listForOffice(filter: { status?: string; q?: string }) {
  const args: unknown[] = [];
  const where = [`a.status <> 'draft'`];
  if (filter.status === "open") where.push(`a.status NOT IN ('approved', 'rejected')`);
  else if (filter.status) {
    args.push(filter.status);
    where.push(`a.status = $${args.length}`);
  }
  if (filter.q) {
    args.push(`%${filter.q.trim()}%`);
    where.push(`(a.application_no ILIKE $${args.length} OR a.applicant_name ILIKE $${args.length} OR a.mobile ILIKE $${args.length} OR a.khesra_no ILIKE $${args.length})`);
  }
  const { rows } = await pool.query(
    `SELECT a.id::text, a.application_no AS "applicationNo", a.applicant_name AS "applicantName", a.mobile, a.ward, a.use_type AS "useType",
            a.built_up_area_sqm::float AS "builtUpSqm", COALESCE(a.final_fee_total, a.fee_total)::float AS "feeTotal", a.status,
            a.submitted_at AS "submittedAt", a.updated_at AS "updatedAt", a.permit_no AS "permitNo"
       FROM bp_applications a WHERE ${where.join(" AND ")} ORDER BY a.submitted_at DESC NULLS LAST LIMIT 500`,
    args,
  );
  const { rows: counts } = await pool.query<{ status: string; n: number }>(`SELECT status, count(*)::int AS n FROM bp_applications WHERE status <> 'draft' GROUP BY status`);
  return { applications: rows.map((r) => ({ ...r, statusLabel: STATUS_LABELS[r.status as string] })), counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) };
}

async function reportsDone(appId: string) {
  const { rows } = await pool.query<{ action: string; finding: string | null; remarks: string | null; by_username: string | null; at: Date }>(
    `SELECT DISTINCT ON (action) action, finding, remarks, by_username, at FROM bp_events
      WHERE application_id = $1 AND action IN ('report_aa', 'report_amin', 'report_ae') ORDER BY action, at DESC`,
    [appId],
  );
  return Object.fromEntries(rows.map((r) => [r.action.replace("report_", ""), r]));
}

export async function detailForOffice(id: string) {
  const a = await findById(id);
  if (!a || a.status === "draft") throw ApiError.notFound("Application not found.");
  const { rows: events } = await pool.query(
    `SELECT id::text, stage, action, finding, remarks, by_username AS "by", by_role AS "role", at FROM bp_events WHERE application_id = $1 ORDER BY at, id`,
    [a.id],
  );
  const { rows: orders } = await pool.query(
    `SELECT order_id AS "orderId", amount::float, status, failure_reason AS "failureReason", bank_txn_id AS "bankTxnId", created_at AS "createdAt" FROM bp_pg_orders WHERE application_id = $1 ORDER BY id DESC`,
    [a.id],
  );
  const { upload_token_hash: _t, ...rest } = a;
  return {
    application: { ...rest, statusLabel: STATUS_LABELS[a.status], useTypeLabel: USE_TYPES[a.use_type] },
    fees: feeView(a),
    documents: await listDocs(a.id),
    events: events.map((e) => ({ ...e, label: eventLabel(e.stage as string, e.action as string) })),
    reports: await reportsDone(a.id),
    orders,
    applicantDocTypes: APPLICANT_DOCS,
    officeDocTypes: OFFICE_DOCS,
  };
}

export async function officeDocumentFile(appId: string, docId: string) {
  const { rows } = await pool.query<{ file_path: string; mime_type: string; file_name: string }>(
    `SELECT file_path, mime_type, file_name FROM bp_documents WHERE id = $1 AND application_id = $2`,
    [docId, appId],
  );
  if (!rows[0]) throw ApiError.notFound("Document not found.");
  return { fullPath: path.join(env.PHOTO_UPLOAD_DIR, rows[0].file_path), mime: rows[0].mime_type, name: rows[0].file_name };
}

const OFFICE_OPEN = ["submitted", "scrutiny", "awaiting_payment", "processing", "authority", "sanctioned"];

async function officeApp(id: string, allowed: string[]): Promise<AppRow> {
  const a = await findById(id);
  if (!a || a.status === "draft") throw ApiError.notFound("Application not found.");
  if (!allowed.includes(a.status)) throw ApiError.badRequest(`Not possible now - the application is at "${STATUS_LABELS[a.status]}".`);
  return a;
}

async function hasOfficeDoc(appId: string, docType: string) {
  const { rows } = await pool.query(`SELECT 1 FROM bp_documents WHERE application_id = $1 AND doc_type = $2 AND source = 'office' LIMIT 1`, [appId, docType]);
  return rows.length > 0;
}

/** Moves status only if it is still what the clerk saw (two clerks / double click cannot both act). */
async function move(appId: string, from: string, to: string, extraSql = "", extraArgs: unknown[] = []) {
  const { rowCount } = await pool.query(`UPDATE bp_applications SET status = $3${extraSql}, updated_at = now() WHERE id = $1 AND status = $2`, [appId, from, to, ...extraArgs]);
  if (!rowCount) throw ApiError.badRequest("The application has just been changed by someone else - reload and try again.");
}

export async function officeUpload(req: Request, id: string, docType: string, fileName: string, actor: Actor) {
  const a = await officeApp(id, OFFICE_OPEN);
  return storeDoc(req, a.id, docType, "office", fileName, actor.username);
}

export async function officeRemoveDocument(id: string, docId: string) {
  const a = await officeApp(id, OFFICE_OPEN);
  const { rows } = await pool.query<{ file_path: string }>(`DELETE FROM bp_documents WHERE id = $1 AND application_id = $2 AND source = 'office' RETURNING file_path`, [docId, a.id]);
  if (!rows[0]) throw ApiError.notFound("Document not found.");
  await fs.promises.unlink(path.join(env.PHOTO_UPLOAD_DIR, rows[0].file_path)).catch(() => undefined);
}

export async function recordSiteReport(id: string, report: keyof typeof SITE_REPORTS, finding: "satisfactory" | "not_satisfactory", remarks: string, actor: Actor) {
  const a = await officeApp(id, ["submitted"]);
  const spec = SITE_REPORTS[report];
  if (!(await hasOfficeDoc(a.id, spec.doc))) throw ApiError.badRequest(`Upload the ${spec.label} first.`);
  await addEvent(a.id, { stage: "site_verification", action: `report_${report}`, finding, remarks, by: actor.username, role: actor.role, isPublic: false });
  return { ok: true };
}

export async function completeSiteVerification(id: string, remarks: string | null, actor: Actor) {
  const a = await officeApp(id, ["submitted"]);
  const done = await reportsDone(a.id);
  const missing = (Object.keys(SITE_REPORTS) as (keyof typeof SITE_REPORTS)[]).filter((k) => !done[k]).map((k) => SITE_REPORTS[k].label);
  if (missing.length) throw ApiError.badRequest(`Record these first: ${missing.join(", ")}.`);
  await move(a.id, "submitted", "scrutiny");
  await addEvent(a.id, { stage: "site_verification", action: "site_verified", remarks, by: actor.username, role: actor.role });
  return { status: "scrutiny" };
}

export async function technicalScrutiny(id: string, input: { builtUpSqm: number; plotAreaSqm: number; useType: string; remarks: string }, actor: Actor) {
  const a = await officeApp(id, ["scrutiny"]);
  if (!USE_TYPES[input.useType]) throw ApiError.badRequest("Choose the use of the building.");
  const fees = computeFees(input.useType, input.plotAreaSqm, input.builtUpSqm);
  await move(
    a.id,
    "scrutiny",
    "awaiting_payment",
    `, verified_built_up_sqm = $4, verified_plot_area_sqm = $5, verified_use_type = $6, final_fee_development = $7, final_fee_permit = $8, final_fee_labour_cess = $9, final_fee_total = $10`,
    [r2(input.builtUpSqm), r2(input.plotAreaSqm), input.useType, fees.development, fees.permit, fees.labourCess, fees.total],
  );
  await addEvent(a.id, {
    stage: "technical_scrutiny",
    action: "scrutiny_done",
    remarks: `${input.remarks}\nVerified built-up area ${r2(input.builtUpSqm)} sq m; fee Rs ${fees.total.toFixed(2)}`,
    by: actor.username,
    role: actor.role,
  });
  return { status: "awaiting_payment", fees };
}

export async function recordCounterPayment(id: string, input: { mode: string; ref: string; paidOn: string; amount: number }, actor: Actor) {
  const a = await officeApp(id, ["awaiting_payment"]);
  if (Math.abs(input.amount - Number(a.final_fee_total)) > 0.005) throw ApiError.badRequest(`The amount must be the full fee: Rs ${Number(a.final_fee_total).toFixed(2)}.`);
  if (!(await hasOfficeDoc(a.id, "payment_receipt"))) throw ApiError.badRequest("Upload the payment receipt / challan copy first.");
  const { rows: pend } = await pool.query(`SELECT 1 FROM bp_pg_orders WHERE application_id = $1 AND status = 'pending' LIMIT 1`, [a.id]);
  if (pend.length) throw ApiError.badRequest("An online payment for this application is still being confirmed by the bank - check again in a few minutes.");
  await move(a.id, "awaiting_payment", "processing", `, paid_at = (($4::date)::timestamp AT TIME ZONE 'Asia/Kolkata'), payment_mode = $5, payment_ref = $6, payment_amount = $7, payment_recorded_by = $8`, [
    input.paidOn,
    input.mode,
    input.ref,
    input.amount,
    actor.username,
  ]);
  await addEvent(a.id, { stage: "payment", action: "paid_counter", remarks: `Rs ${input.amount.toFixed(2)} by ${input.mode}, ref ${input.ref}`, by: actor.username, role: actor.role });
  return { status: "processing" };
}

export async function completeProcessing(id: string, input: { physicalSets: boolean; affidavitOriginal: boolean; documentsVerified: boolean; remarks: string }, actor: Actor) {
  const a = await officeApp(id, ["processing"]);
  if (!input.physicalSets || !input.affidavitOriginal || !input.documentsVerified) {
    throw ApiError.badRequest("Confirm all three: the 3 drawing sets countersigned by a UDHD registered architect received, the original joint affidavit received, and the documents verified with the originals.");
  }
  await move(a.id, "processing", "authority");
  await addEvent(a.id, {
    stage: "processing",
    action: "processing_done",
    remarks: `3 physical drawing sets (UDHD architect countersigned) received; original joint affidavit received; documents verified with originals.${input.remarks ? `\n${input.remarks}` : ""}`,
    by: actor.username,
    role: actor.role,
  });
  return { status: "authority" };
}

export async function recordAuthorityApproval(id: string, input: { orderNo: string; orderDate: string; remarks: string | null }, actor: Actor) {
  const a = await officeApp(id, ["authority"]);
  if (!(await hasOfficeDoc(a.id, "authority_order"))) throw ApiError.badRequest("Upload the competent authority's approval order first.");
  await move(a.id, "authority", "sanctioned", `, authority_order_no = $4, authority_order_date = $5`, [input.orderNo, input.orderDate]);
  await addEvent(a.id, { stage: "authority", action: "authority_approved", remarks: `Order ${input.orderNo} dated ${input.orderDate}${input.remarks ? `\n${input.remarks}` : ""}`, by: actor.username, role: actor.role });
  return { status: "sanctioned" };
}

export async function issuePermit(id: string, input: { validTill: string }, actor: Actor) {
  const a = await officeApp(id, ["sanctioned"]);
  if (!(await hasOfficeDoc(a.id, "approved_drawing"))) throw ApiError.badRequest("Upload the approved (stamped) drawing first.");
  const year = new Date(Date.now() + 330 * 60000).getUTCFullYear();
  const { rows } = await pool.query<{ permit_no: string }>(
    `UPDATE bp_applications SET status = 'approved', permit_issued_at = now(), permit_valid_till = $3,
            permit_no = 'NNM/BP/' || $2 || '/' || lpad(nextval('bp_permit_seq')::text, 4, '0'), updated_at = now()
      WHERE id = $1 AND status = 'sanctioned' RETURNING permit_no`,
    [a.id, String(year), input.validTill],
  );
  if (!rows[0]) throw ApiError.badRequest("The application has just been changed by someone else - reload and try again.");
  await addEvent(a.id, { stage: "approval", action: "permit_issued", remarks: `Permit ${rows[0].permit_no}, valid till ${input.validTill}`, by: actor.username, role: actor.role });
  return { status: "approved", permitNo: rows[0].permit_no };
}

export async function returnToApplicant(id: string, remarks: string, actor: Actor) {
  const a = await officeApp(id, ["submitted", "scrutiny", "processing"]);
  await move(a.id, a.status, "returned", `, returned_from = $4, applicant_message = $5`, [a.status, remarks]);
  await addEvent(a.id, { stage: a.status, action: "returned", remarks, by: actor.username, role: actor.role });
  return { status: "returned" };
}

export async function rejectApplication(id: string, remarks: string, actor: Actor) {
  const a = await officeApp(id, ["submitted", "scrutiny", "processing", "authority"]);
  await move(a.id, a.status, "rejected", `, applicant_message = $4`, [remarks]);
  await addEvent(a.id, { stage: a.status, action: "rejected", remarks, by: actor.username, role: actor.role });
  return { status: "rejected" };
}

/** Data for the printable permit letter (office and applicant). */
export async function permitLetter(a: AppRow) {
  return {
    permitNo: a.permit_no,
    issuedAt: a.permit_issued_at,
    validTill: a.permit_valid_till,
    applicationNo: a.application_no,
    applicantName: a.applicant_name,
    relationName: a.relation_name,
    applicantAddress: a.applicant_address,
    siteAddress: a.site_address,
    ward: a.ward,
    mauza: a.mauza,
    thanaNo: a.thana_no,
    khataNo: a.khata_no,
    khesraNo: a.khesra_no,
    plotAreaSqm: Number(a.verified_plot_area_sqm ?? a.plot_area_sqm),
    builtUpSqm: Number(a.verified_built_up_sqm ?? a.built_up_area_sqm),
    useType: USE_TYPES[a.verified_use_type ?? a.use_type],
    floors: a.floors,
    architectName: a.architect_name,
    architectRegNo: a.architect_reg_no,
    authorityOrderNo: a.authority_order_no,
    authorityOrderDate: a.authority_order_date,
    fees: feeView(a),
    paidAt: a.paid_at,
    paymentRef: a.payment_ref,
  };
}

export async function applicantPermitLetter(applicationNo: string, mobile: string) {
  const a = await findByNoAndMobile(applicationNo, mobile);
  if (a.status !== "approved") throw ApiError.badRequest("The building plan is not approved yet.");
  return permitLetter(a);
}

export async function officePermitLetter(id: string) {
  const a = await findById(id);
  if (!a || a.status !== "approved") throw ApiError.badRequest("No permit has been issued for this application.");
  return permitLetter(a);
}
