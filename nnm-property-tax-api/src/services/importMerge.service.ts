import type { PoolClient } from "pg";
import { pool } from "../config/db";
import { ApiError } from "../utils/ApiError";
import { normalizeWard } from "../utils/ward";
import { cellNumber, parseFlexibleDateTime, parseGps, parseYesNo } from "./propertyBulkImport.service";
import { revive, text, type PlainRow } from "./propertyImportStaging.service";

/**
 * Merging an uploaded holding into the live holding with the same number (importResolution.service, action "merge").
 * The upload is compared with the live data:
 *   - every Master field: same / only in live / only in upload / DIFFERENT (a dispute - the Tax Daroga must choose);
 *   - floors: keep the live floors or take the uploaded ones (the automatic tax history is then recalculated);
 *   - receipts and demand notices: those not in the live data can be added; ones already there are never touched
 *     (a different amount is shown as a dispute and recorded);
 *   - tax history rows: one not overlapping a live period can be added; overlapping ones stay as live (recorded);
 *   - the upload's own change history can be appended, so the holding's past stays traceable.
 * The plan with both values of everything - including every value NOT taken - is kept on the resolution and written
 * into the holding history when the Municipal Commissioner approves.
 */

type Kind = "text" | "num" | "yesno" | "ward" | "year" | "relation" | "road";
/** Upload column -> live column. */
export const MERGE_FIELDS: { field: string; column: string; label: string; kind: Kind; required?: boolean }[] = [
  { field: "OwnerName", column: "owner_name", label: "Owner name", kind: "text", required: true },
  { field: "RelationType", column: "relation_type", label: "Relation (S/O, D/O, W/O, C/O)", kind: "relation" },
  { field: "RelationName", column: "relation_name", label: "Relation name", kind: "text" },
  { field: "MobileNo", column: "mobile_no", label: "Mobile", kind: "text" },
  { field: "Address", column: "address", label: "Address", kind: "text", required: true },
  { field: "Ward", column: "ward", label: "Ward", kind: "ward" },
  { field: "Zone", column: "zone", label: "Zone", kind: "text" },
  { field: "Pincode", column: "pincode", label: "Pincode", kind: "text" },
  { field: "OldHoldingNo", column: "old_holding_no", label: "Old holding no.", kind: "text" },
  { field: "OldPID", column: "old_pid", label: "Old PID", kind: "text" },
  { field: "AreaSqft", column: "area_sqft", label: "Plot area (sq ft)", kind: "num" },
  { field: "VacantAreaSqft", column: "vacant_area_sqft", label: "Vacant area (sq ft)", kind: "num" },
  { field: "AssessmentYear", column: "assessment_year", label: "Assessment year", kind: "text", required: true },
  { field: "HoldingCreationYear", column: "holding_creation_year", label: "Holding creation year", kind: "year" },
  { field: "TaxPaidTillYear", column: "tax_paid_till_year", label: "Tax paid till year", kind: "year" },
  { field: "RoadType", column: "road_type", label: "Road type", kind: "road", required: true },
  { field: "RainWaterHarvesting", column: "rain_water_harvesting", label: "Rain water harvesting", kind: "yesno" },
  { field: "SolarRooftop", column: "solar_rooftop", label: "Solar rooftop", kind: "yesno" },
  { field: "IsSlum", column: "is_slum", label: "Slum holding", kind: "yesno" },
  { field: "ArrearTax", column: "arrear_tax", label: "Arrear tax", kind: "num" },
  { field: "ARV", column: "arv", label: "ARV", kind: "num" },
  { field: "TaxPayable", column: "tax_payable", label: "Tax payable", kind: "num" },
  { field: "SolidWasteUserChargeType", column: "solid_waste_charge_type", label: "Solid waste user type", kind: "text" },
  { field: "SolidWasteMonths", column: "solid_waste_months", label: "Solid waste months", kind: "num" },
  { field: "SolidWasteCharge", column: "solid_waste_charge", label: "Solid waste charge", kind: "num" },
  { field: "SolidWastePaidTillYear", column: "solid_waste_paid_till_year", label: "Solid waste paid till", kind: "year" },
  { field: "PenalCharge", column: "penal_charge", label: "Penal charge", kind: "num" },
  { field: "WaterCharge", column: "water_charge", label: "Water charge", kind: "num" },
  { field: "BoringCharge", column: "boring_charge", label: "Boring charge", kind: "num" },
  { field: "FormFee", column: "form_fee", label: "Form fee", kind: "num" },
  { field: "MiscCost", column: "misc_cost", label: "Misc. cost", kind: "num" },
  { field: "MiscCostReason", column: "misc_cost_reason", label: "Misc. cost reason", kind: "text" },
  { field: "MiscRebate", column: "misc_rebate", label: "Misc. rebate", kind: "num" },
  { field: "MiscRebateReason", column: "misc_rebate_reason", label: "Misc. rebate reason", kind: "text" },
  { field: "PresentHoldingName", column: "present_holding_name", label: "Present holding name", kind: "text" },
  { field: "PresentCategory", column: "present_category", label: "Present category", kind: "text" },
];
/** Fields that change the tax worked out for the holding (their change closes unpaid notices). */
const TAX_FIELDS = new Set([
  "AreaSqft",
  "VacantAreaSqft",
  "HoldingCreationYear",
  "TaxPaidTillYear",
  "RoadType",
  "RainWaterHarvesting",
  "SolarRooftop",
  "IsSlum",
  "ArrearTax",
  "ARV",
  "TaxPayable",
]);

