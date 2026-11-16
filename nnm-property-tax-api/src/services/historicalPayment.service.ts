import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pool } from "../config/db";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { assertUploadSize } from "../utils/uploadLimits";
import { getCurrentAssessmentYearStartNum, parseYearStartOrNull } from "../utils/assessmentYear";
import { propertyRepository } from "../repositories/property.repository";
import { propertySaveRepository } from "../repositories/propertySave.repository";
import { missingTaxYears, stageForYear, yearRangesLabel, yearTax } from "./arrears.service";
import type { AdminTokenPayload } from "../types/admin.types";
import type { PropertyRow, TaxHistoryStageRow } from "../types/property.types";

/**
 * Historical part payments on old holdings. Some old holdings show large arrears though the owner paid in parts over
 * the years - amounts of the payer's own choosing, not the annual tax - so it is not clear how the old years stand.
 *
 * The Tax Daroga records each old payment (date, amount, old receipt / register reference, proof). The payments are
 * pooled and settled against the holding tax year by year, starting from the earliest pending year (the year after
 * "tax paid till", or the creation year): each year is cleared in full before the next one. The result is a
 * year-by-year statement - years fully paid, at most one year paid in part, and the years still due. Holding tax only:
 * no late fee is charged on the years the old payments cover.
 *
 * The City Manager approves. Approval moves "tax paid till" to the last year fully covered and records only the unpaid
 * balance as the tax of the year paid in part (a one-year override stage), so the demand notice, part payment and
 * online payment then work unchanged. Unpaid demand notices are closed (they were billed on the old figures). The
 * settlement is written to the holding history, and the old payments appear in the holding's payment history.
 * While a settlement waits for approval, no tax is collected on the holding (discrepancyHold.service).
 */

export const ENTER_ROLES = ["tax_daroga"] as const;
export const APPROVE_ROLES = ["city_manager"] as const;
export const VIEW_ROLES = ["tax_daroga", "city_manager", "deputy_commissioner", "commissioner"] as const;

export interface PaymentInput {
  paidOn: string; // YYYY-MM-DD
  amount: number;
  reference: string;
  remarks?: string | null;
}

export interface StatementYear {
  year: number;
  label: string;
  tax: number;
  paid: number;
  balance: number;
  /** Which old payments (by their position in the entered list) cleared this year, and how much of each. */
  from: { index: number; amount: number }[];
}

