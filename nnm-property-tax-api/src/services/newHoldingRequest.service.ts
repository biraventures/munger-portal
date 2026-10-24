import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Request } from "express";
import { pool } from "../config/db";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { normalizeWard } from "../utils/ward";
import { uploadLimitFor, uploadLimitMessage } from "../utils/uploadLimits";
import { getCurrentAssessmentYearStartNum } from "../utils/assessmentYear";
import { isValidAadhaar } from "./mutationApplication.service";
import { saveNewEntryProperty } from "./newEntry.service";
import { assertRegisterNoFree, findTaxSurveyor, listFieldReports, saveFieldReport, type FieldReportInput } from "./fieldReport.service";
import type { FloorInput } from "../types/propertySave.types";

/**
 * Requests from the public for a holding to be created for a property that was never assessed (migration 140).
 *
 *   draft --submit--> submitted --Tax Daroga: demand register no. + surveyor--> at_surveyor --field report-->
 *   daroga_review --Tax Daroga's comments--> at_dmc --DMC--> at_commissioner --approved--> created (new MMC- holding)
 *
 *   The Tax Daroga can send it back to the applicant (returned -> resubmitted -> submitted); the DMC / Commissioner can
 *   send it back to the Tax Daroga; the Tax Daroga, DMC or Commissioner can turn it down (rejected).
 *
 * The applicant can view the request with the application number and mobile number, and correct it while it is
 * 'submitted' (not yet processed by the Tax Daroga) or 'returned' (sent back to them).
 */

export const OWNERSHIP_BASIS: Record<string, string> = {
  sale_deed: "Sale deed / purchase",
  inheritance: "Inheritance",
  partition: "Partition",
  gift: "Gift",
  allotment: "Government / authority allotment",
  other: "Other",
};

export const DOC_TYPES: Record<string, { label: string; pdf: boolean }> = {
  ownership_proof: { label: "Proof of ownership of the land (sale deed / khatian / partition or gift deed / will / allotment)", pdf: true },
  jamabandi: { label: "Latest jamabandi / land rent (lagan) receipt", pdf: true },
  aadhaar: { label: "Aadhaar card of the owner", pdf: true },
  photo_front: { label: "Photo of the building from the front", pdf: false },
  photo_other: { label: "Photo of the building from another side / of the plot", pdf: false },
  building_plan: { label: "Approved building plan / map", pdf: true },
  electricity_bill: { label: "Electricity bill (shows since when the building is in use)", pdf: true },
  other_1: { label: "Other document 1", pdf: true },
  other_2: { label: "Other document 2", pdf: true },
};
const MANDATORY_DOCS = ["ownership_proof", "aadhaar", "photo_front"];
const MAX_FILES_PER_TYPE = 5;
const MAX_DOC_BYTES = 2 * 1024 * 1024;
export const MAX_REQUESTS_PER_MOBILE = 2;

export function docLabel(docType: string, label?: string | null): string {
  const base = DOC_TYPES[docType]?.label ?? docType;
  return docType.startsWith("other_") && label ? `${base}: ${label}` : base;
}

export interface NewHoldingRequestRow {
  id: string;
  application_no: string | null;
  status: "draft" | "submitted" | "returned" | "at_surveyor" | "daroga_review" | "at_dmc" | "at_commissioner" | "created" | "rejected";
  owner_name: string;
  relation_type: string | null;
  relation_name: string | null;
  owner_mobile: string;
  owner_aadhaar: string;
  owner_email: string | null;
  applicant_name: string;
  applicant_mobile: string;
  address: string;
  landmark: string | null;
  ward: string;
  pincode: string | null;
  ownership_basis: string;
  khata_no: string | null;
  khesra_no: string | null;
  survey_sheet_no: string | null;
  survey_ward: string | null;
  plot_area_sqft: string;
  road_type: "PMR" | "MR" | "OR";
  rain_water_harvesting: boolean;
  construction_year: string;
  floors: FloorInput[];
  latitude: string | null;
  longitude: string | null;
  gps_accuracy_m: string | null;
  upload_token_hash: string;
  edit_token_hash: string | null;
  edit_token_expires_at: Date | null;
  edit_count: number;
  last_edited_at: Date | null;
  created_ip: string | null;
  created_at: Date;
  submitted_at: Date | null;
  handled_by: string | null;
  handled_at: Date | null;
  handling_remarks: string | null;
  duplicate_of_holding: string | null;
  register_old_holding_no: string | null;
  assigned_surveyor_username: string | null;
  assigned_surveyor_name: string | null;
  verified_details: Record<string, unknown> | null;
  stage_since: Date | null;
  new_holding_no: string | null;
}

export interface RequestInput {
  ownerName: string;
  relationType?: "S/O" | "D/O" | "W/O" | "C/O" | null;
  relationName?: string | null;
  ownerMobile: string;
  /** Blank on an edit keeps the number on file. */
  ownerAadhaar?: string | null;
  ownerEmail?: string | null;
  applicantName: string;
  applicantMobile: string;
  address: string;
  landmark?: string | null;
  ward: string;
  pincode?: string | null;
  ownershipBasis: string;
  khataNo?: string | null;
  khesraNo?: string | null;
  surveySheetNo?: string | null;
  surveyWard?: string | null;
  plotAreaSqft: number;
  roadType: "PMR" | "MR" | "OR";
  rainWaterHarvesting: boolean;
  constructionYear: string;
  floors: FloorInput[];
  latitude?: number | null;
  longitude?: number | null;
  gpsAccuracy?: number | null;
}

// --------------------------------------------------------------------------------------------------- helpers

const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