function norm(kind: Kind, raw: unknown): string {
  const s =
    typeof raw === "boolean"
      ? raw
        ? "Yes"
        : "No"
      : String(raw ?? "")
          .trim()
          .replace(/\s+/g, " ");
  if (!s) return "";
  switch (kind) {
    case "num": {
      const n = Number(s);
      return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : "";
    }
    case "yesno":
      return parseYesNo(s) ? "Yes" : "No";
    case "ward":
      return normalizeWard(s);
    case "year":
      return /^\d{4}-\d{4}$/.test(s) ? s : "";
    case "relation":
      return ["S/O", "D/O", "W/O", "C/O"].includes(s.toUpperCase()) ? s.toUpperCase() : "";
    case "road":
      return ["PMR", "MR", "OR"].includes(s.toUpperCase()) ? s.toUpperCase() : "";
    default:
      return s;
  }
}
function toDb(kind: Kind, v: string): unknown {
  if (!v) return kind === "num" ? 0 : kind === "yesno" ? false : null;
  if (kind === "num") return Number(v);
  if (kind === "yesno") return v === "Yes";
  return v;
}
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export type FieldStatus = "same" | "live_only" | "upload_only" | "differ";
export interface FieldCompare {
  field: string;
  label: string;
  live: string;
  uploaded: string;
  status: FieldStatus;
  taxEffect: boolean;
}
export interface RowCompare {
  key: string;
  status: "new" | "same" | "differ" | "other_holding" | "overlap" | "invalid";
  live: string | null;
  uploaded: string;
  note: string | null;
}
export interface Comparison {
  holdingNo: string;
  fields: FieldCompare[];
  floors: { live: Record<string, string>[]; uploaded: Record<string, string>[]; same: boolean };
  receipts: RowCompare[];
  notices: RowCompare[];
  stages: RowCompare[];
  history: { uploaded: number; live: number };
  disputes: number;
}

export interface MergePlan {
  /** For every field that is different or only in the upload: which value to keep. */
  fields: Record<string, "live" | "uploaded">;
  floors: "keep_live" | "use_uploaded";
  addReceipts: string[];
  addNotices: string[];
  addStages: string[];
  appendHistory: boolean;
}

const fmtFloor = (f: Record<string, unknown>) => ({
  Floor: String(f.floor_label ?? f.Floor ?? ""),
  BuildupSqft: String(f.buildup_sqft ?? f.BuildupSqft ?? ""),
  ConstType: String(f.const_type ?? f.ConstType ?? ""),
  Usage: String(f.usage_type ?? f.Usage ?? ""),
  Occupancy: String(f.occupancy ?? f.Occupancy ?? ""),
  YearBuilt: String(f.year_built ?? f.YearBuilt ?? ""),
  ClosingYear: String(f.closing_year ?? f.ClosingYear ?? ""),
});
const floorKey = (f: Record<string, string>) =>
  [f.Floor, Number(f.BuildupSqft || 0), f.ConstType, f.Usage, (f.Occupancy || "self").toLowerCase(), f.YearBuilt, f.ClosingYear]
    .join("|")
    .toLowerCase();