export interface Settlement {
  startYear: number;
  startLabel: string;
  previousTaxPaidTillYear: string | null;
  totalPaid: number;
  totalSettled: number;
  /** Paid beyond everything due up to the current year - cannot be settled. */
  excess: number;
  statement: StatementYear[];
  /** "Tax paid till" after approval (null: no year fully covered, it stays as it is). */
  paidTillYearAfter: string | null;
  partial: { year: number; label: string; paid: number; balance: number } | null;
  /** Holding tax still due after the settlement (to the last completed year) - before any late fee. */
  dueAfter: number;
  dueBefore: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const label = (y: number) => `${y}-${y + 1}`;

/** Pools the payments and settles them year by year from the earliest pending year. */
export function settle(property: PropertyRow, stages: TaxHistoryStageRow[], payments: PaymentInput[]): Settlement {
  const creation = parseYearStartOrNull(property.holding_creation_year);
  if (creation === null) throw ApiError.badRequest("The holding has no creation year - set it first, then the payments can be settled.");
  const missing = missingTaxYears(property, stages);
  if (missing.length)
    throw ApiError.badRequest(
      `No tax assessment is on file for ${yearRangesLabel(missing)}. ` +
        (missing.some((y) => y < 2011)
          ? "Enter the ARV of the years before 2011-12 from the old demand register first (Pre-2011 ARV Entry), then settle the payments."
          : "Complete the holding's tax history first."),
    );
  const paidTill = parseYearStartOrNull(property.tax_paid_till_year) ?? creation - 1;
  const startYear = Math.max(paidTill + 1, creation);
  const currentYear = getCurrentAssessmentYearStartNum();
  const lastCompleted = currentYear - 1;

  // Earliest payment first, so each year shows the payments that actually cleared it.
  const order = payments.map((p, index) => ({ ...p, index })).sort((a, b) => a.paidOn.localeCompare(b.paidOn) || a.index - b.index);
  const left = order.map((p) => ({ index: p.index, amount: r2(p.amount) }));
  const totalPaid = r2(left.reduce((s, p) => s + p.amount, 0));

  const statement: StatementYear[] = [];
  let dueBefore = 0;
  for (let y = startYear; y <= currentYear; y++) {
    const stage = stageForYear(stages, y);
    const tax = stage ? r2(yearTax(property, stage, y)) : 0;
    if (y <= lastCompleted) dueBefore += tax;
    let need = tax;
    const from: { index: number; amount: number }[] = [];
    for (const p of left) {
      if (need <= 0) break;
      if (p.amount <= 0) continue;
      const take = r2(Math.min(p.amount, need));
      p.amount = r2(p.amount - take);
      need = r2(need - take);
      from.push({ index: p.index, amount: take });
    }
    statement.push({ year: y, label: label(y), tax, paid: r2(tax - need), balance: need, from });
  }
  const excess = r2(left.reduce((s, p) => s + p.amount, 0));

  // The years cleared from the start run up to the last one a payment reached in full (a year with no tax in between
  // counts as cleared); the first year not cleared may be paid in part.
  let lastFull: number | null = null;
  let partial: Settlement["partial"] = null;
  for (const s of statement) {
    if (s.balance > 0) {
      if (s.paid > 0) partial = { year: s.year, label: s.label, paid: s.paid, balance: s.balance };
      break;
    }
    if (s.paid > 0) lastFull = s.year;
  }
  const dueAfter = r2(statement.filter((s) => s.year <= lastCompleted).reduce((sum, s) => sum + s.balance, 0));
  return {
    startYear,
    startLabel: label(startYear),
    previousTaxPaidTillYear: property.tax_paid_till_year,
    totalPaid,
    totalSettled: r2(totalPaid - excess),
    excess,
    statement,
    paidTillYearAfter: lastFull !== null && lastFull >= startYear ? label(lastFull) : null,
    partial,
    dueAfter,
    dueBefore: r2(dueBefore),
  };
}

function cleanPayments(list: PaymentInput[]): PaymentInput[] {
  if (!list.length) throw ApiError.badRequest("Enter at least one old payment.");
  if (list.length > 200) throw ApiError.badRequest("Too many payments in one entry.");
  const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  return list.map((p, i) => {
    const n = i + 1;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.paidOn) || Number.isNaN(Date.parse(p.paidOn)))
      throw ApiError.badRequest(`Payment ${n}: enter the date it was paid.`);
    if (p.paidOn > today) throw ApiError.badRequest(`Payment ${n}: the date is in the future.`);
    if (p.paidOn < "1950-01-01") throw ApiError.badRequest(`Payment ${n}: check the date.`);
    if (!(p.amount > 0) || p.amount > 1e9) throw ApiError.badRequest(`Payment ${n}: enter the amount paid.`);
    if (!p.reference || p.reference.trim().length < 2)
      throw ApiError.badRequest(`Payment ${n}: enter the old receipt number / register reference.`);
    return { paidOn: p.paidOn, amount: r2(p.amount), reference: p.reference.trim().slice(0, 200), remarks: p.remarks?.trim() || null };
  });
}

async function loadHolding(holdingNo: string) {
  const property = await propertyRepository.findByHoldingNo(holdingNo.trim());
  if (!property) throw ApiError.notFound(`No holding found with number "${holdingNo}".`);
  const stages = await propertyRepository.findTaxHistoryByHoldingNo(property.holding_no);
  return { property, stages };
}

const holdingInfo = (p: PropertyRow) => ({
  holdingNo: p.holding_no,
  ownerName: p.owner_name,
  ward: p.ward,
  address: p.address,
  oldHoldingNo: p.old_holding_no,
  holdingCreationYear: p.holding_creation_year,
  taxPaidTillYear: p.tax_paid_till_year,
});

async function settlementsOf(holdingNo: string) {
  const { rows } = await pool.query(
    `SELECT s.*, COALESCE(json_agg(json_build_object('id', h.id, 'paidOn', to_char(h.paid_on, 'YYYY-MM-DD'), 'amount', h.amount::float8,
                   'reference', h.reference, 'remarks', h.remarks, 'hasProof', h.proof_path IS NOT NULL) ORDER BY h.id)
                   FILTER (WHERE h.id IS NOT NULL), '[]') AS payments
       FROM historical_payment_settlements s LEFT JOIN historical_payments h ON h.settlement_id = s.id
      WHERE s.holding_no = $1 GROUP BY s.id ORDER BY s.entered_at DESC`,
    [holdingNo],
  );
  return rows;
}

