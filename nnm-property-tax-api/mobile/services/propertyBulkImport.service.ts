import ExcelJS from "exceljs";
import { pool } from "../config/db";

export interface PropertyImportResult {
  propertiesCreated: number;
  floorsCreated: number;
  transactionsCreated: number;
  demandNoticesCreated: number;
  taxHistoryStagesCreated: number;
  propertyHistoryCreated: number;
  errors: { sheet: string; row: number; message: string }[];
}

/**
 * Reads a cell's value as a plain string, handling ExcelJS's various
 * cell value shapes (plain value, {result: ...} formula cells, rich
 * text runs) - a bulk export like this is unlikely to have live
 * formulas, but being defensive here is cheap and avoids a confusing
 * "[object Object]" ending up in a text column.
 */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("result" in value && value.result !== null && value.result !== undefined) return String(value.result);
    if ("richText" in value) return (value.richText as { text: string }[]).map((r) => r.text).join("");
    if ("text" in value) return String((value as { text: unknown }).text);
    return "";
  }
  return String(value).trim();
}

function cellNumber(value: ExcelJS.CellValue): number | null {
  const text = cellText(value);
  if (!text) return null;
  const n = parseFloat(text);
  return Number.isNaN(n) ? null : n;
}

/**
 * Handles every date shape actually present in the real backup: a
 * native JS Date (from an Excel-formatted date cell - ExcelJS already
 * resolves these correctly, no ambiguity), a "dd-mm-yyyy HH:MM[:SS]"
 * text string (the more common case in this sheet), or a
 * "yyyy-mm-dd HH:MM:SS" text string. Returns an ISO timestamp string
 * for Postgres, or null if genuinely unparseable - never throws, so
 * one bad date doesn't fail the whole row.
 */
function parseFlexibleDateTime(value: ExcelJS.CellValue): string | null {
  if (value instanceof Date) return value.toISOString();
  const text = cellText(value);
  if (!text) return null;

  const ddmmyyyy = text.match(/^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (ddmmyyyy) {
    const [, d, m, y, hh, mm, ss] = ddmmyyyy;
    const day = parseInt(d!, 10);
    const month = parseInt(m!, 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const iso = `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${(hh ?? "00").padStart(2, "0")}:${mm ?? "00"}:${ss ?? "00"}`;
      const parsed = new Date(iso);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }
  }

  const isoLike = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (isoLike) {
    const parsed = new Date(text.replace(" ", "T"));
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  return null;
}

/** "Yes"/"No" text -> boolean. Defaults to false for anything else, including blank. */
function parseYesNo(value: ExcelJS.CellValue): boolean {
  return cellText(value).trim().toLowerCase() === "yes";
}

/** Reads a worksheet into an array of {header: cellText} row objects, using row 1 as headers. Skips fully-blank rows. */
function readSheet(ws: ExcelJS.Worksheet | undefined): { row: Record<string, ExcelJS.CellValue>; excelRowNum: number }[] {
  if (!ws) return [];
  const headers: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, colNum) => {
    headers[colNum] = cellText(cell.value).trim();
  });

  const results: { row: Record<string, ExcelJS.CellValue>; excelRowNum: number }[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum === 1) return;
    const obj: Record<string, ExcelJS.CellValue> = {};
    let hasAnyValue = false;
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      const header = headers[colNum];
      if (!header) return;
      obj[header] = cell.value;
      if (cellText(cell.value)) hasAnyValue = true;
    });
    if (hasAnyValue) results.push({ row: obj, excelRowNum: rowNum });
  });
  return results;
}

