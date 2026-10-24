import { pool } from "../config/db";
import { ApiError } from "../utils/ApiError";
import { parseYearStartOrNull } from "../utils/assessmentYear";
import { propertyRepository } from "../repositories/property.repository";
import { propertySaveRepository } from "../repositories/propertySave.repository";
import { PERIOD_OF_ASSESSMENT_BUCKETS, PERIOD_TAX_RATES } from "../constants/taxRates";
import { computeStageYears } from "./computeStageYears.service";
import { missingTaxYears, yearRangesLabel } from "./arrears.service";
import type { AdminTokenPayload } from "../types/admin.types";
import type { PropertyRow, TaxHistoryStageRow } from "../types/property.types";

/**
 * Pre-2011 ARV from the old demand register (migration 146). The system has no rate table before 2011-12, so pending
 * years before then can only be assessed from the ARV in the offline demand register: the Tax Daroga enters it per
 * period of assessment (with the register reference), the City Manager approves, and approval adds the manual tax
 * history stages that the demand notice then includes. Until then notices and payments are refused for the holding
 * (arrears.service assertNoMissingTaxYears).
 */

export const ENTER_ROLES = ["tax_daroga"] as const;
export const APPROVE_ROLES = ["city_manager"] as const;
export const VIEW_ROLES = ["tax_daroga", "city_manager", "deputy_commissioner", "commissioner"] as const;

/** The periods of assessment before 2011-12, oldest first. */
const PRE_2011_PERIODS = Object.keys(PERIOD_OF_ASSESSMENT_BUCKETS).filter((p) => {
  const end = PERIOD_OF_ASSESSMENT_BUCKETS[p]!.end;
  return typeof end === "number" && end < 2011;
});

function periodRange(period: string): { start: number; end: number } {
  const b = PERIOD_OF_ASSESSMENT_BUCKETS[period]!;
  return { start: b.start ?? -Infinity, end: b.end as number };
}

export interface NeededPeriod {
  period: string;
  taxRatePercent: number;
  /** The pending years in this period that the entry will assess, e.g. "2008-2009 to 2010-2011". */
  pendingYears: string;
  pendingYearCount: number;
}

/** The pre-2011 periods that cover this holding's missing pre-2011 years. */
function neededPeriods(missing: number[]): NeededPeriod[] {
  const pre = missing.filter((y) => y < 2011);
  return PRE_2011_PERIODS.map((period) => {
    const { start, end } = periodRange(period);
    const years = pre.filter((y) => y >= start && y <= end);
    return { period, taxRatePercent: (PERIOD_TAX_RATES[period] ?? 0) * 100, pendingYears: years.length ? yearRangesLabel(years) : "", pendingYearCount: years.length };
  }).filter((p) => p.pendingYearCount > 0);
}

async function pendingEntryFor(holdingNo: string) {
  const { rows } = await pool.query(`SELECT * FROM pre2011_arv_entries WHERE holding_no = $1 AND status = 'pending' LIMIT 1`, [holdingNo]);
  return rows[0] ?? null;
}

/** One holding: what is pending, which years have no assessment, the periods to enter, earlier entries. */
export async function lookupHolding(holdingNo: string) {
  const property = await propertyRepository.findByHoldingNo(holdingNo.trim());
  if (!property) throw ApiError.notFound(`No holding found with number "${holdingNo}".`);
  const stages = await propertyRepository.findTaxHistoryByHoldingNo(property.holding_no);
  const missing = missingTaxYears(property, stages);
  const { rows: history } = await pool.query(
    `SELECT id, entries, register_reference, remarks, status, entered_by_name, entered_at, decided_by_name, decided_at, decision_remarks
       FROM pre2011_arv_entries WHERE holding_no = $1 ORDER BY entered_at DESC`,
    [property.holding_no],
  );
  return {
    holding: {
      holdingNo: property.holding_no,
      ownerName: property.owner_name,
      ward: property.ward,
      address: property.address,
      oldHoldingNo: property.old_holding_no,
      holdingCreationYear: property.holding_creation_year,
      taxPaidTillYear: property.tax_paid_till_year,
    },
    missingYears: missing.length ? yearRangesLabel(missing) : null,
    missingAfter2011: missing.some((y) => y >= 2011) ? yearRangesLabel(missing.filter((y) => y >= 2011)) : null,
    neededPeriods: neededPeriods(missing),
    pending: history.find((h) => h.status === "pending") ?? null,
    history,
  };
}

/**
 * Holdings whose pending years before 2011-12 have no assessment on file - the Tax Daroga's worklist. Candidates are
 * picked in SQL (pending years before 2011 not covered by any stage), then confirmed with the same rule the notice uses
 * (exempt years excluded).
 */