/** One holding: current dues position and every settlement entered for it. */
export async function lookupHolding(holdingNo: string) {
  const { property, stages } = await loadHolding(holdingNo);
  let current: Settlement | null = null;
  let blocked: string | null = null;
  try {
    current = settle(property, stages, []);
  } catch (e) {
    blocked = e instanceof Error ? e.message : "Cannot settle this holding yet.";
  }
  return {
    holding: holdingInfo(property),
    dueFrom: current ? current.startLabel : null,
    dueBefore: current?.dueBefore ?? null,
    blocked,
    settlements: await settlementsOf(property.holding_no),
  };
}

/** The year-by-year statement for payments not yet saved. */
export async function preview(holdingNo: string, payments: PaymentInput[]) {
  const { property, stages } = await loadHolding(holdingNo);
  return settle(property, stages, cleanPayments(payments));
}

export async function createSettlement(admin: AdminTokenPayload, holdingNo: string, paymentsIn: PaymentInput[], remarks: string | null) {
  const { property, stages } = await loadHolding(holdingNo);
  const payments = cleanPayments(paymentsIn);
  const s = settle(property, stages, payments);
  if (s.excess > 0)
    throw ApiError.badRequest(
      `The payments are ₹${s.excess.toLocaleString("en-IN")} more than all the tax due up to ${label(getCurrentAssessmentYearStartNum())} - check the amounts.`,
    );
  if (s.totalSettled <= 0) throw ApiError.badRequest("Nothing to settle.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO historical_payment_settlements (holding_no, previous_tax_paid_till_year, start_year, total_paid, statement, paid_till_year_after,
                                                    partial_year, partial_paid, partial_balance, remarks, entered_by_username, entered_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [
        property.holding_no,
        property.tax_paid_till_year,
        s.startYear,
        s.totalPaid,
        JSON.stringify(s.statement),
        s.paidTillYearAfter,
        s.partial?.year ?? null,
        s.partial?.paid ?? null,
        s.partial?.balance ?? null,
        remarks?.trim() || null,
        admin.username,
        admin.displayName,
      ],
    );
    const id = rows[0]!.id;
    for (const p of payments)
      await client.query(
        `INSERT INTO historical_payments (settlement_id, holding_no, paid_on, amount, reference, remarks) VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, property.holding_no, p.paidOn, p.amount, p.reference, p.remarks],
      );
    await client.query("COMMIT");
    return { id: Number(id), settlement: s };
  } catch (e) {
    await client.query("ROLLBACK");
    if ((e as { code?: string }).code === "23505")
      throw ApiError.badRequest("A settlement for this holding is already waiting for the City Manager's approval.");
    throw e;
  } finally {
    client.release();
  }
}

const PROOF_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "application/pdf": "pdf" };

/** A photo / scan of the old receipt or register page, while the settlement is still pending. */
export async function uploadProof(admin: AdminTokenPayload, paymentId: number, file: { base64: string; mime: string }) {
  const { rows } = await pool.query<{ holding_no: string; status: string; entered_by_username: string }>(
    `SELECT h.holding_no, s.status, s.entered_by_username FROM historical_payments h JOIN historical_payment_settlements s ON s.id = h.settlement_id WHERE h.id = $1`,
    [paymentId],
  );
  const row = rows[0];
  if (!row) throw ApiError.notFound("Payment not found.");
  if (row.status !== "pending") throw ApiError.badRequest("Proof can be added only while the settlement waits for approval.");
  const ext = PROOF_TYPES[file.mime];
  if (!ext) throw ApiError.badRequest("Upload a JPG / PNG photo or a PDF.");
  const buf = Buffer.from(file.base64, "base64");
  if (!buf.length) throw ApiError.badRequest("The file is empty.");
  assertUploadSize(file.mime, buf.length);
  const ok =
    ext === "pdf"
      ? buf.subarray(0, 5).toString("latin1") === "%PDF-"
      : ext === "jpg"
        ? buf[0] === 0xff && buf[1] === 0xd8
        : buf[0] === 0x89 && buf[1] === 0x50;
  if (!ok) throw ApiError.badRequest("The file is not a valid JPG / PNG / PDF.");
  const rel = path.join(
    "historical-payments",
    row.holding_no.replace(/[^A-Za-z0-9_-]/g, "_"),
    `${paymentId}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`,
  );
  const full = path.join(env.PHOTO_UPLOAD_DIR, rel);
  await fs.promises.mkdir(path.dirname(full), { recursive: true });
  await fs.promises.writeFile(full, buf, { mode: 0o640 });
  await pool.query(`UPDATE historical_payments SET proof_path = $2 WHERE id = $1`, [paymentId, rel]);
}

export async function proofFile(paymentId: number): Promise<string> {
  const { rows } = await pool.query<{ proof_path: string | null }>(`SELECT proof_path FROM historical_payments WHERE id = $1`, [paymentId]);
  const rel = rows[0]?.proof_path;
  if (!rel) throw ApiError.notFound("No proof uploaded for this payment.");
  const full = path.resolve(env.PHOTO_UPLOAD_DIR, rel);
  if (!full.startsWith(path.resolve(env.PHOTO_UPLOAD_DIR)) || !fs.existsSync(full))
    throw ApiError.notFound("The file is missing on the server.");
  return full;
}

/** Settlements waiting for the City Manager. */
export async function pendingList() {
  const { rows } = await pool.query(
    `SELECT s.id, s.holding_no, p.owner_name, p.ward, s.total_paid::float8 AS total_paid, s.paid_till_year_after, s.partial_year,
            s.partial_balance::float8 AS partial_balance, s.entered_by_name, s.entered_at,
            (SELECT count(*)::int FROM historical_payments h WHERE h.settlement_id = s.id) AS payments
       FROM historical_payment_settlements s JOIN properties p ON p.holding_no = s.holding_no
      WHERE s.status = 'pending' ORDER BY s.entered_at`,
  );
  return rows;
}

export async function pendingCount() {
  const { rows } = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM historical_payment_settlements WHERE status = 'pending'`,
  );
  return rows[0]?.n ?? 0;
}