/**
 * Imports all 6 sheets from a Google-Sheets-style backup export
 * (Master, Floors, Transactions, PropertyHistory, DemandNotices,
 * TaxHistoryStages) - the same shape the system was originally
 * migrated from (see migration 001's header comment), so this is
 * built to accept that exact format rather than a from-scratch
 * design. Order matters: Master (properties) is imported first since
 * every other sheet's HoldingNo references it; the other five don't
 * reference each other so their relative order doesn't matter.
 *
 * holding_no values are imported EXACTLY as given (including the
 * legacy "MUNG- 12345" format with its space) - these are the real
 * system's official identifiers, not something to reformat.
 *
 * Existing holdings/rows (matched by primary key) are skipped, not
 * overwritten or duplicated - safe to re-run this import if it's
 * interrupted partway through, or to import a later backup that
 * overlaps with an earlier one.
 */
export async function importPropertiesXlsx(fileBuffer: Buffer, actorDisplayName: string): Promise<PropertyImportResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer as unknown as ArrayBuffer);

  const result: PropertyImportResult = {
    propertiesCreated: 0,
    floorsCreated: 0,
    transactionsCreated: 0,
    demandNoticesCreated: 0,
    taxHistoryStagesCreated: 0,
    propertyHistoryCreated: 0,
    errors: [],
  };

  // --- Master -> properties ---
  // Tracks holdings that already existed BEFORE this import run (or
  // are duplicated within the sheet itself) - Floors and
  // TaxHistoryStages have no natural unique key of their own (unlike
  // properties.holding_no, transactions.receipt_no,
  // demand_notices.demand_no, or property_history's (holding_no,
  // version) constraint), so re-running this import against the same
  // file would otherwise silently duplicate every floor and tax-
  // history row for a holding each time. Skipping child rows for any
  // holding not newly created in THIS run keeps a re-run safe.
  const preExistingHoldings = new Set<string>();

  for (const { row, excelRowNum } of readSheet(workbook.getWorksheet("Master"))) {
    try {
      const holdingNo = cellText(row.HoldingNo);
      if (!holdingNo) {
        result.errors.push({ sheet: "Master", row: excelRowNum, message: "Missing HoldingNo" });
        continue;
      }

      // Space-normalized comparison, not exact-match: a holding
      // originally imported as "MUNG- 12345" and later renamed to
      // "MUNG-12345" (via the space-fix tool) must still be
      // recognized as existing if this same source file is
      // re-uploaded - an exact match would miss it (the stored value
      // no longer matches the source string byte-for-byte) and
      // silently create a duplicate holding.
      const existing = await pool.query(`SELECT 1 FROM properties WHERE REPLACE(holding_no, ' ', '') = REPLACE($1, ' ', '')`, [holdingNo]);
      if (existing.rows.length > 0) {
        preExistingHoldings.add(holdingNo);
        result.errors.push({ sheet: "Master", row: excelRowNum, message: `Holding "${holdingNo}" already exists - skipped` });
        continue;
      }

      const ownerName = cellText(row.OwnerName);
      const address = cellText(row.Address);
      const assessmentYear = cellText(row.AssessmentYear);
      const roadType = cellText(row.RoadType);
      if (!ownerName || !address || !assessmentYear || !["PMR", "MR", "OR"].includes(roadType)) {
        result.errors.push({
          sheet: "Master",
          row: excelRowNum,
          message: `Holding "${holdingNo}" is missing a required field (owner name, address, assessment year, or a valid road type) - skipped`,
        });
        continue;
      }

      // holding_creation_year is NOT NULL in the schema but a small
      // number of real rows have it blank - falling back to
      // assessment_year is a reasonable default rather than rejecting
      // an otherwise-good row over one missing field.
      const holdingCreationYear = cellText(row.HoldingCreationYear) || assessmentYear;

      const relationType = cellText(row.RelationType);

      await pool.query(
        `INSERT INTO properties (
          holding_no, old_holding_no, old_pid, owner_name, relation_type, relation_name, mobile_no,
          area_sqft, address, ward, zone, pincode, assessment_year, road_type, vacant_area_sqft,
          rain_water_harvesting, solar_rooftop, arrear_tax, solid_waste_charge_type, solid_waste_months,
          solid_waste_charge, penal_charge, water_charge, boring_charge, form_fee, misc_cost,
          misc_cost_reason, misc_rebate, misc_rebate_reason, arv, tax_payable, holding_creation_year,
          tax_paid_till_year, present_holding_name, present_category, created_by, created_date,
          last_modified_by, last_modified_date
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39)`,
        [
          holdingNo,
          cellText(row.OldHoldingNo) || null,
          cellText(row.OldPID) || null,
          ownerName,
          ["S/O", "D/O", "W/O", "C/O"].includes(relationType) ? relationType : null,
          cellText(row.RelationName) || null,
          cellText(row.MobileNo) || null,
          cellNumber(row.AreaSqft) ?? 0,
          address,
          cellText(row.Ward) || null,
          cellText(row.Zone) || null,
          cellText(row.Pincode) || null,
          assessmentYear,
          roadType,
          cellNumber(row.VacantAreaSqft) ?? 0,
          parseYesNo(row.RainWaterHarvesting),
          parseYesNo(row.SolarRooftop),
          cellNumber(row.ArrearTax) ?? 0,
          cellText(row.SolidWasteUserChargeType) || null,
          cellNumber(row.SolidWasteMonths) ?? 12,
          cellNumber(row.SolidWasteCharge) ?? 0,
          cellNumber(row.PenalCharge) ?? 0,
          cellNumber(row.WaterCharge) ?? 0,
          cellNumber(row.BoringCharge) ?? 0,
          cellNumber(row.FormFee) ?? 0,
          cellNumber(row.MiscCost) ?? 0,
          cellText(row.MiscCostReason) || null,
          cellNumber(row.MiscRebate) ?? 0,
          cellText(row.MiscRebateReason) || null,
          cellNumber(row.ARV) ?? 0,
          cellNumber(row.TaxPayable) ?? 0,
          holdingCreationYear,
          cellText(row.TaxPaidTillYear) || null,
          cellText(row.PresentHoldingName) || null,
          cellText(row.PresentCategory) || null,
          cellText(row.CreatedBy) || actorDisplayName,
          parseFlexibleDateTime(row.CreatedDate) ?? new Date().toISOString(),
          cellText(row.LastModifiedBy) || null,
          parseFlexibleDateTime(row.LastModifiedDate),
        ],
      );
      result.propertiesCreated++;
    } catch (err) {
      result.errors.push({ sheet: "Master", row: excelRowNum, message: err instanceof Error ? err.message : String(err) });
    }
  }

  // --- Floors ---
  for (const { row, excelRowNum } of readSheet(workbook.getWorksheet("Floors"))) {
    try {
      const holdingNo = cellText(row.HoldingNo);
      const floorLabel = cellText(row.Floor);
      const constType = cellText(row.ConstType);
      const usageType = cellText(row.Usage);
      if (!holdingNo || !floorLabel || !constType || !usageType) {
        result.errors.push({ sheet: "Floors", row: excelRowNum, message: "Missing HoldingNo, Floor, ConstType, or Usage" });
        continue;
      }
      if (preExistingHoldings.has(holdingNo)) {
        result.errors.push({ sheet: "Floors", row: excelRowNum, message: `Holding "${holdingNo}" already exists - its floors were not re-imported` });
        continue;
      }

      const occupancyRaw = cellText(row.Occupancy).toLowerCase();
      await pool.query(
        `INSERT INTO floors (holding_no, floor_label, buildup_sqft, const_type, usage_type, occupancy, year_built, closing_year, floor_arv, floor_tax)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          holdingNo,
          floorLabel,
          cellNumber(row.BuildupSqft) ?? 0,
          constType,
          usageType,
          occupancyRaw === "rented" ? "rented" : "self",
          cellText(row.YearBuilt) || null,
          cellText(row.ClosingYear) || null,
          cellNumber(row.FloorARV) ?? 0,
          cellNumber(row.FloorTax) ?? 0,
        ],
      );
      result.floorsCreated++;
    } catch (err) {
      result.errors.push({ sheet: "Floors", row: excelRowNum, message: err instanceof Error ? err.message : String(err) });
    }
  }

  // --- Transactions --- "Generated by Mistake" (Status column) maps
  // to the cancelled/cancelled_reason/cancelled_at columns already
  // added for property tax in migration 026 - preserving that history
  // rather than silently dropping it or importing it as if it were a
  // still-valid payment.
  for (const { row, excelRowNum } of readSheet(workbook.getWorksheet("Transactions"))) {
    try {
      const receiptNo = cellText(row.ReceiptNo);
      const holdingNo = cellText(row.HoldingNo);
      const amountReceived = cellNumber(row.AmountReceived);
      if (!receiptNo || !holdingNo || amountReceived === null) {
        result.errors.push({ sheet: "Transactions", row: excelRowNum, message: "Missing ReceiptNo, HoldingNo, or AmountReceived" });
        continue;
      }

      const isCancelled = cellText(row.Status).trim().toLowerCase() === "generated by mistake";

      await pool.query(
        `INSERT INTO transactions (receipt_no, holding_no, txn_date, payment_mode, amount_received, collected_by, counter, demand_no, arrear_periods_paid, cancelled, cancelled_reason, cancelled_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          receiptNo,
          holdingNo,
          parseFlexibleDateTime(row.Date) ?? new Date().toISOString(),
          cellText(row.PaymentMode) || "Cash",
          amountReceived,
          cellText(row.CollectedBy) || actorDisplayName,
          cellText(row.Counter) || null,
          cellText(row.DemandNo) || null,
          cellText(row.ArrearYearsPaid) || null,
          isCancelled,
          isCancelled ? cellText(row.StatusReason) || null : null,
          isCancelled ? parseFlexibleDateTime(row.StatusDate) : null,
        ],
      );
      result.transactionsCreated++;
    } catch (err) {
      result.errors.push({ sheet: "Transactions", row: excelRowNum, message: err instanceof Error ? err.message : String(err) });
    }
  }

  // --- DemandNotices --- the real backup has 3 exact duplicate rows
  // (same DemandNo, same everything) - tracked here and skipped
  // silently rather than reported as an error, since they're not a
  // data problem to flag, just a re-exported row.
  const seenDemandNos = new Set<string>();
  for (const { row, excelRowNum } of readSheet(workbook.getWorksheet("DemandNotices"))) {
    try {
      const demandNo = cellText(row.DemandNo);
      const holdingNo = cellText(row.HoldingNo);
      if (!demandNo || !holdingNo) {
        result.errors.push({ sheet: "DemandNotices", row: excelRowNum, message: "Missing DemandNo or HoldingNo" });
        continue;
      }
      if (seenDemandNos.has(demandNo)) continue;
      seenDemandNos.add(demandNo);

      await pool.query(
        `INSERT INTO demand_notices (demand_no, holding_no, notice_date, generated_by, arv, current_year_tax_net, previous_years_tax_base, total_fine_amount, other_charges, total_amount_demanded)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          demandNo,
          holdingNo,
          parseFlexibleDateTime(row.Date) ?? new Date().toISOString(),
          cellText(row.GeneratedBy) || actorDisplayName,
          cellNumber(row.ARV) ?? 0,
          cellNumber(row.CurrentYearTaxNet) ?? 0,
          cellNumber(row.PreviousYearsTaxBase) ?? 0,
          cellNumber(row.TotalFineAmount) ?? 0,
          cellNumber(row.OtherCharges) ?? 0,
          cellNumber(row.TotalAmountDemanded) ?? 0,
        ],
      );
      result.demandNoticesCreated++;
    } catch (err) {
      result.errors.push({ sheet: "DemandNotices", row: excelRowNum, message: err instanceof Error ? err.message : String(err) });
    }
  }

  // --- TaxHistoryStages ---
  for (const { row, excelRowNum } of readSheet(workbook.getWorksheet("TaxHistoryStages"))) {
    try {
      const holdingNo = cellText(row.HoldingNo);
      const periodOfAssessment = cellText(row.PeriodOfAssessment);
      const startYearUsed = cellNumber(row.StartYearUsed);
      const closingYear = cellNumber(row.ClosingYear);
      const taxRateInPeriod = cellNumber(row.TaxRateInPeriod);
      const annualTaxAmount = cellNumber(row.AnnualTaxAmount);
      const yearsCount = cellNumber(row.YearsCount);
      const totalAmount = cellNumber(row.TotalAmount);
      if (!holdingNo || !periodOfAssessment || startYearUsed === null || closingYear === null || taxRateInPeriod === null || annualTaxAmount === null || yearsCount === null || totalAmount === null) {
        result.errors.push({ sheet: "TaxHistoryStages", row: excelRowNum, message: "Missing a required field" });
        continue;
      }
      if (preExistingHoldings.has(holdingNo)) {
        result.errors.push({ sheet: "TaxHistoryStages", row: excelRowNum, message: `Holding "${holdingNo}" already exists - its tax history was not re-imported` });
        continue;
      }

      const overrideReason = cellText(row.OverrideReason) || null;
      const overrideRemarks = cellText(row.OverrideRemarks) || null;

      await pool.query(
        `INSERT INTO tax_history_stages (holding_no, period_of_assessment, start_year_used, closing_year, arv_in_period, tax_rate_in_period, annual_tax_amount, years_count, total_amount, override_reason, override_remarks, added_by, added_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          holdingNo,
          periodOfAssessment,
          startYearUsed,
          closingYear,
          cellNumber(row.ARVInPeriod) ?? 0,
          taxRateInPeriod,
          annualTaxAmount,
          yearsCount,
          totalAmount,
          // The check constraint requires both override fields
          // present together or both null - if the sheet only has one
          // of the two, pair it with a placeholder rather than
          // violating the constraint and losing the row.
          overrideReason ?? (overrideRemarks ? "Not specified" : null),
          overrideRemarks ?? (overrideReason ? "Not specified" : null),
          cellText(row.AddedBy) || actorDisplayName,
          parseFlexibleDateTime(row.AddedDate) ?? new Date().toISOString(),
        ],
      );
      result.taxHistoryStagesCreated++;
    } catch (err) {
      result.errors.push({ sheet: "TaxHistoryStages", row: excelRowNum, message: err instanceof Error ? err.message : String(err) });
    }
  }

  // --- PropertyHistory --- Snapshot is already a valid JSON string in
  // the real backup (parsed here to store as proper JSONB, not a
  // JSON-shaped text string), and Action values already match the
  // 'Created'/'Updated' check constraint exactly.
  for (const { row, excelRowNum } of readSheet(workbook.getWorksheet("PropertyHistory"))) {
    try {
      const holdingNo = cellText(row.HoldingNo);
      const version = cellNumber(row.Version);
      const action = cellText(row.Action);
      const operatorName = cellText(row.OperatorName);
      const snapshotText = cellText(row.Snapshot);
      if (!holdingNo || version === null || !["Created", "Updated"].includes(action) || !operatorName || !snapshotText) {
        result.errors.push({ sheet: "PropertyHistory", row: excelRowNum, message: "Missing a required field, or Action isn't 'Created'/'Updated'" });
        continue;
      }

      let snapshot: unknown;
      try {
        snapshot = JSON.parse(snapshotText);
      } catch {
        result.errors.push({ sheet: "PropertyHistory", row: excelRowNum, message: "Snapshot column isn't valid JSON" });
        continue;
      }

      await pool.query(
        `INSERT INTO property_history (holding_no, version, action, change_basis, change_reference, operator_name, ts, snapshot)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          holdingNo,
          version,
          action,
          cellText(row.ChangeBasis) || null,
          cellText(row.ChangeReference) || null,
          operatorName,
          parseFlexibleDateTime(row.Timestamp) ?? new Date().toISOString(),
          JSON.stringify(snapshot),
        ],
      );
      result.propertyHistoryCreated++;
    } catch (err) {
      result.errors.push({ sheet: "PropertyHistory", row: excelRowNum, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}

