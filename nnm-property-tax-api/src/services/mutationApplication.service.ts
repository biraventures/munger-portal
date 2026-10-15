import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Request } from "express";
import { pool } from "../config/db";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { normalizeWard } from "../utils/ward";
import { propertyRepository } from "../repositories/property.repository";
import { changeRequestRepository } from "../repositories/changeRequest.repository";
import { searchPropertyByHoldingNo } from "./property.service";
import { TIER_FINAL_STAGE } from "./changeClassification.service";
import { annualSolidWasteCharge, solidWasteYearsDue } from "./charges.service";
import type { FloorRow, PropertyRow } from "../types/property.types";
import type { PropertySaveInput } from "../types/propertySave.types";

/**
 * Online mutation applications from the public (migration 131).
 *
 *   draft  --(documents uploaded, submit)-->  in_chain          (holding verified: a "Mutation" change request is
 *                                                                created at stage 1, Tax Daroga, and walks the
 *                                                                normal chain to the Commissioner)
 *                                        or  awaiting_holding  (holding entered by hand: the Tax Daroga links it to
 *                                                                the right holding -> in_chain, or rejects it)
 *
 * A draft is reachable only with the upload token handed out when it was created; the application number given at
 * submission shows the status only, never personal details.
 */

export const TRANSFER_BASIS: Record<string, string> = {
  sale_deed: "Sale deed",
  partition: "Partition",
  gift: "Gift",
  inheritance: "Inheritance",
  auction: "Auction sale / purchase",
};

export const DOC_TYPES: Record<string, { label: string; images: boolean; pdf: boolean }> = {
  transfer_proof: { label: "Proof of transfer (sale deed / partition / gift / inheritance / will / khatian copy)", images: true, pdf: true },
  jamabandi_new: { label: "Updated jamabandi receipt", images: true, pdf: true },
  jamabandi_old: { label: "Old jamabandi receipt", images: true, pdf: true },
  shudhi_patra: { label: "Mutation correction slip (Shudhi patra) issued by CO", images: true, pdf: true },
  aadhaar: { label: "Aadhaar card of the new owner", images: true, pdf: true },
  holding_photo: { label: "Photo of the holding / building / plot", images: true, pdf: false },
  affidavit: { label: "Affidavit on stamp paper", images: true, pdf: true },
  vanshavali: { label: "Vanshavali / family tree / parivarik suchi", images: true, pdf: true },
};

/** One mobile number (as applicant or as new owner) may be on at most this many applications, rejected ones aside. */
export const MAX_APPLICATIONS_PER_MOBILE = 2;

