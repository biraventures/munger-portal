/**
 * Holdings whose "tax paid till" year is blank (mostly migrated from older data).
 *
 * A blank paid-till year means "nothing paid since the holding was created", so billing runs from the holding
 * creation year. For each such holding this script works out the right years and, with --apply, corrects them:
 *
 *   1. Paid-till year that a later save wiped: a Tax Collector's discrepancy / survey report has no paid-till field,
 *      and approving one used to blank it. The last value in the holding's history is put back (unless someone
 *      deliberately cleared it).
 *   2. Otherwise the old record's "Last Payment Year" (old-holding upload sheet), when it has one.
 *   3. Never lower than the last year a valid receipt shows as paid.
 *   4. Holding creation year: when the old record has an EARLIER creation year than the one stored (the import put
 *      the import year in when the column was missing or misread), the old record's year is used and the holding's
 *      tax assessment periods are recomputed from its floors.
 *
 *   5. Years from 2011-12 onward with no tax assessment on file (which hold the holding: no notice, no payment) are
 *      assessed from the holding's floors - the same automatic assessment the system makes when a holding is saved.
 *      Years before 2011-12 still need the ARV from the old demand register (Pre-2011 ARV Entry).
 *
 * Anything else is left blank (= billed from the creation year) and listed in the report, with a note where the
 * creation year looks like an import placeholder, or where years have no assessment on file (those holdings are
 * already held: no notice or payment until the assessment is completed).
 *
 * Open (unpaid) demand notices of every corrected holding are superseded - they demand the wrong years; the next
 * notice is generated with the corrected years. Every change is logged in holding_year_repair_log.
 *
 * Usage (from the nnm-property-tax-api folder):
 *   npm run repair-paid-till                 # report only - nothing is changed
 *   npm run repair-paid-till -- --apply      # make the changes
 * The report is written to repair-paid-till-report.csv in the current folder.
 */
import "dotenv/config";
import fs from "node:fs";
import { pool } from "../src/config/db";
import { propertyRepository } from "../src/repositories/property.repository";
import { computedStageRows, regenerateAutomaticTaxHistoryStages } from "../src/services/automaticTaxHistory.service";
import { effectivePaidTillStart } from "../src/services/paidYearGuard.service";
import { missingTaxYears, yearRangesLabel } from "../src/services/arrears.service";
import { getCurrentAssessmentYearStartNum, parseYearStartOrNull } from "../src/utils/assessmentYear";

const APPLY = process.argv.includes("--apply");
const RUN_BY = "repair-paid-till script";
const fy = (y: number) => `${y}-${y + 1}`;

/** "2019-20", "2019-2020", "2019" -> 2019 (start year), or null. */
function yearStart(v: unknown): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const p = parseYearStartOrNull(s);
  if (p !== null) return p;
  const m = s.match(/^(\d{4})(?:\.0+)?$/);
  return m ? Number(m[1]) : null;
}

/** The paid-till year a later save wiped: walk the history newest first, skipping saves that did not mention it. */
async function paidTillFromHistory(holdingNo: string): Promise<{ year: number; version: number } | null> {
  const { rows } = await pool.query<{ version: number; has: boolean; v: string | null }>(
    `SELECT version, (snapshot->'property') ? 'taxPaidTillYear' AS has, snapshot->'property'->>'taxPaidTillYear' AS v
       FROM property_history WHERE holding_no = $1 ORDER BY version DESC`,
    [holdingNo],
  );
  for (const r of rows) {
    if (!r.has) continue; // this save did not include the field - it is the one that wiped it
    const y = yearStart(r.v);
    return y === null ? null : { year: y, version: r.version }; // explicitly blank = deliberately cleared: leave it
  }
  return null;
}

interface ReportRow {
  holding: string;
  ward: string;
  owner: string;
  creationBefore: string;
  creationAfter: string;
  paidTillAfter: string;
  billedFrom: string;
  action: string;
  note: string;
}