/** City Manager approves: "tax paid till" moves, the year paid in part keeps only its balance, the history records it. */
export async function approve(admin: AdminTokenPayload, id: number, remarks: string | null) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`SELECT * FROM historical_payment_settlements WHERE id = $1 FOR UPDATE`, [id]);
    const s = rows[0];
    if (!s) throw ApiError.notFound("Settlement not found.");
    if (s.status !== "pending") throw ApiError.badRequest(`This settlement has already been ${s.status}.`);
    const property = await propertyRepository.findByHoldingNo(s.holding_no);
    if (!property) throw ApiError.notFound("The holding no longer exists.");
    const stages = await propertyRepository.findTaxHistoryByHoldingNo(s.holding_no);
    const { rows: pays } = await client.query(
      `SELECT id, to_char(paid_on, 'YYYY-MM-DD') AS "paidOn", amount::float8 AS amount, reference, remarks FROM historical_payments WHERE settlement_id = $1 ORDER BY id`,
      [id],
    );
    // Re-settle on the holding as it is now; refuse if "tax paid till" or the yearly tax changed since it was entered.
    const now = settle(property, stages, pays as PaymentInput[]);
    if ((property.tax_paid_till_year ?? null) !== (s.previous_tax_paid_till_year ?? null) || now.startYear !== Number(s.start_year))
      throw ApiError.badRequest(
        `The holding's "tax paid till" changed after this was entered (was ${s.previous_tax_paid_till_year ?? "blank"}, now ${property.tax_paid_till_year ?? "blank"}). Send it back so the Tax Daroga enters it again.`,
      );
    const key = (list: StatementYear[]) => JSON.stringify(list.map((x) => [x.year, x.tax, x.paid, x.balance]));
    if (key(now.statement) !== key(s.statement as StatementYear[]))
      throw ApiError.badRequest("The holding's yearly tax changed after this was entered. Send it back so the Tax Daroga enters it again.");

    let overrideStageId: string | null = null;
    if (now.partial) {
      const y = now.partial.year;
      const st = stageForYear(stages, y)!;
      const { rows: ins } = await client.query<{ id: string }>(
        `INSERT INTO tax_history_stages (holding_no, period_of_assessment, start_year_used, closing_year, arv_in_period, tax_rate_in_period,
                                         annual_tax_amount, years_count, total_amount, override_reason, override_remarks, added_by, added_date, auto_generated)
         VALUES ($1,$2,$3,$3,$4,$5,$6,1,$6,$7,$8,$9, now(), FALSE) RETURNING id`,
        [
          s.holding_no,
          label(y),
          y,
          st.arv_in_period,
          st.tax_rate_in_period,
          now.partial.balance,
          `Historical part payment settlement no. ${id}`,
          `${label(y)}: tax ₹${(now.partial.paid + now.partial.balance).toFixed(2)}, paid ₹${now.partial.paid.toFixed(2)} by old part payments, balance ₹${now.partial.balance.toFixed(2)} due. Approved by ${admin.displayName}.`,
          `${s.entered_by_name} (old part payments), approved by ${admin.displayName}`.slice(0, 64),
        ],
      );
      overrideStageId = ins[0]!.id;
    }
    if (now.paidTillYearAfter)
      await client.query(`UPDATE properties SET tax_paid_till_year = $2 WHERE holding_no = $1`, [s.holding_no, now.paidTillYearAfter]);
    const { rowCount: closed } = await client.query(
      `UPDATE demand_notices SET superseded = TRUE WHERE holding_no = $1 AND settled = FALSE AND cancelled = FALSE AND superseded = FALSE`,
      [s.holding_no],
    );
    await client.query(
      `UPDATE historical_payment_settlements SET status = 'approved', decided_by_username = $2, decided_by_name = $3, decided_at = now(),
              decision_remarks = $4, override_stage_id = $5 WHERE id = $1`,
      [id, admin.username, admin.displayName, remarks, overrideStageId],
    );
    const version = await propertySaveRepository.nextHistoryVersion(s.holding_no, client);
    await propertySaveRepository.insertHistory(
      s.holding_no,
      version,
      "Updated",
      "Historical part payments settled",
      `Settlement no. ${id}: ${pays.length} old payment(s) of ₹${now.totalPaid.toFixed(2)} settled from ${now.startLabel}; tax paid till ${s.previous_tax_paid_till_year ?? "blank"} → ${now.paidTillYearAfter ?? s.previous_tax_paid_till_year ?? "blank"}${now.partial ? `; ${now.partial.label} paid in part, balance ₹${now.partial.balance.toFixed(2)}` : ""}. Entered by ${s.entered_by_name}, approved by ${admin.displayName}.`,
      admin.displayName,
      {
        historicalPaymentSettlement: {
          id,
          payments: pays,
          statement: now.statement,
          previousTaxPaidTillYear: s.previous_tax_paid_till_year,
          taxPaidTillYearAfter: now.paidTillYearAfter ?? s.previous_tax_paid_till_year,
          partial: now.partial,
          remarks: s.remarks,
          approvalRemarks: remarks,
        },
      },
      client,
    );
    await client.query("COMMIT");
    return {
      approved: true,
      taxPaidTillYear: now.paidTillYearAfter ?? property.tax_paid_till_year,
      partial: now.partial,
      noticesClosed: closed ?? 0,
    };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function sendBack(admin: AdminTokenPayload, id: number, reason: string) {
  const { rows } = await pool.query(
    `UPDATE historical_payment_settlements SET status = 'returned', decided_by_username = $2, decided_by_name = $3, decided_at = now(), decision_remarks = $4
      WHERE id = $1 AND status = 'pending' RETURNING id`,
    [id, admin.username, admin.displayName, reason],
  );
  if (!rows[0]) throw ApiError.badRequest("This settlement is not waiting for approval.");
  return { returned: true };
}