export async function worklist(ward?: string) {
  const params: unknown[] = [];
  let wardSql = "";
  if (ward) {
    params.push(ward);
    wardSql = `AND btrim(ward) = $${params.length}`;
  }
  const { rows: candidates } = await pool.query<PropertyRow & { ps: number }>(
    `WITH p AS (
       SELECT pr.*,
              GREATEST(COALESCE(substring(pr.tax_paid_till_year FROM '^(\\d{4})')::int, substring(pr.holding_creation_year FROM '^(\\d{4})')::int - 1) + 1,
                       substring(pr.holding_creation_year FROM '^(\\d{4})')::int) AS ps
         FROM properties pr
        WHERE pr.holding_creation_year ~ '^\\d{4}' ${wardSql})
     SELECT p.* FROM p
      WHERE p.ps <= 2010
        AND EXISTS (SELECT 1 FROM generate_series(p.ps, 2010) y
                     WHERE NOT EXISTS (SELECT 1 FROM tax_history_stages s WHERE s.holding_no = p.holding_no AND s.start_year_used <= y AND y <= s.closing_year))
      ORDER BY NULLIF(regexp_replace(btrim(p.ward), '\\D', '', 'g'), '')::int NULLS LAST, p.holding_no
      LIMIT 3000`,
    params,
  );
  if (!candidates.length) return [];
  const nos = candidates.map((c) => c.holding_no);
  const { rows: stages } = await pool.query<TaxHistoryStageRow>(`SELECT * FROM tax_history_stages WHERE holding_no = ANY($1::text[])`, [nos]);
  const { rows: pend } = await pool.query<{ holding_no: string; entered_at: Date }>(
    `SELECT holding_no, entered_at FROM pre2011_arv_entries WHERE status = 'pending' AND holding_no = ANY($1::text[])`,
    [nos],
  );
  const pendingSet = new Map(pend.map((p) => [p.holding_no, p.entered_at]));
  const byHolding = new Map<string, TaxHistoryStageRow[]>();
  for (const s of stages) byHolding.set(s.holding_no, [...(byHolding.get(s.holding_no) ?? []), s]);
  return candidates
    .map((c) => {
      const missing = missingTaxYears(c, byHolding.get(c.holding_no) ?? []).filter((y) => y < 2011);
      return {
        holdingNo: c.holding_no,
        ownerName: c.owner_name,
        ward: c.ward,
        taxPaidTillYear: c.tax_paid_till_year,
        missingYears: missing.length ? yearRangesLabel(missing) : null,
        awaitingApprovalSince: pendingSet.get(c.holding_no) ?? null,
      };
    })
    .filter((r) => r.missingYears);
}

export interface ArvEntryInput {
  period: string;
  arv: number;
}

/** Tax Daroga: enters the register ARV for every needed period; goes to the City Manager. */
export async function submitEntry(admin: AdminTokenPayload, holdingNo: string, entries: ArvEntryInput[], registerReference: string, remarks: string | null) {
  const property = await propertyRepository.findByHoldingNo(holdingNo.trim());
  if (!property) throw ApiError.notFound(`No holding found with number "${holdingNo}".`);
  if (await pendingEntryFor(property.holding_no)) throw ApiError.badRequest("An entry for this holding is already waiting for the City Manager's approval.");
  const stages = await propertyRepository.findTaxHistoryByHoldingNo(property.holding_no);
  const needed = neededPeriods(missingTaxYears(property, stages));
  if (!needed.length) throw ApiError.badRequest("This holding has no pending years before 2011-12 without an assessment - nothing to enter.");

  const byPeriod = new Map(entries.map((e) => [e.period, e]));
  for (const e of entries) {
    if (!needed.some((n) => n.period === e.period)) throw ApiError.badRequest(`"${e.period}" is not one of the periods this holding needs.`);
  }
  const missingPeriods = needed.filter((n) => !(Number(byPeriod.get(n.period)?.arv) > 0));
  if (missingPeriods.length) throw ApiError.badRequest(`Enter the ARV for: ${missingPeriods.map((n) => n.period).join("; ")}.`);
  // Validates each period against the holding's creation year exactly as approval will.
  const creationYear = parseYearStartOrNull(property.holding_creation_year);
  const clean = needed.map((n) => {
    const arv = Math.round(Number(byPeriod.get(n.period)!.arv) * 100) / 100;
    computeStageYears(n.period, arv, creationYear);
    return { period: n.period, arv };
  });

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO pre2011_arv_entries (holding_no, entries, register_reference, remarks, entered_by_username, entered_by_name)
     VALUES ($1, $2::jsonb, $3, $4, $5, $6) RETURNING id`,
    [property.holding_no, JSON.stringify(clean), registerReference.trim(), remarks?.trim() || null, admin.username, admin.displayName],
  );
  return { id: Number(rows[0]!.id) };
}

/** Entries for the officers' list, newest first, with each period's tax worked out for review. */
export async function listEntries(status?: "pending" | "approved" | "rejected") {
  const { rows } = await pool.query(
    `SELECT e.*, p.owner_name, p.ward, p.tax_paid_till_year, p.holding_creation_year
       FROM pre2011_arv_entries e JOIN properties p ON p.holding_no = e.holding_no
      ${status ? "WHERE e.status = $1" : ""}
      ORDER BY e.status = 'pending' DESC, e.entered_at ${status === "pending" ? "ASC" : "DESC"} LIMIT 500`,
    status ? [status] : [],
  );
  return rows.map((r) => {
    const paidTill = parseYearStartOrNull(r.tax_paid_till_year);
    const creation = parseYearStartOrNull(r.holding_creation_year);
    const pendingFrom = Math.max((paidTill ?? (creation ?? 0) - 1) + 1, creation ?? -Infinity);
    const lines = (r.entries as ArvEntryInput[]).map((e) => {
      const { start, end } = periodRange(e.period);
      const from = Math.max(start, pendingFrom);
      const years = end >= from ? end - from + 1 : 0;
      const rate = PERIOD_TAX_RATES[e.period] ?? 0;
      const annualTax = Math.round(e.arv * rate * 100) / 100;
      return { ...e, taxRatePercent: rate * 100, annualTax, pendingYears: years, pendingTax: Math.round(annualTax * years * 100) / 100 };
    });
    return { ...r, lines, pendingTaxTotal: lines.reduce((s, l) => s + l.pendingTax, 0) };
  });
}

export async function pendingCount() {
  const { rows } = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM pre2011_arv_entries WHERE status = 'pending'`);
  return rows[0]?.n ?? 0;
}