/** Compares the staged holding with the live holding of the same number. */
export async function compareWithLive(
  master: PlainRow,
  sheets: Record<string, PlainRow[]>,
  q: { query: PoolClient["query"] } = pool,
): Promise<Comparison> {
  const holdingNoUp = text(master.HoldingNo);
  const { rows: pr } = await q.query(`SELECT * FROM properties WHERE REPLACE(holding_no, ' ', '') = REPLACE($1, ' ', '') LIMIT 1`, [
    holdingNoUp,
  ]);
  const p = pr[0];
  if (!p) throw ApiError.badRequest(`Holding ${holdingNoUp} is not in the live data - it can be imported, not merged.`);
  const h = p.holding_no as string;
  const [{ rows: floors }, { rows: stages }, hist] = await Promise.all([
    q.query(`SELECT * FROM floors WHERE holding_no = $1 ORDER BY id`, [h]),
    q.query(`SELECT * FROM tax_history_stages WHERE holding_no = $1 ORDER BY start_year_used`, [h]),
    q.query(`SELECT count(*)::int AS n FROM property_history WHERE holding_no = $1`, [h]),
  ]);

  const fields: FieldCompare[] = MERGE_FIELDS.map((m) => {
    const live = norm(m.kind, p[m.column]);
    const uploaded = norm(m.kind, text(master[m.field]));
    const status: FieldStatus = same(live, uploaded) ? "same" : !uploaded ? "live_only" : !live ? "upload_only" : "differ";
    return { field: m.field, label: m.label, live, uploaded, status, taxEffect: TAX_FIELDS.has(m.field) };
  });
  // GPS as one field.
  const gpsUp = parseGps(revive(master.Latitude), revive(master.Longitude));
  const gpsLive = p.latitude != null && p.longitude != null ? `${Number(p.latitude).toFixed(6)}, ${Number(p.longitude).toFixed(6)}` : "";
  const gpsU = gpsUp.lat !== null && gpsUp.lng !== null ? `${gpsUp.lat.toFixed(6)}, ${gpsUp.lng.toFixed(6)}` : "";
  fields.push({
    field: "GPS",
    label: "GPS location",
    live: gpsLive,
    uploaded: gpsU,
    status: gpsLive === gpsU ? "same" : !gpsU ? "live_only" : !gpsLive ? "upload_only" : "differ",
    taxEffect: false,
  });

  const liveFloors = floors.map(fmtFloor);
  const upFloors = (sheets.Floors ?? []).map((f) => fmtFloor(Object.fromEntries(Object.entries(f).map(([k, v]) => [k, text(v)]))));
  const floorsSame = liveFloors.map(floorKey).sort().join("#") === upFloors.map(floorKey).sort().join("#");

  // Receipts / notices: matched by number across the whole live data.
  const upReceipts = (sheets.Transactions ?? []).map((r) => ({
    no: text(r.ReceiptNo),
    amount: cellNumber(revive(r.AmountReceived)),
    date: text(r.Date),
  }));
  const recNos = upReceipts.map((r) => r.no).filter(Boolean);
  const { rows: liveRec } = recNos.length
    ? await q.query(
        `SELECT receipt_no, holding_no, amount_received::float8 AS amount, txn_date FROM transactions WHERE receipt_no = ANY($1::text[])`,
        [recNos],
      )
    : { rows: [] as { receipt_no: string; holding_no: string; amount: number; txn_date: Date }[] };
  const recMap = new Map(liveRec.map((r) => [r.receipt_no, r]));
  const receipts: RowCompare[] = upReceipts.map((r) => {
    const up = `₹${r.amount ?? "?"} on ${r.date || "?"}`;
    if (!r.no || r.amount === null)
      return {
        key: r.no || "(no receipt no.)",
        status: "invalid",
        live: null,
        uploaded: up,
        note: "Receipt number or amount missing - cannot be added.",
      };
    const l = recMap.get(r.no);
    if (!l) return { key: r.no, status: "new", live: null, uploaded: up, note: null };
    const lv = `₹${l.amount} on ${new Date(l.txn_date).toISOString().slice(0, 10)}`;
    if (l.holding_no !== h)
      return {
        key: r.no,
        status: "other_holding",
        live: lv,
        uploaded: up,
        note: `This receipt number belongs to holding ${l.holding_no} - not added.`,
      };
    return Math.abs(l.amount - r.amount) < 0.01
      ? { key: r.no, status: "same", live: lv, uploaded: up, note: null }
      : { key: r.no, status: "differ", live: lv, uploaded: up, note: "Different amount - the live receipt is kept." };
  });

  const upNotices = (sheets.DemandNotices ?? []).map((r) => ({
    no: text(r.DemandNo),
    amount: cellNumber(revive(r.TotalAmountDemanded)),
    date: text(r.Date),
  }));
  const nNos = upNotices.map((r) => r.no).filter(Boolean);
  const { rows: liveN } = nNos.length
    ? await q.query(
        `SELECT demand_no, holding_no, total_amount_demanded::float8 AS amount FROM demand_notices WHERE demand_no = ANY($1::text[])`,
        [nNos],
      )
    : { rows: [] as { demand_no: string; holding_no: string; amount: number }[] };
  const nMap = new Map(liveN.map((r) => [r.demand_no, r]));
  const seenN = new Set<string>();
  const notices: RowCompare[] = [];
  for (const r of upNotices) {
    if (r.no && seenN.has(r.no)) continue;
    seenN.add(r.no);
    const up = `₹${r.amount ?? 0} on ${r.date || "?"}`;
    if (!r.no) {
      notices.push({
        key: "(no notice no.)",
        status: "invalid",
        live: null,
        uploaded: up,
        note: "Demand number missing - cannot be added.",
      });
      continue;
    }
    const l = nMap.get(r.no);
    if (!l) notices.push({ key: r.no, status: "new", live: null, uploaded: up, note: null });
    else if (l.holding_no !== h)
      notices.push({
        key: r.no,
        status: "other_holding",
        live: `₹${l.amount}`,
        uploaded: up,
        note: `Belongs to holding ${l.holding_no} - not added.`,
      });
    else
      notices.push(
        Math.abs(l.amount - (r.amount ?? 0)) < 0.01
          ? { key: r.no, status: "same", live: `₹${l.amount}`, uploaded: up, note: null }
          : { key: r.no, status: "differ", live: `₹${l.amount}`, uploaded: up, note: "Different amount - the live notice is kept." },
      );
  }

  const stageRows: RowCompare[] = (sheets.TaxHistoryStages ?? []).map((r) => {
    const start = cellNumber(revive(r.StartYearUsed));
    const end = cellNumber(revive(r.ClosingYear));
    const annual = cellNumber(revive(r.AnnualTaxAmount));
    const up = `${text(r.PeriodOfAssessment)}: ${start}-${end}, ARV ${text(r.ARVInPeriod) || 0}, annual tax ₹${annual ?? "?"}`;
    const key = `${start}-${end}-${annual}`;
    if (start === null || end === null || annual === null || cellNumber(revive(r.TaxRateInPeriod)) === null)
      return { key, status: "invalid", live: null, uploaded: up, note: "A required value is missing - cannot be added." };
    const exact = stages.find(
      (s) => Number(s.start_year_used) === start && Number(s.closing_year) === end && Math.abs(Number(s.annual_tax_amount) - annual) < 0.01,
    );
    if (exact) return { key, status: "same", live: up, uploaded: up, note: null };
    const ov = stages.find((s) => Number(s.start_year_used) <= end && start <= Number(s.closing_year));
    if (ov)
      return {
        key,
        status: "overlap",
        live: `${ov.period_of_assessment}: ${ov.start_year_used}-${ov.closing_year}, annual tax ₹${Number(ov.annual_tax_amount)}`,
        uploaded: up,
        note: "Overlaps a period already assessed in the live data - the live assessment is kept.",
      };
    return { key, status: "new", live: null, uploaded: up, note: null };
  });

  const comparison: Comparison = {
    holdingNo: h,
    fields,
    floors: { live: liveFloors, uploaded: upFloors, same: floorsSame },
    receipts,
    notices,
    stages: stageRows,
    history: { uploaded: (sheets.PropertyHistory ?? []).length, live: hist.rows[0]?.n ?? 0 },
    disputes: 0,
  };
  comparison.disputes =
    fields.filter((f) => f.status === "differ").length +
    (floorsSame || !upFloors.length ? 0 : 1) +
    receipts.filter((r) => r.status === "differ" || r.status === "other_holding").length +
    notices.filter((r) => r.status === "differ" || r.status === "other_holding").length +
    stageRows.filter((r) => r.status === "overlap").length;
  return comparison;
}