/** Waiting for approval - no tax is collected meanwhile (used by discrepancyHold). */
export async function settlementHold(holdingNo: string): Promise<string | null> {
  const { rows } = await pool.query<{ id: string; d: string }>(
    `SELECT id, to_char(entered_at AT TIME ZONE 'Asia/Kolkata', 'DD-MM-YYYY') AS d FROM historical_payment_settlements WHERE holding_no = $1 AND status = 'pending' LIMIT 1`,
    [holdingNo],
  );
  return rows[0]
    ? `Old part payments on this holding (settlement no. ${rows[0].id}, entered ${rows[0].d}) are awaiting the City Manager's approval. Tax cannot be collected until it is approved or sent back.`
    : null;
}

/** Approved old payments, for the holding's payment history. */
export async function approvedPaymentsFor(holdingNo: string) {
  const { rows } = await pool.query<{ id: string; settlement_id: string; paid_on: Date; amount: string; reference: string }>(
    `SELECT h.id, h.settlement_id, h.paid_on, h.amount, h.reference
       FROM historical_payments h JOIN historical_payment_settlements s ON s.id = h.settlement_id
      WHERE h.holding_no = $1 AND s.status = 'approved' ORDER BY h.paid_on DESC, h.id DESC`,
    [holdingNo],
  );
  return rows;
}