/** Moves a pending entry to approved / rejected - atomically, so two clicks cannot both act. */
async function claim(client: { query: typeof pool.query }, id: number, status: "approved" | "rejected", admin: AdminTokenPayload, remarks: string | null) {
  const { rows } = await client.query(
    `UPDATE pre2011_arv_entries SET status = $2, decided_by_username = $3, decided_by_name = $4, decided_at = now(), decision_remarks = $5
      WHERE id = $1 AND status = 'pending' RETURNING *`,
    [id, status, admin.username, admin.displayName, remarks],
  );
  if (!rows[0]) {
    const { rows: ex } = await client.query(`SELECT status FROM pre2011_arv_entries WHERE id = $1`, [id]);
    if (!ex[0]) throw ApiError.notFound("Entry not found.");
    throw ApiError.badRequest(`This entry has already been ${ex[0].status}.`);
  }
  return rows[0] as { holding_no: string; entries: ArvEntryInput[]; register_reference: string; remarks: string | null; entered_by_name: string };
}

/** City Manager approves: the register ARVs become the holding's tax history for those periods. */
export async function approveEntry(admin: AdminTokenPayload, id: number, remarks: string | null) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const e = await claim(client, id, "approved", admin, remarks);
    const property = await propertyRepository.findByHoldingNo(e.holding_no);
    if (!property) throw ApiError.notFound("The holding no longer exists.");
    const creationYear = parseYearStartOrNull(property.holding_creation_year);
    const addedBy = `${e.entered_by_name} (register ARV), approved by ${admin.displayName}`.slice(0, 64);
    for (const line of e.entries) {
      const st = computeStageYears(line.period, line.arv, creationYear);
      await client.query(
        `INSERT INTO tax_history_stages (holding_no, period_of_assessment, start_year_used, closing_year, arv_in_period, tax_rate_in_period,
                                         annual_tax_amount, years_count, total_amount, added_by, added_date, auto_generated)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now(), FALSE)`,
        [e.holding_no, st.periodOfAssessment, st.startYearUsed, st.closingYear, st.arvInPeriod, st.taxRateInPeriod, st.annualTaxAmount, st.yearsCount, st.totalAmount, addedBy],
      );
    }
    // Any notice already issued was billed without these years - paying it would mark them paid. Close them so the
    // next payment needs a fresh notice that includes the register ARV.
    const { rowCount: closed } = await client.query(
      `UPDATE demand_notices SET superseded = TRUE WHERE holding_no = $1 AND settled = FALSE AND cancelled = FALSE AND superseded = FALSE`,
      [e.holding_no],
    );
    const version = await propertySaveRepository.nextHistoryVersion(e.holding_no, client);
    await propertySaveRepository.insertHistory(
      e.holding_no,
      version,
      "Updated",
      "Pre-2011 ARV from demand register",
      `${e.register_reference}; entered by ${e.entered_by_name}, approved by ${admin.displayName}`,
      admin.displayName,
      { pre2011Arv: e.entries, registerReference: e.register_reference, remarks: e.remarks, approvalRemarks: remarks },
      client,
    );
    await client.query("COMMIT");
    return { approved: true, noticesClosed: closed ?? 0 };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function rejectEntry(admin: AdminTokenPayload, id: number, reason: string) {
  await claim(pool, id, "rejected", admin, reason);
  return { rejected: true };
}