/** The plan must take a decision on every dispute; only addable rows can be added. */
export function checkPlan(c: Comparison, plan: MergePlan) {
  for (const f of c.fields) {
    if (f.status === "differ" && !plan.fields[f.field])
      throw ApiError.badRequest(`Choose which value to keep for "${f.label}" - the two data differ.`);
    if (plan.fields[f.field] === "uploaded" && f.status !== "differ" && f.status !== "upload_only")
      throw ApiError.badRequest(`"${f.label}" has no uploaded value to take.`);
  }
  for (const k of Object.keys(plan.fields)) if (!c.fields.some((f) => f.field === k)) throw ApiError.badRequest(`Unknown field "${k}".`);
  if (plan.floors === "use_uploaded" && !c.floors.uploaded.length) throw ApiError.badRequest("The upload has no floors to take.");
  const addable = (rows: RowCompare[], keys: string[], what: string) => {
    for (const k of keys)
      if (!rows.some((r) => r.key === k && r.status === "new")) throw ApiError.badRequest(`${what} ${k} cannot be added.`);
  };
  addable(c.receipts, plan.addReceipts, "Receipt");
  addable(c.notices, plan.addNotices, "Demand notice");
  addable(c.stages, plan.addStages, "Tax history row");
  if (plan.appendHistory && !c.history.uploaded) throw ApiError.badRequest("The upload has no change history to add.");
}