async function main() {
  const currentYear = getCurrentAssessmentYearStartNum();
  const { rows: holdings } = await pool.query<{
    holding_no: string;
    ward: string | null;
    owner_name: string | null;
    holding_creation_year: string | null;
    created_date: Date | null;
    old_last_payment_year: string | null;
    old_holding_creation_year: string | null;
  }>(
    `SELECT p.holding_no, p.ward, p.owner_name, p.holding_creation_year, p.created_date,
            s.old_last_payment_year, s.old_holding_creation_year
       FROM properties p
       LEFT JOIN LATERAL (SELECT old_last_payment_year, old_holding_creation_year FROM migrated_holding_surveys s
                           WHERE s.holding_no = p.holding_no ORDER BY s.id DESC LIMIT 1) s ON TRUE
      WHERE p.tax_paid_till_year IS NULL
      ORDER BY p.holding_no`,
  );

  const report: ReportRow[] = [];
  const counts = {
    total: holdings.length,
    restoredFromHistory: 0,
    fromOldRecord: 0,
    fromReceipts: 0,
    creationCorrected: 0,
    leftBlank: 0,
    placeholderCreation: 0,
    heldMissingAssessment: 0,
    assessedFromFloors: 0,
    stillHeldPre2011Only: 0,
    stillHeldNoFloors: 0,
    stillHeldFloorsNotPriced: 0,
    noticesSuperseded: 0,
  };

  for (const h of holdings) {
    const creation = yearStart(h.holding_creation_year);
    const oldCreation = yearStart(h.old_holding_creation_year);
    let newCreation = creation;
    let creationReason: string | null = null;
    if (oldCreation !== null && (creation === null || oldCreation < creation) && oldCreation <= currentYear) {
      newCreation = oldCreation;
      creationReason = `old record's holding creation year ${fy(oldCreation)}`;
    }

    let paidTill: number | null = null;
    let paidReason: string | null = null;
    const hist = await paidTillFromHistory(h.holding_no);
    if (hist) {
      paidTill = hist.year;
      paidReason = `restored - cleared by a later save (last set in history version ${hist.version})`;
    } else {
      const old = yearStart(h.old_last_payment_year);
      if (old !== null && old <= currentYear) {
        paidTill = old;
        paidReason = `old record's Last Payment Year (${h.old_last_payment_year})`;
      }
    }
    const receipts = await effectivePaidTillStart({ holding_no: h.holding_no, tax_paid_till_year: null });
    if (receipts !== null && (paidTill === null || receipts > paidTill)) {
      paidTill = receipts;
      paidReason = `last year paid by a valid receipt`;
    }

    const notes: string[] = [];
    const createdFy = h.created_date ? getCurrentAssessmentYearStartNum(h.created_date) : null;
    if (!creationReason && paidTill === null && newCreation !== null && createdFy !== null && newCreation >= createdFy) {
      notes.push(
        "Creation year is the year it was entered in this system - check it against the old register; if it is older, correct it in the holding's details",
      );
      counts.placeholderCreation++;
    }

    // What the holding would be billed for after the change.
    const property = await propertyRepository.findByHoldingNo(h.holding_no);
    if (!property) continue;
    const after = {
      ...property,
      holding_creation_year: newCreation !== null ? fy(newCreation) : property.holding_creation_year,
      tax_paid_till_year: paidTill !== null ? fy(paidTill) : null,
    };
    const billedFromNum = Math.max((paidTill ?? (newCreation ?? currentYear) - 1) + 1, newCreation ?? currentYear);
    // Years without an assessment hold the holding (no notice, no payment). From 2011-12 onward the system can
    // compute them from the holding's floors (the same automatic assessment a save makes); earlier years need the
    // ARV from the old demand register.
    const stored = await propertyRepository.findTaxHistoryByHoldingNo(h.holding_no);
    const floors = await propertyRepository.findFloorsByHoldingNo(h.holding_no);
    const missingNow = missingTaxYears(after, stored);
    let assessReason: string | null = null;
    let missing = missingNow;
    if (missingNow.some((y) => y >= 2011) && floors.length) {
      const withComputed = [...stored.filter((s) => !s.auto_generated), ...computedStageRows(after, floors)];
      const missingAfter = missingTaxYears(after, withComputed);
      if (missingAfter.length < missingNow.length) {
        const covered = missingNow.filter((y) => !missingAfter.includes(y));
        assessReason = `assessment computed from the floors for ${yearRangesLabel(covered)}`;
        missing = missingAfter;
      }
    }
    if (missingNow.length) counts.heldMissingAssessment++;
    if (assessReason) counts.assessedFromFloors++;
    if (missing.length) {
      let why: string;
      if (missing.every((y) => y < 2011)) {
        why = "Tax Daroga to enter the pre-2011 ARV from the old demand register (Admin > Pre-2011 ARV Entry)";
        counts.stillHeldPre2011Only++;
      } else if (!floors.length || Number(property.area_sqft) <= 0) {
        why = "the holding has no floor details / area - it needs a survey";
        counts.stillHeldNoFloors++;
      } else {
        why = "its floors could not be priced (check usage type, construction type and year built of each floor)";
        counts.stillHeldFloorsNotPriced++;
      }
      notes.push(`Still no assessment for ${yearRangesLabel(missing)} - held until ${why}`);
    } else if (missingNow.length) {
      notes.push("Hold released by the computed assessment");
    }

    const actions: string[] = [];
    if (paidReason) actions.push(`paid till -> ${fy(paidTill!)} (${paidReason})`);
    if (creationReason) actions.push(`creation year ${h.holding_creation_year ?? "-"} -> ${fy(newCreation!)} (${creationReason})`);
    if (assessReason) actions.push(assessReason);
    if (!paidReason && !creationReason) counts.leftBlank++;
    if (!actions.length) actions.push("left blank - billed from the creation year");
    if (paidReason?.startsWith("restored")) counts.restoredFromHistory++;
    else if (paidReason?.startsWith("old record")) counts.fromOldRecord++;
    else if (paidReason) counts.fromReceipts++;
    if (creationReason) counts.creationCorrected++;

    report.push({
      holding: h.holding_no,
      ward: h.ward ?? "",
      owner: h.owner_name ?? "",
      creationBefore: h.holding_creation_year ?? "",
      creationAfter: newCreation !== null ? fy(newCreation) : "",
      paidTillAfter: paidTill !== null ? fy(paidTill) : "(blank)",
      billedFrom: billedFromNum <= currentYear ? fy(billedFromNum) : "(nothing due)",
      action: actions.join("; "),
      note: notes.join("; "),
    });

    if (APPLY && (paidReason || creationReason || assessReason)) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        if (paidReason) {
          await client.query(
            `UPDATE properties SET tax_paid_till_year = $2, last_modified_by = $3, last_modified_date = now() WHERE holding_no = $1`,
            [h.holding_no, fy(paidTill!), RUN_BY],
          );
          await client.query(
            `INSERT INTO holding_year_repair_log (holding_no, field, previous_value, new_value, reason, run_by) VALUES ($1,'tax_paid_till_year',NULL,$2,$3,$4)`,
            [h.holding_no, fy(paidTill!), paidReason, RUN_BY],
          );
        }
        if (creationReason) {
          await client.query(
            `UPDATE properties SET holding_creation_year = $2, last_modified_by = $3, last_modified_date = now() WHERE holding_no = $1`,
            [h.holding_no, fy(newCreation!), RUN_BY],
          );
          await client.query(
            `INSERT INTO holding_year_repair_log (holding_no, field, previous_value, new_value, reason, run_by) VALUES ($1,'holding_creation_year',$2,$3,$4,$5)`,
            [h.holding_no, h.holding_creation_year, fy(newCreation!), creationReason, RUN_BY],
          );
        }
        if (assessReason) {
          await client.query(
            `INSERT INTO holding_year_repair_log (holding_no, field, previous_value, new_value, reason, run_by) VALUES ($1,'tax_history_stages',NULL,NULL,$2,$3)`,
            [h.holding_no, assessReason, RUN_BY],
          );
        }
        const sup = await client.query(
          `UPDATE demand_notices SET superseded = TRUE WHERE holding_no = $1 AND NOT settled AND NOT cancelled AND NOT superseded AND NOT on_hold`,
          [h.holding_no],
        );
        counts.noticesSuperseded += sup.rowCount ?? 0;
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
      if ((creationReason || assessReason) && floors.length) {
        // The automatic assessment periods (2011-12 onward) are recomputed from the floors and the creation year.
        const fresh = await propertyRepository.findByHoldingNo(h.holding_no);
        if (fresh) await regenerateAutomaticTaxHistoryStages(h.holding_no, fresh, floors, RUN_BY);
      }
    }
  }

  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const header = [
    "Holding",
    "Ward",
    "Owner",
    "Creation year (before)",
    "Creation year (after)",
    "Tax paid till (after)",
    "Billed from",
    "Action",
    "Note",
  ];
  const lines = [
    header,
    ...report.map((r) => [r.holding, r.ward, r.owner, r.creationBefore, r.creationAfter, r.paidTillAfter, r.billedFrom, r.action, r.note]),
  ].map((l) => l.map(esc).join(","));
  fs.writeFileSync("repair-paid-till-report.csv", lines.join("\n") + "\n");

  console.log(APPLY ? "APPLIED." : "REPORT ONLY - nothing changed. Run with -- --apply to make the changes.");
  console.log(`Holdings with a blank tax-paid-till year: ${counts.total}`);
  console.log(`  paid-till restored (wiped by a later save):     ${counts.restoredFromHistory}`);
  console.log(`  paid-till from the old record's Last Payment Yr: ${counts.fromOldRecord}`);
  console.log(`  paid-till from valid receipts:                   ${counts.fromReceipts}`);
  console.log(`  creation year corrected from the old record:     ${counts.creationCorrected}`);
  console.log(`  left blank (billed from creation year):          ${counts.leftBlank}`);
  console.log(`  of all these - creation year looks like the entry year, check it: ${counts.placeholderCreation}`);
  console.log(`  of all these - held, years without an assessment:               ${counts.heldMissingAssessment}`);
  console.log(`     assessment computed from floors (2011-12 onward):             ${counts.assessedFromFloors}`);
  console.log(`     still held - only pre-2011 years (register ARV needed):       ${counts.stillHeldPre2011Only}`);
  console.log(`     still held - no floors / area (survey needed):                ${counts.stillHeldNoFloors}`);
  console.log(`     still held - floors could not be priced (check floors):       ${counts.stillHeldFloorsNotPriced}`);
  if (APPLY) console.log(`Open demand notices superseded (a fresh one is due): ${counts.noticesSuperseded}`);
  console.log("Details: repair-paid-till-report.csv");
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