function sameHash(token: string, stored: string | null): boolean {
  if (!token || !stored) return false;
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(stored, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function findById(id: string): Promise<NewHoldingRequestRow | null> {
  if (!/^\d{1,18}$/.test(id)) return null;
  const { rows } = await pool.query<NewHoldingRequestRow>(`SELECT * FROM new_holding_requests WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

async function recordEvent(requestId: string, event: string, actor: string, actorRole: string | null, remarks?: string | null, details?: Record<string, unknown> | null) {
  await pool.query(`INSERT INTO new_holding_request_events (request_id, event, stage, actor, actor_role, remarks, details) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [
    requestId,
    event,
    actorRole,
    actor.slice(0, 150),
    actorRole,
    remarks ?? null,
    details ? JSON.stringify(details) : null,
  ]);
}

/** Requests in progress or done (not drafts, not rejected) carrying this mobile as applicant or owner. */
async function assertMobileLimit(mobiles: string[], excludeId?: string): Promise<void> {
  for (const m of [...new Set(mobiles)]) {
    const { rows } = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM new_holding_requests
        WHERE status NOT IN ('draft', 'rejected') AND (owner_mobile = $1 OR applicant_mobile = $1)
          AND ($2::bigint IS NULL OR id <> $2::bigint)`,
      [m, excludeId ?? null],
    );
    if ((rows[0]?.n ?? 0) >= MAX_REQUESTS_PER_MOBILE) {
      throw ApiError.badRequest(`Mobile number ${m} is already on ${MAX_REQUESTS_PER_MOBILE} new holding requests - no more can be made with it.`);
    }
  }
}

function currentFy(): string {
  const y = getCurrentAssessmentYearStartNum();
  return `${y}-${y + 1}`;
}

function checkPropertyInput(input: Pick<RequestInput, "plotAreaSqft" | "constructionYear" | "floors">) {
  if (!(input.plotAreaSqft > 0)) throw ApiError.badRequest("Enter the area of the plot in sq ft.");
  if (!input.floors.length) throw ApiError.badRequest("Add at least one floor of the building.");
  const startOf = (y: string) => Number(y.slice(0, 4));
  if (startOf(input.constructionYear) > getCurrentAssessmentYearStartNum()) throw ApiError.badRequest("The year of construction cannot be in the future.");
  const ground = input.floors.filter((f) => f.floorLabel === "Ground Floor - 0").reduce((s, f) => s + f.buildupSqft, 0);
  if (ground > input.plotAreaSqft) throw ApiError.badRequest("The ground floor's built-up area cannot be more than the plot area.");
  const labels = input.floors.map((f) => f.floorLabel);
  if (new Set(labels).size !== labels.length) throw ApiError.badRequest("Each floor can be entered only once.");
  for (const f of input.floors) {
    if (!(f.buildupSqft > 0)) throw ApiError.badRequest(`Enter the built-up area of the ${f.floorLabel.split(" - ")[0]}.`);
    if (f.yearBuilt && startOf(f.yearBuilt) < startOf(input.constructionYear)) {
      throw ApiError.badRequest(`The ${f.floorLabel.split(" - ")[0]} cannot be older than the year of construction of the building.`);
    }
  }
}

function rowValues(input: RequestInput, aadhaar: string | null) {
  return {
    owner_name: input.ownerName.trim(),
    relation_type: input.relationType ?? null,
    relation_name: input.relationName?.trim() || null,
    owner_mobile: input.ownerMobile,
    ...(aadhaar ? { owner_aadhaar: aadhaar } : {}),
    owner_email: input.ownerEmail?.trim() || null,
    applicant_name: input.applicantName.trim(),
    applicant_mobile: input.applicantMobile,
    address: input.address.trim(),
    landmark: input.landmark?.trim() || null,
    ward: normalizeWard(input.ward),
    pincode: input.pincode?.trim() || null,
    ownership_basis: input.ownershipBasis,
    khata_no: input.khataNo?.trim() || null,
    khesra_no: input.khesraNo?.trim() || null,
    survey_sheet_no: input.surveySheetNo?.trim() || null,
    survey_ward: input.surveyWard || null,
    plot_area_sqft: input.plotAreaSqft,
    road_type: input.roadType,
    rain_water_harvesting: input.rainWaterHarvesting,
    construction_year: input.constructionYear,
    floors: JSON.stringify(input.floors.map((f) => ({ ...f, yearBuilt: f.yearBuilt || null, closingYear: null }))),
  };
}

function checkAadhaar(a: string | null | undefined): string | null {
  const n = (a ?? "").replace(/\s/g, "");
  if (!n) return null;
  if (!isValidAadhaar(n)) throw ApiError.badRequest("The Aadhaar number is not valid - check it.");
  return n;
}

// --------------------------------------------------------------------------------------------------- draft

async function draftWithToken(id: string, token: string): Promise<NewHoldingRequestRow> {
  const row = await findById(id);
  if (!row || !sameHash(token, row.upload_token_hash)) throw ApiError.notFound("Request not found.");
  if (row.status !== "draft") throw ApiError.badRequest("This request has already been submitted.");
  return row;
}

export async function createDraft(input: RequestInput, ip: string | null): Promise<{ requestId: string; uploadToken: string }> {
  const aadhaar = checkAadhaar(input.ownerAadhaar);
  if (!aadhaar) throw ApiError.badRequest("Enter the owner's Aadhaar number.");
  if (input.latitude == null || input.longitude == null) throw ApiError.badRequest("Capture the GPS location at the property.");
  checkPropertyInput(input);
  await assertMobileLimit([input.ownerMobile, input.applicantMobile]);
  const v = { ...rowValues(input, aadhaar), latitude: input.latitude, longitude: input.longitude, gps_accuracy_m: input.gpsAccuracy ?? null };
  const token = crypto.randomBytes(24).toString("base64url");
  const cols = Object.keys(v) as (keyof typeof v)[];
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO new_holding_requests (${cols.join(", ")}, upload_token_hash, created_ip)
     VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")}, $${cols.length + 1}, $${cols.length + 2}) RETURNING id`,
    [...cols.map((c) => v[c]), hashToken(token), ip],
  );
  return { requestId: rows[0]!.id, uploadToken: token };
}

/** The applicant went back from the documents step and changed the details; the same draft keeps its documents. */
export async function updateDraft(id: string, token: string, input: RequestInput): Promise<void> {
  const row = await draftWithToken(id, token);
  const aadhaar = checkAadhaar(input.ownerAadhaar);
  if (input.latitude == null || input.longitude == null) throw ApiError.badRequest("Capture the GPS location at the property.");
  checkPropertyInput(input);
  await assertMobileLimit([input.ownerMobile, input.applicantMobile], row.id);
  const v = { ...rowValues(input, aadhaar), latitude: input.latitude, longitude: input.longitude, gps_accuracy_m: input.gpsAccuracy ?? null };
  const cols = Object.keys(v) as (keyof typeof v)[];
  await pool.query(`UPDATE new_holding_requests SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(", ")} WHERE id = $1 AND status = 'draft'`, [row.id, ...cols.map((c) => v[c])]);
}

// --------------------------------------------------------------------------------------------------- documents

/** A draft (upload token) or a request the applicant may still change (edit token). */
async function requestForUpload(id: string, uploadToken: string, editToken: string): Promise<NewHoldingRequestRow> {
  if (editToken) return (await requestForEdit(id, editToken)).row;
  return draftWithToken(id, uploadToken);
}

export async function addDocument(req: Request, id: string, uploadToken: string, editToken: string, docType: string, fileName: string, label?: string | null) {
  const row = await requestForUpload(id, uploadToken, editToken);
  const spec = DOC_TYPES[docType];
  if (!spec) throw ApiError.badRequest("Unknown document type.");
  const mime = String(req.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
  const ext = mime === "application/pdf" ? "pdf" : mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : null;
  if (!ext || (ext === "pdf" && !spec.pdf)) throw ApiError.badRequest(spec.pdf ? "Upload a PDF, JPG or PNG file." : "Upload a JPG or PNG photo.");
  const limit = uploadLimitFor(mime) ?? MAX_DOC_BYTES;
  if (Number(req.headers["content-length"] ?? 0) > limit) throw new ApiError(413, uploadLimitMessage(mime));
  const { rows: count } = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM new_holding_request_documents WHERE request_id = $1 AND doc_type = $2`, [row.id, docType]);
  if ((count[0]?.n ?? 0) >= MAX_FILES_PER_TYPE) throw ApiError.badRequest(`At most ${MAX_FILES_PER_TYPE} files for one document type.`);

  const rel = path.join("new-holding-requests", row.id, `${docType}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`);
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
          reject(new ApiError(413, uploadLimitMessage(mime)));
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
    const looksRight = ext === "pdf" ? head.subarray(0, 5).toString("latin1") === "%PDF-" : ext === "jpg" ? head[0] === 0xff && head[1] === 0xd8 : head[0] === 0x89 && head[1] === 0x50;
    if (!looksRight) throw ApiError.badRequest("This file does not look like a valid " + ext.toUpperCase() + ".");
  } catch (err) {
    await fs.promises.unlink(full).catch(() => undefined);
    throw err;
  }
  const { rows } = await pool.query(
    `INSERT INTO new_holding_request_documents (request_id, doc_type, label, file_path, mime_type, size_bytes, file_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, doc_type, file_name, size_bytes, uploaded_at, label`,
    [row.id, docType, docType.startsWith("other_") ? label?.trim().slice(0, 100) || null : null, rel, mime, size, fileName.replace(/[\\/"<>]/g, "_").slice(0, 255) || `${docType}.${ext}`],
  );
  if (editToken) await markEdited(row, [`Uploaded: ${docLabel(docType, label)}`]);
  const d = rows[0] as { label: string | null };
  return { ...d, given_label: d.label, label: docLabel(docType, d.label) };
}

export async function removeDocument(id: string, uploadToken: string, editToken: string, docId: string): Promise<void> {
  const row = await requestForUpload(id, uploadToken, editToken);
  const { rows } = await pool.query<{ file_path: string; doc_type: string; label: string | null }>(
    `DELETE FROM new_holding_request_documents WHERE id = $1 AND request_id = $2 RETURNING file_path, doc_type, label`,
    [docId, row.id],
  );
  if (!rows[0]) throw ApiError.notFound("Document not found.");
  await fs.promises.unlink(path.join(env.PHOTO_UPLOAD_DIR, rows[0].file_path)).catch(() => undefined);
  if (editToken) await markEdited(row, [`Removed: ${docLabel(rows[0].doc_type, rows[0].label)}`]);
}

export async function listDocuments(requestId: string) {
  const { rows } = await pool.query<{ id: string; doc_type: string; file_name: string; mime_type: string; size_bytes: string; uploaded_at: Date; given_label: string | null }>(
    `SELECT id, doc_type, file_name, mime_type, size_bytes, uploaded_at, label AS given_label FROM new_holding_request_documents WHERE request_id = $1 ORDER BY doc_type, id`,
    [requestId],
  );
  return rows.map(({ given_label, ...r }) => ({ ...r, label: docLabel(r.doc_type, given_label), given_label }));
}

export async function draftDocuments(id: string, token: string) {
  return listDocuments((await draftWithToken(id, token)).id);
}

async function missingDocuments(requestId: string): Promise<string[]> {
  const { rows } = await pool.query<{ doc_type: string }>(`SELECT DISTINCT doc_type FROM new_holding_request_documents WHERE request_id = $1`, [requestId]);
  const have = new Set(rows.map((d) => d.doc_type));
  return MANDATORY_DOCS.filter((t) => !have.has(t));
}

// --------------------------------------------------------------------------------------------------- submit / status

async function nextApplicationNo(): Promise<string> {
  const { rows } = await pool.query<{ n: string }>(`SELECT nextval('new_holding_request_seq')::text AS n`);
  const yy = new Date().getFullYear() % 100;
  const check = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[crypto.randomInt(0, 32)];
  return `NHR${yy}${rows[0]!.n.padStart(6, "0")}${check}`;
}

export async function submitRequest(id: string, token: string): Promise<{ applicationNo: string }> {
  const row = await draftWithToken(id, token);
  const missing = await missingDocuments(row.id);
  if (missing.length) throw ApiError.badRequest(`Upload: ${missing.map((t) => DOC_TYPES[t]!.label).join("; ")}.`);
  await assertMobileLimit([row.owner_mobile, row.applicant_mobile], row.id);
  const applicationNo = await nextApplicationNo();
  const r = await pool.query(`UPDATE new_holding_requests SET application_no = $2, status = 'submitted', submitted_at = now(), stage_since = now() WHERE id = $1 AND status = 'draft'`, [row.id, applicationNo]);
  if (!r.rowCount) throw ApiError.badRequest("This request has already been submitted.");
  await recordEvent(row.id, "submitted", `${row.applicant_name} (applicant)`, "applicant");
  return { applicationNo };
}

const STATUS_TEXT: Record<NewHoldingRequestRow["status"], string> = {
  draft: "Not submitted",
  submitted: "Received - with the Tax Daroga (checking the demand register)",
  returned: "Sent back to you for correction - open the request with your mobile number and correct it",
  at_surveyor: "Field verification by the Tax Surveyor",
  daroga_review: "With the Tax Daroga after the field verification",
  at_dmc: "With the Deputy Municipal Commissioner",
  at_commissioner: "With the Municipal Commissioner for approval",
  created: "Holding created",
  rejected: "Not accepted",
};

/** Desk that holds the request in each status (for the pending counts and the time at each desk). */
export const STATUS_DESK: Partial<Record<NewHoldingRequestRow["status"], string>> = {
  submitted: "tax_daroga",
  returned: "applicant",
  at_surveyor: "tax_surveyor",
  daroga_review: "tax_daroga",
  at_dmc: "deputy_commissioner",
  at_commissioner: "commissioner",
};

export const DESK_LABEL: Record<string, string> = {
  tax_daroga: "Tax Daroga",
  tax_surveyor: "Tax Surveyor",
  deputy_commissioner: "Deputy Municipal Commissioner",
  commissioner: "Municipal Commissioner",
  applicant: "With the applicant",
};

export const EVENT_LABEL: Record<string, string> = {
  submitted: "Submitted",
  applicant_edited: "Corrected by the applicant",
  resubmitted: "Resubmitted after correction",
  assigned: "Old holding no. given from the demand register; sent for field verification",
  field_report: "Field report",
  daroga_forwarded: "Tax Daroga's comments; forwarded to the DMC",
  dmc_forwarded: "DMC's comments; forwarded to the Commissioner",
  returned: "Sent back to the applicant",
  sent_back_to_daroga: "Sent back to the Tax Daroga",
  rejected: "Not accepted",
  created: "Approved - holding created",
};

/** Desk the request moves to after each event (undefined = stays where it is; null = closed). */
const EVENT_NEXT_DESK: Record<string, string | null | undefined> = {
  submitted: "tax_daroga",
  resubmitted: "tax_daroga",
  assigned: "tax_surveyor",
  field_report: "tax_daroga",
  daroga_forwarded: "deputy_commissioner",
  dmc_forwarded: "commissioner",
  returned: "applicant",
  sent_back_to_daroga: "tax_daroga",
  rejected: null,
  created: null,
  applicant_edited: undefined,
};

const minsBetween = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));

/** The trail with the time spent at each desk before each step, and the totals per desk. */
export async function listEvents(requestId: string) {
  const { rows } = await pool.query<{ event: string; stage: string | null; actor: string; actor_role: string | null; remarks: string | null; details: Record<string, unknown> | null; at: Date }>(
    `SELECT event, stage, actor, actor_role, remarks, details, at FROM new_holding_request_events WHERE request_id = $1 ORDER BY at, id`,
    [requestId],
  );
  let desk: string | null = null;
  let since: Date | null = null;
  const totals = new Map<string, { desk: string; label: string; minutes: number; visits: number; ongoing: boolean }>();
  const add = (d: string, m: number, ongoing = false) => {
    const t = totals.get(d) ?? { desk: d, label: DESK_LABEL[d] ?? d, minutes: 0, visits: 0, ongoing: false };
    t.minutes += m;
    t.visits += 1;
    t.ongoing ||= ongoing;
    totals.set(d, t);
  };
  const events = rows.map((e) => {
    const next = EVENT_NEXT_DESK[e.event];
    let minutesAtDesk: number | null = null;
    if (next !== undefined) {
      if (desk && since) {
        minutesAtDesk = minsBetween(since, e.at);
        add(desk, minutesAtDesk);
      }
      desk = next;
      since = e.at;
    }
    return { ...e, label: EVENT_LABEL[e.event] ?? e.event, minutesAtDesk };
  });
  const currentDesk: string | null = desk;
  const currentSince: Date | null = since;
  const minutesAtCurrentDesk = currentDesk && currentSince ? minsBetween(currentSince, new Date()) : null;
  if (currentDesk && minutesAtCurrentDesk !== null) add(currentDesk, minutesAtCurrentDesk, true);
  return { events, deskTimes: [...totals.values()], currentDesk, minutesAtCurrentDesk };
}

/** For the applicant: the trail without officers' names. */
async function publicTrail(requestId: string) {
  return (await listEvents(requestId)).events.map((e) => ({
    at: e.at,
    label: e.label,
    by: e.actor_role === "applicant" ? "You" : DESK_LABEL[e.stage ?? ""] ?? "Nagar Nigam",
    remarks: e.event === "returned" || e.event === "rejected" ? e.remarks : null,
  }));
}

function statusFor(row: NewHoldingRequestRow): { status: string; remarks: string | null } {
  if (row.status === "created") return { status: `Holding created - your holding number is ${row.new_holding_no}`, remarks: null };
  if (row.status === "rejected") {
    return { status: STATUS_TEXT.rejected, remarks: row.duplicate_of_holding ? `This property already has holding number ${row.duplicate_of_holding}. ${row.handling_remarks ?? ""}`.trim() : row.handling_remarks };
  }
  return { status: STATUS_TEXT[row.status], remarks: row.status === "returned" ? row.handling_remarks : null };
}

// --------------------------------------------------------------------------------------------------- applicant view / edit

function editable(row: NewHoldingRequestRow): { editable: boolean; reason: string | null } {
  if (row.status === "submitted" || row.status === "returned") return { editable: true, reason: null };
  if (row.status === "created") return { editable: false, reason: "The holding has been created. Any change now has to be made through the Nagar Nigam office." };
  if (row.status === "rejected") return { editable: false, reason: "This request was not accepted - it cannot be changed. You may apply afresh if needed." };
  return { editable: false, reason: "The Tax Daroga has already processed the request (it is now being verified / approved), so it can no longer be changed online. If something is wrong, contact the Nagar Nigam office." };
}

function applicantView(row: NewHoldingRequestRow) {
  return {
    applicationNo: row.application_no,
    ownerName: row.owner_name,
    relationType: row.relation_type,
    relationName: row.relation_name,
    ownerMobile: row.owner_mobile,
    ownerAadhaarMasked: `XXXX XXXX ${row.owner_aadhaar.slice(-4)}`,
    ownerEmail: row.owner_email,
    applicantName: row.applicant_name,
    applicantMobile: row.applicant_mobile,
    address: row.address,
    landmark: row.landmark,
    ward: row.ward,
    pincode: row.pincode,
    ownershipBasis: row.ownership_basis,
    khataNo: row.khata_no,
    khesraNo: row.khesra_no,
    surveySheetNo: row.survey_sheet_no,
    surveyWard: row.survey_ward,
    plotAreaSqft: row.plot_area_sqft,
    roadType: row.road_type,
    rainWaterHarvesting: row.rain_water_harvesting,
    constructionYear: row.construction_year,
    floors: row.floors,
    submittedAt: row.submitted_at,
    newHoldingNo: row.new_holding_no,
  };
}

/** Application number + mobile (owner's or applicant's): the request, its documents and progress; an edit session when it may be changed. */
export async function viewRequest(applicationNo: string, mobile: string) {
  const { rows } = await pool.query<NewHoldingRequestRow>(`SELECT * FROM new_holding_requests WHERE application_no = $1`, [applicationNo.trim().toUpperCase()]);
  const row = rows[0];
  if (!row || (row.owner_mobile !== mobile && row.applicant_mobile !== mobile)) throw ApiError.notFound("No request matches this application number and mobile number.");
  const e = editable(row);
  let editToken: string | null = null;
  if (e.editable) {
    editToken = crypto.randomBytes(24).toString("base64url");
    await pool.query(`UPDATE new_holding_requests SET edit_token_hash = $2, edit_token_expires_at = now() + interval '60 minutes' WHERE id = $1`, [row.id, hashToken(editToken)]);
  }
  const s = statusFor(row);
  return {
    requestId: row.id,
    editable: e.editable,
    reason: e.reason,
    sentBack: row.status === "returned",
    editToken,
    status: s.status,
    remarks: s.remarks,
    request: applicantView(row),
    documents: (await listDocuments(row.id)).map(({ id, doc_type, file_name, size_bytes, label, given_label }) => ({ id, doc_type, file_name, size_bytes, label, given_label })),
    trail: await publicTrail(row.id),
  };
}

/** Status only (no personal details) by application number. */
export async function requestStatus(applicationNo: string) {
  const { rows } = await pool.query<NewHoldingRequestRow>(`SELECT * FROM new_holding_requests WHERE application_no = $1 AND status <> 'draft'`, [applicationNo.trim().toUpperCase()]);
  const row = rows[0];
  if (!row) throw ApiError.notFound("No request with that number.");
  const s = statusFor(row);
  return { applicationNo: row.application_no, submittedAt: row.submitted_at, ward: row.ward, status: s.status, remarks: s.remarks, newHoldingNo: row.new_holding_no, trail: await publicTrail(row.id) };
}

async function requestForEdit(id: string, token: string): Promise<{ row: NewHoldingRequestRow }> {
  const row = await findById(id);
  if (!row || !row.edit_token_expires_at || row.edit_token_expires_at < new Date() || !sameHash(token, row.edit_token_hash)) {
    throw ApiError.notFound("Your editing session has expired - open the request again.");
  }
  const e = editable(row);
  if (!e.editable) throw ApiError.badRequest(e.reason ?? "This request can no longer be changed.");
  return { row };
}

async function markEdited(row: NewHoldingRequestRow, changed: string[]) {
  await pool.query(`UPDATE new_holding_requests SET edit_count = edit_count + 1, last_edited_at = now() WHERE id = $1`, [row.id]);
  await recordEvent(row.id, "applicant_edited", `${row.applicant_name} (applicant)`, "applicant", null, { changed });
}

const FIELD_LABEL: Record<string, string> = {
  owner_name: "Owner's name",
  relation_type: "Relation",
  relation_name: "Father's / husband's name",
  owner_mobile: "Owner's mobile",
  owner_aadhaar: "Owner's Aadhaar",
  owner_email: "Owner's email",
  applicant_name: "Applicant's name",
  applicant_mobile: "Applicant's mobile",
  address: "Address",
  landmark: "Landmark",
  ward: "Ward",
  pincode: "PIN code",
  ownership_basis: "Basis of ownership",
  khata_no: "Khata no.",
  khesra_no: "Khesra no.",
  survey_sheet_no: "Survey sheet no.",
  survey_ward: "Survey ward",
  plot_area_sqft: "Plot area",
  road_type: "Road type",
  rain_water_harvesting: "Rain water harvesting",
  construction_year: "Year of construction",
  floors: "Floors",
};

/** Floors compared by value (the database returns the JSON keys in its own order). */
function floorsKey(floors: FloorInput[]): string {
  return JSON.stringify(
    (floors ?? []).map((f) => [f.floorLabel, Number(f.buildupSqft), f.constType, f.usageType, f.occupancy, f.yearBuilt || null]),
  );
}

/**
 * Saves the applicant's corrections. A request sent back to the applicant goes to the Tax Daroga again when
 * `resubmit` is set (it must then have all the mandatory documents).
 */
export async function saveEdit(id: string, token: string, input: RequestInput, resubmit: boolean): Promise<{ changed: string[]; resubmitted: boolean }> {
  const { row } = await requestForEdit(id, token);
  const aadhaar = checkAadhaar(input.ownerAadhaar);
  checkPropertyInput(input);
  await assertMobileLimit([input.ownerMobile, input.applicantMobile], row.id);
  const v = rowValues(input, aadhaar) as Record<string, unknown>;
  const changed: string[] = [];
  for (const [k, val] of Object.entries(v)) {
    const before = (row as unknown as Record<string, unknown>)[k];
    const a = k === "floors" ? floorsKey(before as FloorInput[]) : before === null || before === undefined ? "" : String(before);
    const b = k === "floors" ? floorsKey(JSON.parse(String(val)) as FloorInput[]) : val === null || val === undefined ? "" : String(val);
    if (k === "plot_area_sqft" ? Number(a) !== Number(b) : a !== b) changed.push(FIELD_LABEL[k] ?? k);
  }
  const cols = Object.keys(v);
  if (changed.length) {
    await pool.query(`UPDATE new_holding_requests SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(", ")} WHERE id = $1`, [row.id, ...cols.map((c) => v[c])]);
    await markEdited(row, changed);
  }
  let resubmitted = false;
  if (resubmit && row.status === "returned") {
    const missing = await missingDocuments(row.id);
    if (missing.length) throw ApiError.badRequest(`Upload: ${missing.map((t) => DOC_TYPES[t]!.label).join("; ")}.`);
    const r = await pool.query(`UPDATE new_holding_requests SET status = 'submitted', stage_since = now() WHERE id = $1 AND status = 'returned'`, [row.id]);
    if (r.rowCount) {
      resubmitted = true;
      await recordEvent(row.id, "resubmitted", `${row.applicant_name} (applicant)`, "applicant");
    }
  }
  return { changed, resubmitted };
}

// --------------------------------------------------------------------------------------------------- staff

export interface Viewer {
  username: string;
  displayName: string;
  role: string;
}

export async function listRequests(filter: { status?: string; ward?: string }, viewer: Viewer) {
  const params: unknown[] = [];
  let where = `r.status <> 'draft'`;
  if (filter.status) {
    params.push(filter.status);
    where += ` AND r.status = $${params.length}`;
  }
  if (filter.ward) {
    params.push(normalizeWard(filter.ward));
    where += ` AND r.ward = $${params.length}`;
  }
  // A Tax Surveyor sees only the requests assigned to him.
  if (viewer.role === "tax_surveyor") {
    params.push(viewer.username);
    where += ` AND r.assigned_surveyor_username = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT r.id, r.application_no, r.status, r.owner_name, r.applicant_name, r.applicant_mobile, r.ward, r.address, r.plot_area_sqft,
            r.submitted_at, r.handled_by, r.handled_at, r.handling_remarks, r.new_holding_no, r.register_old_holding_no, r.duplicate_of_holding,
            r.assigned_surveyor_name, r.stage_since, jsonb_array_length(r.floors) AS floor_count
       FROM new_holding_requests r WHERE ${where} ORDER BY r.submitted_at DESC LIMIT 1000`,
    params,
  );
  return rows;
}

export type PendingByDesk = Record<"tax_daroga" | "tax_surveyor" | "deputy_commissioner" | "commissioner" | "applicant", number> & { mine: number };

/** Requests waiting at each desk; `mine` = waiting for this login to act. */
export async function pendingCount(viewer: Viewer): Promise<PendingByDesk> {
  const { rows } = await pool.query<{ status: string; n: number; mine: number }>(
    `SELECT status, count(*)::int AS n, count(*) FILTER (WHERE assigned_surveyor_username = $1)::int AS mine
       FROM new_holding_requests WHERE status IN ('submitted', 'returned', 'at_surveyor', 'daroga_review', 'at_dmc', 'at_commissioner') GROUP BY status`,
    [viewer.username],
  );
  const get = (st: string) => rows.find((r) => r.status === st)?.n ?? 0;
  const out = {
    tax_daroga: get("submitted") + get("daroga_review"),
    tax_surveyor: get("at_surveyor"),
    deputy_commissioner: get("at_dmc"),
    commissioner: get("at_commissioner"),
    applicant: get("returned"),
    mine: 0,
  };
  out.mine =
    viewer.role === "tax_surveyor"
      ? rows.find((r) => r.status === "at_surveyor")?.mine ?? 0
      : viewer.role in out
        ? out[viewer.role as keyof typeof out]
        : 0;
  return out;
}

/**
 * Existing holdings that may be the same property - same Aadhaar or mobile on record, same khata + khesra, or an owner
 * with the same name in the same ward - and other requests for it. The Tax Daroga checks these before creating.
 */
async function possibleMatches(row: NewHoldingRequestRow) {
  const words = row.owner_name.toLowerCase().split(/[^a-z\u0900-\u097f]+/).filter((w) => w.length >= 3 && !["kumar", "devi", "prasad", "singh", "kumari"].includes(w));
  const { rows: holdings } = await pool.query<{ holding_no: string; old_holding_no: string | null; owner_name: string; ward: string | null; address: string; mobile_no: string | null; area_sqft: string; reasons: string[] }>(
    `SELECT holding_no, old_holding_no, owner_name, ward, address, mobile_no, area_sqft,
            array_remove(ARRAY[
              CASE WHEN $1::text IS NOT NULL AND aadhaar_number = $1 THEN 'Same Aadhaar' END,
              CASE WHEN mobile_no IN ($2, $3) THEN 'Same mobile' END,
              CASE WHEN $4::text IS NOT NULL AND $5::text IS NOT NULL AND lower(trim(khata_no)) = lower($4) AND lower(trim(khesra_no)) = lower($5) THEN 'Same khata & khesra' END,
              CASE WHEN ward = $6 AND $7::text[] <> '{}' AND lower(owner_name) LIKE ALL (SELECT '%' || w || '%' FROM unnest($7::text[]) w) THEN 'Same owner name in this ward' END
            ], NULL) AS reasons
       FROM properties
      WHERE (holding_no IS DISTINCT FROM $8)
        AND (($1::text IS NOT NULL AND aadhaar_number = $1)
         OR mobile_no IN ($2, $3)
         OR ($4::text IS NOT NULL AND $5::text IS NOT NULL AND lower(trim(khata_no)) = lower($4) AND lower(trim(khesra_no)) = lower($5))
         OR (ward = $6 AND $7::text[] <> '{}' AND lower(owner_name) LIKE ALL (SELECT '%' || w || '%' FROM unnest($7::text[]) w)))
      LIMIT 25`,
    [row.owner_aadhaar, row.owner_mobile, row.applicant_mobile, row.khata_no?.trim() || null, row.khesra_no?.trim() || null, row.ward, words, row.new_holding_no],
  );
  const { rows: requests } = await pool.query<{ id: string; application_no: string; status: string; owner_name: string; ward: string; new_holding_no: string | null }>(
    `SELECT id, application_no, status, owner_name, ward, new_holding_no FROM new_holding_requests
      WHERE id <> $1 AND status <> 'draft'
        AND (owner_aadhaar = $2 OR ($3::text IS NOT NULL AND $4::text IS NOT NULL AND lower(trim(khata_no)) = lower($3) AND lower(trim(khesra_no)) = lower($4)))
      ORDER BY submitted_at DESC LIMIT 10`,
    [row.id, row.owner_aadhaar, row.khata_no?.trim() || null, row.khesra_no?.trim() || null],
  );
  return { holdings, requests };
}

async function staffRow(id: string, viewer: Viewer): Promise<NewHoldingRequestRow> {
  const row = await findById(id);
  if (!row || row.status === "draft") throw ApiError.notFound("Request not found.");
  if (viewer.role === "tax_surveyor" && row.assigned_surveyor_username !== viewer.username) throw new ApiError(403, "This request is not assigned to you.");
  return row;
}

export async function getRequestForStaff(id: string, viewer: Viewer) {
  const row = await staffRow(id, viewer);
  const { upload_token_hash: _u, edit_token_hash: _e, edit_token_expires_at: _x, created_ip: _ip, ...rest } = row;
  const trail = await listEvents(row.id);
  return {
    request: { ...rest, owner_aadhaar: `XXXX XXXX ${row.owner_aadhaar.slice(-4)}`, ownership_basis_label: OWNERSHIP_BASIS[row.ownership_basis] ?? row.ownership_basis },
    documents: await listDocuments(row.id),
    events: trail.events,
    deskTimes: trail.deskTimes,
    currentDesk: trail.currentDesk,
    minutesAtCurrentDesk: trail.minutesAtCurrentDesk,
    fieldReports: await listFieldReports("new_holding", row.id),
    matches: await possibleMatches(row),
    currentFy: currentFy(),
  };
}

export async function documentFileForStaff(requestId: string, docId: string, viewer: Viewer): Promise<{ fullPath: string; mime: string; name: string }> {
  await staffRow(requestId, viewer);
  const { rows } = await pool.query<{ file_path: string; mime_type: string; file_name: string }>(
    `SELECT file_path, mime_type, file_name FROM new_holding_request_documents WHERE id = $1 AND request_id = $2`,
    [docId, requestId],
  );
  const r = rows[0];
  if (!r) throw ApiError.notFound("Document not found.");
  const base = path.resolve(env.PHOTO_UPLOAD_DIR);
  const fullPath = path.resolve(base, r.file_path);
  if (!fullPath.startsWith(base + path.sep)) throw ApiError.notFound("Document not found.");
  return { fullPath, mime: r.mime_type, name: r.file_name };
}

/** Moves the request on only if it is still in `from` (another officer may have acted meanwhile). */
async function move(id: string, from: NewHoldingRequestRow["status"][], to: NewHoldingRequestRow["status"], set: Record<string, unknown> = {}): Promise<NewHoldingRequestRow> {
  const cols = Object.keys(set);
  const { rows } = await pool.query<NewHoldingRequestRow>(
    `UPDATE new_holding_requests SET status = $2, stage_since = now()${cols.map((c, i) => `, ${c} = $${i + 4}`).join("")}
      WHERE id = $1 AND status = ANY($3::text[]) RETURNING *`,
    [id, to, from, ...cols.map((c) => set[c])],
  );
  if (!rows[0]) throw ApiError.badRequest("This request is not at your desk any more (it may have been handled meanwhile) - refresh the page.");
  return rows[0];
}

function requireRole(viewer: Viewer, ...roles: string[]) {
  if (!roles.includes(viewer.role)) throw new ApiError(403, "This step is not for your login.");
}

/**
 * Tax Daroga, first step: no holding exists for the property - it has been entered in the offline demand register
 * under `registerOldHoldingNo`. A Tax Surveyor is chosen for the field verification.
 */
export async function assignRequest(id: string, input: { registerOldHoldingNo: string; surveyorUsername: string; remarks?: string | null }, viewer: Viewer) {
  requireRole(viewer, "tax_daroga");
  const row = await staffRow(id, viewer);
  if (row.status !== "submitted") throw ApiError.badRequest("Only a newly received request can be sent for field verification.");
  const oldNo = input.registerOldHoldingNo.trim().toUpperCase();
  if (!oldNo) throw ApiError.badRequest("Enter the old holding number given in the demand register.");
  await assertRegisterNoFree(oldNo, row.ward);
  const surveyor = await findTaxSurveyor(input.surveyorUsername);
  await move(id, ["submitted"], "at_surveyor", {
    register_old_holding_no: oldNo,
    assigned_surveyor_username: surveyor.username,
    assigned_surveyor_name: surveyor.displayName,
    handled_by: viewer.displayName,
    handled_at: new Date(),
  });
  await recordEvent(id, "assigned", viewer.displayName, viewer.role, input.remarks?.trim().slice(0, 500) || null, {
    registerOldHoldingNo: oldNo,
    surveyor: surveyor.displayName,
    surveyorUsername: surveyor.username,
  });
}

/** Tax Surveyor: field report -> back to the Tax Daroga. */
export async function submitFieldReport(id: string, report: FieldReportInput, viewer: Viewer) {
  requireRole(viewer, "tax_surveyor");
  const row = await staffRow(id, viewer);
  if (row.status !== "at_surveyor") throw ApiError.badRequest("This request is not waiting for a field report.");
  await saveFieldReport("new_holding", id, report, { username: viewer.username, displayName: viewer.displayName });
  await move(id, ["at_surveyor"], "daroga_review");
  await recordEvent(id, "field_report", viewer.displayName, viewer.role, `${report.siteMatches ? "Site matches the request." : "Site does NOT match the request."} ${report.remarks.trim()}`.slice(0, 500), {
    visitedOn: report.visitedOn,
    measuredPlotAreaSqft: report.measuredPlotAreaSqft ?? null,
    measuredBuiltupSqft: report.measuredBuiltupSqft ?? null,
  });
}

export interface VerifiedDetails {
  solidWasteChargeType: string;
  isSlum: boolean;
  ward?: string;
  address?: string;
  plotAreaSqft?: number;
  roadType?: "PMR" | "MR" | "OR";
  constructionYear?: string;
  floors?: FloorInput[];
}

/** Tax Daroga, after the field report: his comments, the user charge type and any corrections -> DMC. */
export async function darogaForward(id: string, input: VerifiedDetails & { remarks: string }, viewer: Viewer) {
  requireRole(viewer, "tax_daroga");
  const row = await staffRow(id, viewer);
  if (row.status !== "daroga_review") throw ApiError.badRequest("This request is not waiting for the Tax Daroga's comments.");
  const { remarks, ...details } = input;
  checkPropertyInput({
    plotAreaSqft: details.plotAreaSqft ?? Number(row.plot_area_sqft),
    constructionYear: details.constructionYear ?? row.construction_year,
    floors: details.floors ?? row.floors,
  });
  const ward = normalizeWard(details.ward ?? row.ward);
  if (row.register_old_holding_no) await assertRegisterNoFree(row.register_old_holding_no, ward);
  const verified = { ...details, ...(details.ward ? { ward } : {}) };
  await move(id, ["daroga_review"], "at_dmc", { verified_details: JSON.stringify(verified) });
  const corrected = (["ward", "address", "plotAreaSqft", "roadType", "constructionYear", "floors"] as const).filter((k) => details[k] !== undefined);
  await recordEvent(id, "daroga_forwarded", viewer.displayName, viewer.role, remarks.trim().slice(0, 500), {
    solidWasteChargeType: details.solidWasteChargeType,
    isSlum: details.isSlum,
    correctedByDaroga: corrected,
  });
}

/** DMC: comments -> Commissioner. */
export async function dmcForward(id: string, remarks: string, viewer: Viewer) {
  requireRole(viewer, "deputy_commissioner");
  await staffRow(id, viewer);
  await move(id, ["at_dmc"], "at_commissioner");
  await recordEvent(id, "dmc_forwarded", viewer.displayName, viewer.role, remarks.trim().slice(0, 500));
}

/** DMC / Commissioner: back to the Tax Daroga for a re-check (he forwards it again with his comments). */
export async function sendBackToDaroga(id: string, remarks: string, viewer: Viewer) {
  requireRole(viewer, "deputy_commissioner", "commissioner");
  await staffRow(id, viewer);
  await move(id, viewer.role === "deputy_commissioner" ? ["at_dmc"] : ["at_commissioner"], "daroga_review");
  await recordEvent(id, "sent_back_to_daroga", viewer.displayName, viewer.role, remarks.trim().slice(0, 500));
}

/** Tax Daroga (before the field visit, or after it): back to the applicant for correction. */
export async function returnToApplicant(id: string, remarks: string, viewer: Viewer): Promise<void> {
  requireRole(viewer, "tax_daroga");
  await staffRow(id, viewer);
  await move(id, ["submitted", "daroga_review"], "returned", { handled_by: viewer.displayName, handled_at: new Date(), handling_remarks: remarks.trim().slice(0, 500) });
  await recordEvent(id, "returned", viewer.displayName, viewer.role, remarks.trim().slice(0, 500));
}

const REJECT_FROM: Record<string, NewHoldingRequestRow["status"][]> = {
  tax_daroga: ["submitted", "daroga_review"],
  deputy_commissioner: ["at_dmc"],
  commissioner: ["at_commissioner"],
};

/** Not accepted (Tax Daroga, DMC or Commissioner at their step); an existing holding's number is recorded and shown. */
export async function rejectRequest(id: string, remarks: string, existingHoldingNo: string | null, viewer: Viewer): Promise<void> {
  requireRole(viewer, "tax_daroga", "deputy_commissioner", "commissioner");
  await staffRow(id, viewer);
  let dup: string | null = null;
  if (existingHoldingNo?.trim()) {
    const { rows } = await pool.query<{ holding_no: string }>(`SELECT holding_no FROM properties WHERE upper(holding_no) = upper($1)`, [existingHoldingNo.trim()]);
    if (!rows[0]) throw ApiError.badRequest(`Holding ${existingHoldingNo.trim()} was not found.`);
    dup = rows[0].holding_no;
  }
  await move(id, REJECT_FROM[viewer.role]!, "rejected", { handled_by: viewer.displayName, handled_at: new Date(), handling_remarks: remarks.trim().slice(0, 500), duplicate_of_holding: dup });
  await recordEvent(id, "rejected", viewer.displayName, viewer.role, remarks.trim().slice(0, 500), dup ? { existingHoldingNo: dup } : null);
}

/**
 * Commissioner's final approval: the holding is created with the next MMC- number, the demand register's number as its
 * old holding number, and the details as verified by the Tax Daroga. Tax is due from the year of construction.
 */
export async function approveAndCreate(id: string, remarks: string | null, viewer: Viewer): Promise<{ holdingNo: string }> {
  requireRole(viewer, "commissioner");
  await staffRow(id, viewer);
  // Claimed first so two clicks cannot create two holdings; put back if creation fails.
  const row = await move(id, ["at_commissioner"], "created", { handled_by: viewer.displayName, handled_at: new Date() });
  try {
    const v = (row.verified_details ?? {}) as Partial<VerifiedDetails>;
    const ward = normalizeWard(v.ward ?? row.ward);
    const oldNo = row.register_old_holding_no;
    if (!oldNo) throw ApiError.badRequest("No old holding number was given from the demand register.");
    if (!v.solidWasteChargeType) throw ApiError.badRequest("The Tax Daroga has not set the solid waste user charge type.");
    await assertRegisterNoFree(oldNo, ward);
    const floors = v.floors ?? row.floors;
    const plot = v.plotAreaSqft ?? Number(row.plot_area_sqft);
    const constructionYear = v.constructionYear ?? row.construction_year;
    checkPropertyInput({ plotAreaSqft: plot, constructionYear, floors });
    const result = await saveNewEntryProperty(
      {
        holdingEntryMode: "new",
        oldHoldingNo: oldNo,
        khesraNo: row.khesra_no,
        surveySheetNo: row.survey_sheet_no,
        khataNo: row.khata_no,
        aadhaarNumber: row.owner_aadhaar,
        ownerName: row.owner_name,
        relationType: (row.relation_type as "S/O" | "D/O" | "W/O" | "C/O" | null) ?? null,
        relationName: row.relation_name,
        mobileNo: row.owner_mobile,
        areaSqft: plot,
        address: (v.address ?? row.address).trim(),
        ward,
        pincode: row.pincode,
        assessmentYear: currentFy(),
        roadType: v.roadType ?? row.road_type,
        rainWaterHarvesting: row.rain_water_harvesting,
        solidWasteChargeType: v.solidWasteChargeType,
        isSlum: !!v.isSlum,
        holdingCreationYear: constructionYear,
        taxPaidTillYear: null,
        // Never assessed before: the user charge is not known to have been paid for any year.
        solidWastePaidTillYear: "",
        floors,
      },
      `${viewer.displayName} (online request ${row.application_no})`,
    );
    await pool.query(
      `UPDATE properties SET latitude = COALESCE($2, latitude), longitude = COALESCE($3, longitude), data_source = $4, survey_ward = COALESCE($5, survey_ward) WHERE holding_no = $1`,
      [result.holdingNo, row.latitude, row.longitude, `Online new holding request ${row.application_no}`, row.survey_ward],
    );
    await pool.query(`UPDATE new_holding_requests SET new_holding_no = $2, handling_remarks = $3 WHERE id = $1`, [row.id, result.holdingNo, remarks?.trim().slice(0, 500) || null]);
    await recordEvent(row.id, "created", viewer.displayName, viewer.role, remarks?.trim().slice(0, 500) || null, { holdingNo: result.holdingNo, registerOldHoldingNo: oldNo });
    return { holdingNo: result.holdingNo };
  } catch (err) {
    await pool.query(`UPDATE new_holding_requests SET status = 'at_commissioner' WHERE id = $1 AND status = 'created' AND new_holding_no IS NULL`, [row.id]);
    throw err;
  }
}
