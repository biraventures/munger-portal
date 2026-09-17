import ExcelJS from "exceljs";
import { pool } from "../config/db";
import { getNextMigratedHoldingNo } from "./holdingNumberSeries.service";
import { migratedHoldingSurveyRepository } from "../repositories/migratedHoldingSurvey.repository";

/**
 * Expected columns, in order, matching the "Cleaned Data" sheet this
 * import is built for (see the data-cleaning pass that produced
 * holdings_cleaned.xlsx): Sl. No., Ward No., Old Holding No., Old PID
 * No., Holding Owner Name, Relation, Relative Name, ARV Before
 * 1996-1997, ARV 1997-1998 to 2010-2011, ARV 2011-2012 to 2020-2021,
 * Last Payment Year, Tax Status, Remarks. A 14th "Needs Review"
 * column, if present, is read but not imported from - rows still
 * carrying a review note are skipped rather than imported with
 * placeholder/unresolved data, so they don't silently enter the
 * system with a wrong ward or a garbled name.
 */
export interface MigratedHoldingImportResult {
  holdingsCreated: number;
  rowsSkipped: number;
  errors: { row: number; message: string }[];
}

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

const VALID_RELATIONS = new Set(["S/O", "D/O", "W/O", "C/O"]);

export async function importMigratedHoldingsXlsx(fileBuffer: Buffer, actorDisplayName: string): Promise<MigratedHoldingImportResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { holdingsCreated: 0, rowsSkipped: 0, errors: [{ row: 0, message: "The workbook has no sheets." }] };
  }

  const result: MigratedHoldingImportResult = { holdingsCreated: 0, rowsSkipped: 0, errors: [] };

  for (let rowNo = 2; rowNo <= sheet.rowCount; rowNo++) {
    const row = sheet.getRow(rowNo);
    const ward = cellText(row.getCell(2).value);
    const oldHoldingNo = cellText(row.getCell(3).value) || null;
    const oldPid = cellText(row.getCell(4).value) || null;
    const ownerName = cellText(row.getCell(5).value);
    const relationRaw = cellText(row.getCell(6).value).toUpperCase();
    const relativeName = cellText(row.getCell(7).value) || null;
    const arvPre96 = cellNumber(row.getCell(8).value);
    const arv97to2010 = cellNumber(row.getCell(9).value);
    const arv2011to2020 = cellNumber(row.getCell(10).value);
    const lastPaymentYear = cellText(row.getCell(11).value) || null;
    const taxStatus = cellText(row.getCell(12).value) || null;
    const remarks = cellText(row.getCell(13).value) || null;
    const needsReview = cellText(row.getCell(14).value) || null;

    if (!ward && !ownerName) continue; // blank trailing row

    if (needsReview) {
      result.rowsSkipped++;
      continue;
    }
    if (!ownerName) {
      result.errors.push({ row: rowNo, message: "Owner name is required." });
      continue;
    }
    if (!ward || !/^\d+$/.test(ward)) {
      result.errors.push({ row: rowNo, message: `Invalid ward number: '${ward}'` });
      continue;
    }

    const relationType = VALID_RELATIONS.has(relationRaw) ? (relationRaw as "S/O" | "D/O" | "W/O" | "C/O") : null;
    const holdingNo = await getNextMigratedHoldingNo();
    const currentAssessmentYear = (() => {
      const now = new Date();
      const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1; // Indian FY starts in April
      return `${startYear}-${startYear + 1}`;
    })();

    try {
      await pool.query(
        `INSERT INTO properties (
          holding_no, old_holding_no, old_pid, owner_name, relation_type, relation_name,
          area_sqft, address, ward, assessment_year, road_type, holding_creation_year,
          created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8,$9,'MR',$9,$10)`,
        [
          holdingNo,
          oldHoldingNo,
          oldPid,
          ownerName,
          relationType,
          relativeName,
          `Ward ${ward}, Munger - address to be confirmed on survey`,
          ward,
          currentAssessmentYear,
          actorDisplayName,
        ],
      );

      // Old ARV/payment/status/remarks figures are reference-only,
      // carried straight from the old paper record onto the
      // migrated_holding_surveys row itself - never applied to any
      // live tax calculation (tax_history_stages, by contrast,
      // stores fully-computed period tax figures, which these
      // migrated placeholders don't have yet) until the holding is
      // surveyed and finalized through the normal flow.
      await migratedHoldingSurveyRepository.create(holdingNo, ward, actorDisplayName, {
        oldArvPre1996: arvPre96,
        oldArv1997to2010: arv97to2010,
        oldArv2011to2020: arv2011to2020,
        oldLastPaymentYear: lastPaymentYear,
        oldTaxStatus: taxStatus,
        oldRemarks: remarks,
      });
      result.holdingsCreated++;
    } catch (err) {
      result.errors.push({ row: rowNo, message: err instanceof Error ? err.message : "Unknown error creating this holding." });
    }
  }

  return result;
}