/** What the plan takes and leaves - for the holding history and the audit trail. */
export function planSummary(c: Comparison, plan: MergePlan) {
  const taken = c.fields.filter((f) => plan.fields[f.field] === "uploaded");
  const kept = c.fields.filter((f) => (f.status === "differ" || f.status === "upload_only") && plan.fields[f.field] !== "uploaded");
  return {
    fieldsTaken: taken.map((f) => ({ field: f.field, label: f.label, from: f.live, to: f.uploaded })),
    // Every value not taken - the losing side of each comparison.
    valuesRejected: [
      ...kept.map((f) => ({ what: f.label, rejected: f.uploaded, kept: f.live, source: "upload" })),
      ...taken.filter((f) => f.live).map((f) => ({ what: f.label, rejected: f.live, kept: f.uploaded, source: "live" })),
      ...(plan.floors === "use_uploaded" && c.floors.live.length
        ? [{ what: "Floors", rejected: JSON.stringify(c.floors.live), kept: JSON.stringify(c.floors.uploaded), source: "live" }]
        : []),
      ...(plan.floors === "keep_live" && c.floors.uploaded.length && !c.floors.same
        ? [{ what: "Floors", rejected: JSON.stringify(c.floors.uploaded), kept: JSON.stringify(c.floors.live), source: "upload" }]
        : []),
      ...c.receipts
        .filter((r) => r.status !== "same" && !plan.addReceipts.includes(r.key))
        .map((r) => ({ what: `Receipt ${r.key}`, rejected: r.uploaded, kept: r.live ?? "(not added)", source: "upload" })),
      ...c.notices
        .filter((r) => r.status !== "same" && !plan.addNotices.includes(r.key))
        .map((r) => ({ what: `Demand notice ${r.key}`, rejected: r.uploaded, kept: r.live ?? "(not added)", source: "upload" })),
      ...c.stages
        .filter((r) => r.status !== "same" && !plan.addStages.includes(r.key))
        .map((r) => ({ what: `Tax history ${r.key}`, rejected: r.uploaded, kept: r.live ?? "(not added)", source: "upload" })),
    ],
    floors: plan.floors,
    receiptsAdded: plan.addReceipts,
    noticesAdded: plan.addNotices,
    stagesAdded: plan.addStages,
    historyAppended: plan.appendHistory ? c.history.uploaded : 0,
  };
}

/**
 * Carries the plan out inside the caller's transaction. Refuses if the live values the plan was made on have changed
 * since (the Tax Daroga then looks again). Returns what changed, for the holding history.
 */