/** Submitted applications (not drafts, not finally rejected) that carry this mobile number as applicant or new owner. */
async function applicationsForMobile(mobile: string, excludeId?: string): Promise<number> {
  const { rows } = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n
       FROM mutation_applications a LEFT JOIN property_change_requests c ON c.id = a.change_request_id
      WHERE a.status IN ('awaiting_holding', 'in_chain') AND COALESCE(c.status, '') <> 'rejected'
        AND (a.applicant_mobile = $1 OR a.new_owner_mobile = $1) AND ($2::bigint IS NULL OR a.id <> $2::bigint)`,
    [mobile, excludeId ?? null],
  );
  return rows[0]?.n ?? 0;
}

async function assertMobileLimit(mobiles: string[], excludeId?: string): Promise<void> {
  for (const m of [...new Set(mobiles)]) {
    if ((await applicationsForMobile(m, excludeId)) >= MAX_APPLICATIONS_PER_MOBILE) {
      throw ApiError.badRequest(`Mobile number ${m} is already on ${MAX_APPLICATIONS_PER_MOBILE} mutation applications - no more can be made with it.`);
    }
  }
}

const MANDATORY_DOCS = ["transfer_proof", "aadhaar", "holding_photo"];
const MAX_DOC_BYTES = 10 * 1024 * 1024;
const MAX_FILES_PER_TYPE = 5;

export interface MutationApplicationRow {
  id: string;
  application_no: string | null;
  status: "draft" | "awaiting_holding" | "in_chain" | "rejected";
  holding_no: string | null;
  entered_old_holding_no: string | null;
  entered_ward: string | null;
  entered_address: string | null;
  entered_tax_paid_till: string | null;
  entered_sw_paid_till: string | null;
  new_owner_name: string;
  new_owner_relation_type: string | null;
  new_owner_relation_name: string | null;
  new_owner_mobile: string;
  new_owner_aadhaar: string;
  new_owner_email: string | null;
  applicant_name: string;
  applicant_mobile: string;
  transfer_basis: string;
  transfer_date: Date;
  latitude: string | null;
  longitude: string | null;
  gps_accuracy_m: string | null;
  upload_token_hash: string;
  change_request_id: string | null;
  handled_by: string | null;
  handled_at: Date | null;
  handling_remarks: string | null;
  created_at: Date;
  submitted_at: Date | null;
}

// --------------------------------------------------------------------------------------------------- helpers

/** Verhoeff checksum - every genuine Aadhaar number passes it, so a typo is caught here. */
export function isValidAadhaar(n: string): boolean {
  if (!/^[2-9]\d{11}$/.test(n)) return false;
  const d = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
  ];
  const p = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
  ];
  let c = 0;
  n.split("").reverse().forEach((ch, i) => {
    c = d[c]![p[i % 8]![Number(ch)]!]!;
  });
  return c === 0;
}

const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

function tokenMatches(row: MutationApplicationRow, token: string): boolean {
  const given = Buffer.from(hashToken(token), "hex");
  const stored = Buffer.from(row.upload_token_hash, "hex");
  return given.length === stored.length && crypto.timingSafeEqual(given, stored);
}

async function findById(id: string): Promise<MutationApplicationRow | null> {
  const { rows } = await pool.query<MutationApplicationRow>(`SELECT * FROM mutation_applications WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

/** A draft, opened with its upload token. Same "not found" for a wrong id or token. */
async function draftWithToken(id: string, token: string): Promise<MutationApplicationRow> {
  const row = /^\d{1,18}$/.test(id) ? await findById(id) : null;
  if (!row || !token || !tokenMatches(row, token)) throw ApiError.notFound("Application not found.");
  if (row.status !== "draft") throw ApiError.badRequest("This application has already been submitted.");
  return row;
}

interface HoldingCheck {
  ok: boolean;
  reason: string | null;
  duesPending: number;
}

/** Can a mutation be applied for on this holding right now? Dues must be cleared and no mutation already in process. */
async function checkHolding(holdingNo: string): Promise<HoldingCheck & { property: PropertyRow | null; info: Record<string, unknown> | null }> {
  const result = await searchPropertyByHoldingNo(holdingNo);
  if (!result.found || !result.property) return { ok: false, reason: "not_found", duesPending: 0, property: null, info: null };
  const p = result.property as unknown as PropertyRow & { totalPayable: string; solid_waste_paid_till_year?: string | null };
  const info = {
    holdingNo: p.holding_no,
    ward: p.ward,
    address: p.address,
    taxPaidTillYear: p.tax_paid_till_year,
    solidWastePaidTillYear: p.solid_waste_paid_till_year ?? null,
  };
  if (p.is_disputed) return { ok: false, reason: "This holding is under a dispute. Please contact the Holding Tax Section, Nagar Nigam Munger.", duesPending: 0, property: p, info };
  // Only EARLIER years must be cleared: the current year's holding tax and user charge may stay unpaid, so the new
  // owner can pay them and get this year's receipt in his own name. Earlier years = holding-tax arrears with their
  // penalty, plus the user charge for every unpaid year before the current one.
  const extra = p as unknown as { pendingArrearsTotal?: string; autoPenalty?: string };
  const pastUserChargeYears = Math.max(0, solidWasteYearsDue(p) - 1);
  const dues = Math.ceil(Number(extra.pendingArrearsTotal ?? 0) + Number(extra.autoPenalty ?? 0) + annualSolidWasteCharge(p) * pastUserChargeYears);
  if (dues > 0) return { ok: false, reason: "dues", duesPending: dues, property: p, info };
  const pending = await changeRequestRepository.findPendingForHolding(holdingNo);
  if (pending) return { ok: false, reason: "A mutation / correction for this holding is already in process. Please wait for it to be decided.", duesPending: 0, property: p, info };
  const { rows } = await pool.query(`SELECT 1 FROM mutation_applications WHERE holding_no = $1 AND status = 'awaiting_holding' LIMIT 1`, [holdingNo]);
  if (rows.length) return { ok: false, reason: "An online mutation application for this holding is already waiting to be processed.", duesPending: 0, property: p, info };
  return { ok: true, reason: null, duesPending: 0, property: p, info };
}

/** Public holding lookup for the form: ward, address and paid-till years only (no owner name, mobile or Aadhaar). */
export async function lookupHoldingForMutation(holdingNo: string) {
  const c = await checkHolding(holdingNo.trim());
  if (c.reason === "not_found") return { found: false as const };
  return {
    found: true as const,
    ...c.info,
    canApply: c.ok,
    duesPending: c.duesPending ? c.duesPending.toFixed(2) : "0.00",
    message: c.reason === "dues" ? "Holding tax / user charge of earlier years is pending on this holding. Clear it first, then apply for mutation (this year's tax can be paid after the mutation)." : c.reason,
  };
}

// --------------------------------------------------------------------------------------------------- draft

export interface CreateApplicationInput {
  holdingNo?: string | null;
  manual?: { oldHoldingNo: string; ward: string; address: string; taxPaidTillYear?: string | null; solidWastePaidTillYear?: string | null } | null;
  newOwnerName: string;
  newOwnerRelationType?: "S/O" | "D/O" | "W/O" | "C/O" | null;
  newOwnerRelationName?: string | null;
  newOwnerMobile: string;
  newOwnerAadhaar: string;
  newOwnerEmail?: string | null;
  applicantName: string;
  applicantMobile: string;
  transferBasis: string;
  transferDate: string;
  latitude: number;
  longitude: number;
  gpsAccuracy?: number | null;
}

export async function createDraft(input: CreateApplicationInput, ip: string | null): Promise<{ applicationId: string; uploadToken: string }> {
  if (!isValidAadhaar(input.newOwnerAadhaar)) throw ApiError.badRequest("The Aadhaar number is not valid - please check it.");
  if (!TRANSFER_BASIS[input.transferBasis]) throw ApiError.badRequest("Choose the basis of mutation.");
  if (new Date(input.transferDate) > new Date()) throw ApiError.badRequest("The date of transfer cannot be in the future.");
  await assertMobileLimit([input.applicantMobile, input.newOwnerMobile]);

  let holdingNo: string | null = null;
  if (input.holdingNo) {
    const c = await checkHolding(input.holdingNo.trim());
    if (c.reason === "not_found") throw ApiError.badRequest("This holding number was not found. Check it, or apply with the old holding number and ward.");
    if (!c.ok) throw ApiError.badRequest(c.reason === "dues" ? `Dues of earlier years (₹${c.duesPending.toFixed(2)}) are pending on this holding. Pay them first, then apply.` : c.reason!);
    holdingNo = c.property!.holding_no;
  } else if (!input.manual) {
    throw ApiError.badRequest("Enter the holding number, or the old holding number with the ward.");
  }

  const token = crypto.randomBytes(24).toString("base64url");
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO mutation_applications (
       holding_no, entered_old_holding_no, entered_ward, entered_address, entered_tax_paid_till, entered_sw_paid_till,
       new_owner_name, new_owner_relation_type, new_owner_relation_name, new_owner_mobile, new_owner_aadhaar, new_owner_email,
       applicant_name, applicant_mobile, transfer_basis, transfer_date, latitude, longitude, gps_accuracy_m, upload_token_hash, created_ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING id`,
    [
      holdingNo,
      holdingNo ? null : input.manual!.oldHoldingNo.trim(),
      holdingNo ? null : normalizeWard(input.manual!.ward) || input.manual!.ward.trim(),
      holdingNo ? null : input.manual!.address.trim(),
      holdingNo ? null : input.manual!.taxPaidTillYear || null,
      holdingNo ? null : input.manual!.solidWastePaidTillYear || null,
      input.newOwnerName.trim(),
      input.newOwnerRelationType ?? null,
      input.newOwnerRelationName?.trim() || null,
      input.newOwnerMobile,
      input.newOwnerAadhaar,
      input.newOwnerEmail?.trim() || null,
      input.applicantName.trim(),
      input.applicantMobile,
      input.transferBasis,
      input.transferDate,
      input.latitude,
      input.longitude,
      input.gpsAccuracy ?? null,
      hashToken(token),
      ip,
    ],
  );
  return { applicationId: rows[0]!.id, uploadToken: token };
}

/** Streams one document (raw body: PDF / JPEG / PNG, up to 10 MB) into the draft. */
export async function addDocument(req: Request, id: string, token: string, docType: string, fileName: string) {
  const app = await draftWithToken(id, token);
  const spec = DOC_TYPES[docType];
  if (!spec) throw ApiError.badRequest("Unknown document type.");
  const mime = String(req.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
  const ext = mime === "application/pdf" ? "pdf" : mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : null;
  if (!ext || (ext === "pdf" && !spec.pdf)) throw ApiError.badRequest(spec.pdf ? "Upload a PDF, JPG or PNG file." : "Upload a JPG or PNG photo.");
  if (Number(req.headers["content-length"] ?? 0) > MAX_DOC_BYTES) throw new ApiError(413, "The file is too large - the limit is 10 MB.");
  const { rows: count } = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM mutation_application_documents WHERE application_id = $1 AND doc_type = $2`, [app.id, docType]);
  if ((count[0]?.n ?? 0) >= MAX_FILES_PER_TYPE) throw ApiError.badRequest(`At most ${MAX_FILES_PER_TYPE} files for one document type.`);

  const rel = path.join("mutation-applications", app.id, `${docType}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`);
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
        if (size > MAX_DOC_BYTES) {
          reject(new ApiError(413, "The file is too large - the limit is 10 MB."));
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
    `INSERT INTO mutation_application_documents (application_id, doc_type, file_path, mime_type, size_bytes, file_name)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, doc_type, file_name, size_bytes, uploaded_at`,
    [app.id, docType, rel, mime, size, fileName.replace(/[\\/"<>]/g, "_").slice(0, 255) || `${docType}.${ext}`],
  );
  return rows[0];
}

export async function removeDocument(id: string, token: string, docId: string): Promise<void> {
  const app = await draftWithToken(id, token);
  const { rows } = await pool.query<{ file_path: string }>(`DELETE FROM mutation_application_documents WHERE id = $1 AND application_id = $2 RETURNING file_path`, [docId, app.id]);
  if (!rows[0]) throw ApiError.notFound("Document not found.");
  await fs.promises.unlink(path.join(env.PHOTO_UPLOAD_DIR, rows[0].file_path)).catch(() => undefined);
}

export async function listDocuments(applicationId: string) {
  const { rows } = await pool.query(
    `SELECT id, doc_type, file_name, mime_type, size_bytes, uploaded_at FROM mutation_application_documents WHERE application_id = $1 ORDER BY doc_type, id`,
    [applicationId],
  );
  return rows;
}

export async function draftDocuments(id: string, token: string) {
  const app = await draftWithToken(id, token);
  return listDocuments(app.id);
}

// --------------------------------------------------------------------------------------------------- submit / chain

/** The whole holding as it stands, as a save input - the mutation changes only the owner fields on top of it. */
export function saveInputFromProperty(p: PropertyRow, floors: FloorRow[]): PropertySaveInput {
  const n = (v: string | null | undefined) => Number(v ?? 0);
  return {
    oldHoldingNo: p.old_holding_no,
    oldPid: p.old_pid,
    khesraNo: p.khesra_no,
    surveySheetNo: p.survey_sheet_no,
    khataNo: p.khata_no,
    aadhaarNumber: p.aadhaar_number,
    ownerName: p.owner_name,
    relationType: (p.relation_type as PropertySaveInput["relationType"]) ?? null,
    relationName: p.relation_name,
    mobileNo: p.mobile_no,
    areaSqft: n(p.area_sqft),
    address: p.address,
    ward: p.ward,
    zone: p.zone,
    pincode: p.pincode,
    assessmentYear: p.assessment_year,
    roadType: p.road_type,
    vacantAreaSqft: n(p.vacant_area_sqft),
    rainWaterHarvesting: p.rain_water_harvesting,
    arrearTax: n(p.arrear_tax),
    solidWasteChargeType: p.solid_waste_charge_type,
    solidWasteMonths: p.solid_waste_months,
    isBwg: p.is_bwg,
    isSlum: p.is_slum,
    penalCharge: n(p.penal_charge),
    waterCharge: n(p.water_charge),
    boringCharge: n(p.boring_charge),
    formFee: n(p.form_fee),
    miscCost: n(p.misc_cost),
    miscCostReason: p.misc_cost_reason,
    miscRebate: n(p.misc_rebate),
    miscRebateReason: p.misc_rebate_reason,
    penalty: n(p.penalty),
    outstandingDemand: n(p.outstanding_demand),
    holdingCreationYear: p.holding_creation_year,
    taxPaidTillYear: p.tax_paid_till_year,
    presentHoldingName: p.present_holding_name,
    presentCategory: p.present_category,
    floors: floors.map((f) => ({
      floorLabel: f.floor_label,
      buildupSqft: Number(f.buildup_sqft),
      constType: f.const_type as "RCC" | "Asbestos" | "Other",
      usageType: f.usage_type,
      occupancy: f.occupancy,
      yearBuilt: f.year_built,
      closingYear: f.closing_year,
    })),
  };
}

/** Owner fields the mutation sets, from the application. */
function ownerOverlay(app: MutationApplicationRow): Pick<PropertySaveInput, "ownerName" | "relationType" | "relationName" | "mobileNo" | "aadhaarNumber"> {
  return {
    ownerName: app.new_owner_name,
    relationType: (app.new_owner_relation_type as PropertySaveInput["relationType"]) ?? null,
    relationName: app.new_owner_relation_name,
    mobileNo: app.new_owner_mobile,
    aadhaarNumber: app.new_owner_aadhaar,
  };
}

function changeReference(app: MutationApplicationRow): string {
  const d = app.transfer_date instanceof Date ? app.transfer_date : new Date(app.transfer_date);
  const date = `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
  return `Online mutation application ${app.application_no}: ${TRANSFER_BASIS[app.transfer_basis]} dated ${date}; applicant ${app.applicant_name} (${app.applicant_mobile})`;
}

/** Puts the application into the mutation chain as a change request at stage 1 (Tax Daroga). */
async function enterChain(app: MutationApplicationRow, holdingNo: string): Promise<string> {
  const property = await propertyRepository.findByHoldingNo(holdingNo);
  if (!property) throw ApiError.badRequest("Holding not found.");
  const floors = await propertyRepository.findFloorsByHoldingNo(holdingNo);
  const input: PropertySaveInput = { ...saveInputFromProperty(property, floors), ...ownerOverlay(app), changeBasis: "Mutation", changeReference: changeReference(app) };
  const cr = await changeRequestRepository.create(holdingNo, `Online application - ${app.applicant_name}`, "Mutation", changeReference(app), input, "mutation", TIER_FINAL_STAGE.mutation);
  await pool.query(`UPDATE property_change_requests SET public_application_id = $2 WHERE id = $1`, [cr.id, app.id]);
  return String(cr.id);
}

async function nextApplicationNo(): Promise<string> {
  const { rows } = await pool.query<{ n: string }>(`SELECT nextval('mutation_application_seq')::text AS n`);
  const yy = new Date().getFullYear() % 100;
  const check = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[crypto.randomInt(0, 32)];
  return `MUT${yy}${rows[0]!.n.padStart(6, "0")}${check}`;
}

export async function submitApplication(id: string, token: string): Promise<{ applicationNo: string; status: string }> {
  const app = await draftWithToken(id, token);
  const { rows: docs } = await pool.query<{ doc_type: string }>(`SELECT DISTINCT doc_type FROM mutation_application_documents WHERE application_id = $1`, [app.id]);
  const have = new Set(docs.map((d) => d.doc_type));
  const required = [...MANDATORY_DOCS, ...(app.transfer_basis === "inheritance" ? ["vanshavali"] : [])];
  const missing = required.filter((t) => !have.has(t));
  if (missing.length) throw ApiError.badRequest(`Upload: ${missing.map((t) => DOC_TYPES[t]!.label).join("; ")}.`);
  if (app.latitude === null || app.longitude === null) throw ApiError.badRequest("Capture the GPS location of the holding.");
  // Checked again here: other applications with the same number may have been submitted since this draft began.
  await assertMobileLimit([app.applicant_mobile, app.new_owner_mobile], app.id);

  if (app.holding_no) {
    const c = await checkHolding(app.holding_no);
    if (!c.ok) throw ApiError.badRequest(c.reason === "dues" ? `Dues of earlier years (₹${c.duesPending.toFixed(2)}) are pending on this holding. Pay them first, then submit.` : c.reason!);
  }

  const applicationNo = await nextApplicationNo();
  const status = app.holding_no ? "in_chain" : "awaiting_holding";
  await pool.query(`UPDATE mutation_applications SET application_no = $2, status = $3, submitted_at = now() WHERE id = $1 AND status = 'draft'`, [app.id, applicationNo, status]);
  if (app.holding_no) {
    const fresh = (await findById(app.id))!;
    const crId = await enterChain(fresh, app.holding_no);
    await pool.query(`UPDATE mutation_applications SET change_request_id = $2 WHERE id = $1`, [app.id, crId]);
  }
  return { applicationNo, status };
}

const STAGE_LABEL: Record<string, string> = {
  tax_daroga: "Tax Daroga",
  mutation_nodal_clerk: "Mutation Nodal Clerk",
  deputy_commissioner: "Deputy Municipal Commissioner",
  commissioner: "Municipal Commissioner",
};

/** Public status by application number - progress only, no personal details. */
export async function applicationStatus(applicationNo: string) {
  const { rows } = await pool.query<MutationApplicationRow & { cr_status: string | null; cr_stage: string | null; cr_notes: string | null; cr_decided: Date | null }>(
    `SELECT a.*, c.status AS cr_status, c.current_stage AS cr_stage, c.review_notes AS cr_notes, c.final_decided_at AS cr_decided
       FROM mutation_applications a LEFT JOIN property_change_requests c ON c.id = a.change_request_id
      WHERE a.application_no = $1`,
    [applicationNo.trim().toUpperCase()],
  );
  const a = rows[0];
  if (!a) throw ApiError.notFound("No application with that number.");
  let status: string;
  let detail: string | null = null;
  if (a.status === "awaiting_holding") status = "Received - the holding is being identified by the Tax Daroga";
  else if (a.status === "rejected") {
    status = "Not accepted";
    detail = a.handling_remarks;
  } else if (a.cr_status === "approved") status = "Approved - mutation done";
  else if (a.cr_status === "rejected") {
    status = "Rejected";
    detail = a.cr_notes;
  } else if (a.cr_status === "reverted") status = "Returned for correction at the Nagar Nigam office";
  else status = `Under process - with the ${STAGE_LABEL[a.cr_stage ?? ""] ?? "office"}`;
  return {
    applicationNo: a.application_no,
    holdingNo: a.holding_no ?? null,
    basis: TRANSFER_BASIS[a.transfer_basis],
    submittedAt: a.submitted_at,
    status,
    remarks: detail,
    decidedAt: a.cr_decided ?? a.handled_at,
  };
}

// --------------------------------------------------------------------------------------------------- staff

export async function listApplications(filter: { status?: string }) {
  const params: unknown[] = [];
  let where = `a.status <> 'draft'`;
  if (filter.status) {
    params.push(filter.status);
    where += ` AND a.status = $1`;
  }
  const { rows } = await pool.query(
    `SELECT a.id, a.application_no, a.status, a.holding_no, a.entered_old_holding_no, a.entered_ward, a.entered_address,
            a.new_owner_name, a.applicant_name, a.applicant_mobile, a.transfer_basis, a.transfer_date, a.submitted_at,
            a.change_request_id, c.status AS change_request_status, c.current_stage, a.handled_by, a.handling_remarks
       FROM mutation_applications a LEFT JOIN property_change_requests c ON c.id = a.change_request_id
      WHERE ${where} ORDER BY a.submitted_at DESC LIMIT 1000`,
    params,
  );
  return rows;
}

/** Full application for staff (Aadhaar shown masked). */
export async function getApplicationForStaff(id: string) {
  const a = await findById(id);
  if (!a || a.status === "draft") throw ApiError.notFound("Application not found.");
  const { upload_token_hash: _drop, created_ip: _ip, ...rest } = a as MutationApplicationRow & { created_ip?: string };
  return {
    application: { ...rest, new_owner_aadhaar: `XXXX XXXX ${a.new_owner_aadhaar.slice(-4)}`, basis_label: TRANSFER_BASIS[a.transfer_basis] },
    documents: (await listDocuments(a.id)).map((d) => ({ ...d, label: DOC_TYPES[d.doc_type as string]?.label ?? d.doc_type })),
  };
}

export async function documentFileForStaff(appId: string, docId: string): Promise<{ fullPath: string; mime: string; name: string }> {
  const { rows } = await pool.query<{ file_path: string; mime_type: string; file_name: string; status: string }>(
    `SELECT d.file_path, d.mime_type, d.file_name, a.status FROM mutation_application_documents d JOIN mutation_applications a ON a.id = d.application_id
      WHERE d.id = $1 AND d.application_id = $2`,
    [docId, appId],
  );
  const r = rows[0];
  if (!r || r.status === "draft") throw ApiError.notFound("Document not found.");
  const base = path.resolve(env.PHOTO_UPLOAD_DIR);
  const fullPath = path.resolve(base, r.file_path);
  if (!fullPath.startsWith(base + path.sep)) throw ApiError.notFound("Document not found.");
  return { fullPath, mime: r.mime_type, name: r.file_name };
}

/** Tax Daroga: a manually entered application is linked to its holding and enters the chain. */
export async function linkApplicationToHolding(id: string, holdingNo: string, by: string): Promise<{ changeRequestId: string }> {
  const a = await findById(id);
  if (!a || a.status !== "awaiting_holding") throw ApiError.badRequest("This application is not waiting to be linked.");
  const c = await checkHolding(holdingNo.trim());
  if (c.reason === "not_found") throw ApiError.badRequest("Holding not found.");
  if (!c.ok) throw ApiError.badRequest(c.reason === "dues" ? `₹${c.duesPending.toFixed(2)} of earlier years' dues is pending on this holding - it must be paid before the mutation can proceed.` : c.reason!);
  const hn = c.property!.holding_no;
  const claimed = await pool.query(`UPDATE mutation_applications SET status = 'in_chain', holding_no = $2, handled_by = $3, handled_at = now() WHERE id = $1 AND status = 'awaiting_holding'`, [id, hn, by]);
  if (!claimed.rowCount) throw ApiError.badRequest("This application was handled meanwhile.");
  const crId = await enterChain((await findById(id))!, hn);
  await pool.query(`UPDATE mutation_applications SET change_request_id = $2 WHERE id = $1`, [id, crId]);
  return { changeRequestId: crId };
}

export async function rejectApplication(id: string, remarks: string, by: string): Promise<void> {
  if (!remarks.trim()) throw ApiError.badRequest("Give the reason.");
  const r = await pool.query(
    `UPDATE mutation_applications SET status = 'rejected', handled_by = $2, handled_at = now(), handling_remarks = $3 WHERE id = $1 AND status = 'awaiting_holding'`,
    [id, by, remarks.trim().slice(0, 500)],
  );
  if (!r.rowCount) throw ApiError.badRequest("This application is not waiting to be linked.");
}

/**
 * At final approval of a change request that came from an online application, the mutation is applied to the
 * holding AS IT IS THEN (it may have been paid or edited while the request was in the chain): the live record with
 * only the owner fields from the application, never the snapshot taken at submission.
 */
export async function liveInputForApplication(applicationId: string, holdingNo: string, proposed: PropertySaveInput): Promise<PropertySaveInput> {
  const property = await propertyRepository.findByHoldingNo(holdingNo);
  if (!property) throw ApiError.badRequest("Holding not found.");
  const floors = await propertyRepository.findFloorsByHoldingNo(holdingNo);
  void applicationId;
  return {
    ...saveInputFromProperty(property, floors),
    ownerName: proposed.ownerName,
    relationType: proposed.relationType ?? null,
    relationName: proposed.relationName ?? null,
    mobileNo: proposed.mobileNo ?? null,
    aadhaarNumber: proposed.aadhaarNumber ?? null,
    changeBasis: "Mutation",
    changeReference: proposed.changeReference ?? null,
  };
}