export async function applyMerge(
  client: PoolClient,
  master: PlainRow,
  sheets: Record<string, PlainRow[]>,
  plan: MergePlan,
  proposedOn: Comparison,
  actor: string,
  reference: string,
) {
  const now = await compareWithLive(master, sheets, client);
  const changed = now.fields.filter((f) => {
    const was = proposedOn.fields.find((x) => x.field === f.field);
    return was && was.live !== f.live && (f.status === "differ" || plan.fields[f.field] === "uploaded");
  });
  if (changed.length)
    throw ApiError.badRequest(
      `The live holding has changed since the merge was proposed (${changed.map((f) => f.label).join(", ")}). Revert it so the Tax Daroga compares again.`,
    );
  checkPlan(now, plan);
  const h = now.holdingNo;
  const { rows: beforeRows } = await client.query(`SELECT * FROM properties WHERE holding_no = $1`, [h]);
  const before = beforeRows[0];

  // Fields.
  const sets: string[] = [];
  const vals: unknown[] = [h];
  for (const f of now.fields) {
    if (plan.fields[f.field] !== "uploaded") continue;
    if (f.field === "GPS") {
      const g = parseGps(revive(master.Latitude), revive(master.Longitude));
      vals.push(g.lat, g.lng);
      sets.push(`latitude = $${vals.length - 1}`, `longitude = $${vals.length}`);
      continue;
    }
    const m = MERGE_FIELDS.find((x) => x.field === f.field)!;
    vals.push(toDb(m.kind, f.uploaded));
    sets.push(`${m.column} = $${vals.length}`);
  }
  if (sets.length) {
    vals.push(actor);
    await client.query(
      `UPDATE properties SET ${sets.join(", ")}, last_modified_by = $${vals.length}, last_modified_date = now() WHERE holding_no = $1`,
      vals,
    );
  }

  // Floors.
  let floorsReplaced = false;
  if (plan.floors === "use_uploaded") {
    const rows = sheets.Floors ?? [];
    for (const r of rows)
      if (!text(r.Floor) || !text(r.ConstType) || !text(r.Usage))
        throw ApiError.badRequest("An uploaded floor is missing its floor, construction type or usage.");
    await client.query(`DELETE FROM floors WHERE holding_no = $1`, [h]);
    for (const r of rows)
      await client.query(
        `INSERT INTO floors (holding_no, floor_label, buildup_sqft, const_type, usage_type, occupancy, year_built, closing_year, floor_arv, floor_tax)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          h,
          text(r.Floor),
          cellNumber(revive(r.BuildupSqft)) ?? 0,
          text(r.ConstType),
          text(r.Usage),
          text(r.Occupancy).toLowerCase() === "rented" ? "rented" : "self",
          text(r.YearBuilt) || null,
          text(r.ClosingYear) || null,
          cellNumber(revive(r.FloorARV)) ?? 0,
          cellNumber(revive(r.FloorTax)) ?? 0,
        ],
      );
    floorsReplaced = true;
  }

  // Receipts, notices, tax history rows.
  for (const r of sheets.Transactions ?? []) {
    const no = text(r.ReceiptNo);
    if (!plan.addReceipts.includes(no)) continue;
    const cancelled = text(r.Status).toLowerCase() === "generated by mistake";
    await client.query(
      `INSERT INTO transactions (receipt_no, holding_no, txn_date, payment_mode, amount_received, collected_by, counter, demand_no, arrear_periods_paid, cancelled, cancelled_reason, cancelled_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        no,
        h,
        parseFlexibleDateTime(revive(r.Date)) ?? new Date().toISOString(),
        text(r.PaymentMode) || "Cash",
        cellNumber(revive(r.AmountReceived)),
        text(r.CollectedBy) || actor,
        text(r.Counter) || null,
        text(r.DemandNo) || null,
        text(r.ArrearYearsPaid) || null,
        cancelled,
        cancelled ? text(r.StatusReason) || null : null,
        cancelled ? parseFlexibleDateTime(revive(r.StatusDate)) : null,
      ],
    );
  }
  const doneN = new Set<string>();
  for (const r of sheets.DemandNotices ?? []) {
    const no = text(r.DemandNo);
    if (!plan.addNotices.includes(no) || doneN.has(no)) continue;
    doneN.add(no);
    await client.query(
      `INSERT INTO demand_notices (demand_no, holding_no, notice_date, generated_by, arv, current_year_tax_net, previous_years_tax_base, total_fine_amount, other_charges, total_amount_demanded)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        no,
        h,
        parseFlexibleDateTime(revive(r.Date)) ?? new Date().toISOString(),
        text(r.GeneratedBy) || actor,
        cellNumber(revive(r.ARV)) ?? 0,
        cellNumber(revive(r.CurrentYearTaxNet)) ?? 0,
        cellNumber(revive(r.PreviousYearsTaxBase)) ?? 0,
        cellNumber(revive(r.TotalFineAmount)) ?? 0,
        cellNumber(revive(r.OtherCharges)) ?? 0,
        cellNumber(revive(r.TotalAmountDemanded)) ?? 0,
      ],
    );
  }
  for (const r of sheets.TaxHistoryStages ?? []) {
    const start = cellNumber(revive(r.StartYearUsed));
    const end = cellNumber(revive(r.ClosingYear));
    const annual = cellNumber(revive(r.AnnualTaxAmount));
    if (!plan.addStages.includes(`${start}-${end}-${annual}`)) continue;
    const reason = text(r.OverrideReason) || null;
    const remarks = text(r.OverrideRemarks) || null;
    await client.query(
      `INSERT INTO tax_history_stages (holding_no, period_of_assessment, start_year_used, closing_year, arv_in_period, tax_rate_in_period, annual_tax_amount,
                                       years_count, total_amount, override_reason, override_remarks, added_by, added_date, auto_generated)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now(), FALSE)`,
      [
        h,
        text(r.PeriodOfAssessment),
        start,
        end,
        cellNumber(revive(r.ARVInPeriod)) ?? 0,
        cellNumber(revive(r.TaxRateInPeriod)),
        annual,
        cellNumber(revive(r.YearsCount)) ?? end! - start! + 1,
        cellNumber(revive(r.TotalAmount)) ?? annual! * (end! - start! + 1),
        reason ?? (remarks ? "Not specified" : null),
        remarks ?? (reason ? "Not specified" : null),
        `${text(r.AddedBy) || "Upload"} (merged: ${reference})`.slice(0, 64),
      ],
    );
  }

  // The upload's own change history, after the live history.
  let version = ((await client.query(`SELECT max(version) AS m FROM property_history WHERE holding_no = $1`, [h])).rows[0]?.m ??
    0) as number;
  if (plan.appendHistory) {
    for (const r of sheets.PropertyHistory ?? []) {
      let snapshot: unknown;
      try {
        snapshot = JSON.parse(text(r.Snapshot));
      } catch {
        snapshot = { raw: text(r.Snapshot) };
      }
      version += 1;
      await client.query(
        `INSERT INTO property_history (holding_no, version, action, change_basis, change_reference, operator_name, ts, snapshot)
         VALUES ($1,$2,'Updated',$3,$4,$5,$6,$7)`,
        [
          h,
          version,
          `From merged upload: ${text(r.ChangeBasis) || text(r.Action) || "history"}`.slice(0, 255),
          `${reference}; uploaded version ${text(r.Version) || "?"}${text(r.ChangeReference) ? `; ${text(r.ChangeReference)}` : ""}`,
          text(r.OperatorName) || "Upload",
          parseFlexibleDateTime(revive(r.Timestamp)) ?? new Date().toISOString(),
          JSON.stringify(snapshot),
        ],
      );
    }
  }

  const taxChanged =
    floorsReplaced || plan.addStages.length > 0 || now.fields.some((f) => plan.fields[f.field] === "uploaded" && f.taxEffect);
  const { rowCount: noticesClosed } = taxChanged
    ? await client.query(
        `UPDATE demand_notices SET superseded = TRUE WHERE holding_no = $1 AND settled = FALSE AND cancelled = FALSE AND superseded = FALSE`,
        [h],
      )
    : { rowCount: 0 };
  const { rows: afterRows } = await client.query(`SELECT * FROM properties WHERE holding_no = $1`, [h]);
  return {
    holdingNo: h,
    before,
    after: afterRows[0],
    comparison: now,
    summary: planSummary(now, plan),
    floorsReplaced,
    regenerateStages:
      floorsReplaced ||
      now.fields.some((f) => plan.fields[f.field] === "uploaded" && ["HoldingCreationYear", "RoadType"].includes(f.field)),
    noticesClosed: noticesClosed ?? 0,
    nextVersion: version + 1,
  };
}
