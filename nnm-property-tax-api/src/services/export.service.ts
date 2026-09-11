import ExcelJS from "exceljs";
import { pool } from "../config/db";
import { istDateString } from "../utils/istDate";
import { propertyRepository } from "../repositories/property.repository";
import { paymentRepository } from "../repositories/payment.repository";
import { demandNoticeRepository } from "../repositories/demandNotice.repository";
import { changeRequestRepository } from "../repositories/changeRequest.repository";
import { shopRepository, shopAgreementRepository } from "../repositories/shop.repository";
import { shopRentDemandRepository, shopRentPaymentRepository } from "../repositories/shopRent.repository";
import { shopAgreementChangeRequestRepository } from "../repositories/shopAgreementChangeRequest.repository";
import { shopViolationNoticeRepository } from "../repositories/shopViolationNotice.repository";
import { shopRentalApplicationRepository } from "../repositories/shopRentalApplication.repository";
import { tradeLicenseApplicationRepository } from "../repositories/tradeLicenseApplication.repository";

/**
 * Columns are derived from whatever keys the FIRST row actually has —
 * deliberately not hardcoded per dataset, so a column added to the
 * schema later (as has happened repeatedly during this build) shows up
 * in the export automatically, without this file needing a matching
 * update every time. Object/array values (e.g. change_requests'
 * proposed_data JSON) are stringified; Dates are left as-is for Excel's
 * native date handling.
 */
export function addSheetFromRows(workbook: ExcelJS.Workbook, sheetName: string, rows: Record<string, unknown>[]): void {
  const sheet = workbook.addWorksheet(sheetName);
  if (rows.length === 0) {
    sheet.addRow(["No data"]);
    return;
  }

  const columns = Object.keys(rows[0]!);
  sheet.columns = columns.map((key) => ({
    header: key,
    key,
    width: Math.min(Math.max(key.length + 2, 14), 40),
  }));
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    const normalized: Record<string, unknown> = {};
    for (const key of columns) {
      const value = row[key];
      normalized[key] =
        value && typeof value === "object" && !(value instanceof Date) ? JSON.stringify(value) : value;
    }
    sheet.addRow(normalized);
  }

  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
}

export type ExportDataset =
  | "properties"
  | "floors"
  | "tax_history"
  | "property_history"
  | "payments"
  | "notices"
  | "changes"
  | "shops"
  | "shop_agreements"
  | "shop_rent_payments"
  | "shop_violation_notices"
  | "shop_rental_applications"
  | "trade_license_applications"
  | "all";

export async function buildReceiptsExportWorkbook(range: "daily" | "monthly" | "overall", dateStr?: string): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "NNM Property Tax Portal";
  workbook.created = new Date();

  let rows;
  let sheetName: string;

  if (range === "overall") {
    rows = await paymentRepository.findAll();
    sheetName = "All Receipts";
  } else {
    // Same IST wall-clock -> UTC instant pattern as istShiftStartToday()
    // in istDate.ts - never assume the server's local time is IST.
    const IST_OFFSET_MS = (5 * 60 + 30) * 60000;
    const todayIst = dateStr ?? istDateString(new Date());
    const [y, mo, da] = todayIst.split("-").map((n) => parseInt(n, 10)) as [number, number, number];

    let from: Date;
    let to: Date;
    if (range === "daily") {
      from = new Date(Date.UTC(y, mo - 1, da, 0, 0, 0) - IST_OFFSET_MS);
      to = new Date(from.getTime() + 24 * 3600 * 1000);
      sheetName = `Receipts ${todayIst}`;
    } else {
      from = new Date(Date.UTC(y, mo - 1, 1, 0, 0, 0) - IST_OFFSET_MS);
      to = new Date(Date.UTC(y, mo, 1, 0, 0, 0) - IST_OFFSET_MS);
      sheetName = `Receipts ${todayIst.slice(0, 7)}`;
    }
    rows = await paymentRepository.findByDateRange(from, to);
  }

  addSheetFromRows(workbook, sheetName, rows as unknown as Record<string, unknown>[]);
  return workbook;
}

/**
 * One sheet per requested dataset — "all" produces every sheet in a
 * single workbook. Generated fresh from the live database on every
 * call; nothing is cached or pre-built.
 */
export async function buildExportWorkbook(dataset: ExportDataset): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "NNM Property Tax Portal";
  workbook.created = new Date();

  if (dataset === "properties" || dataset === "all") {
    const rows = await propertyRepository.findAll();
    addSheetFromRows(workbook, "Properties", rows as unknown as Record<string, unknown>[]);
  }
  if (dataset === "floors" || dataset === "all") {
    const { rows } = await pool.query(`SELECT * FROM floors ORDER BY holding_no, id`);
    addSheetFromRows(workbook, "Floors", rows as Record<string, unknown>[]);
  }
  if (dataset === "tax_history" || dataset === "all") {
    const { rows } = await pool.query(`SELECT * FROM tax_history_stages ORDER BY holding_no, id`);
    addSheetFromRows(workbook, "Tax History", rows as Record<string, unknown>[]);
  }
  if (dataset === "property_history" || dataset === "all") {
    const { rows } = await pool.query(`SELECT * FROM property_history ORDER BY holding_no, version`);
    addSheetFromRows(workbook, "Property History", rows as Record<string, unknown>[]);
  }
  if (dataset === "payments" || dataset === "all") {
    const rows = await paymentRepository.findAll();
    addSheetFromRows(workbook, "Payments", rows as unknown as Record<string, unknown>[]);
  }
  if (dataset === "notices" || dataset === "all") {
    const rows = await demandNoticeRepository.findAll();
    addSheetFromRows(workbook, "Demand Notices", rows as unknown as Record<string, unknown>[]);
  }
  if (dataset === "changes" || dataset === "all") {
    const rows = await changeRequestRepository.list({});
    addSheetFromRows(workbook, "Mutation Requests", rows as unknown as Record<string, unknown>[]);
  }
  if (dataset === "shops" || dataset === "all") {
    const rows = await shopRepository.listAll();
    addSheetFromRows(workbook, "Shops", rows as unknown as Record<string, unknown>[]);
  }
  if (dataset === "shop_agreements" || dataset === "all") {
    const rows = await shopAgreementRepository.listAll();
    addSheetFromRows(workbook, "Shop Agreements", rows as unknown as Record<string, unknown>[]);
    const changeRows = await shopAgreementChangeRequestRepository.list({});
    addSheetFromRows(workbook, "Shop Agreement Requests", changeRows as unknown as Record<string, unknown>[]);
  }
  if (dataset === "shop_rent_payments" || dataset === "all") {
    const demandRows = await shopRentDemandRepository.findAll();
    addSheetFromRows(workbook, "Shop Rent Demands", demandRows as unknown as Record<string, unknown>[]);
    const paymentRows = await shopRentPaymentRepository.findAll();
    addSheetFromRows(workbook, "Shop Rent Payments", paymentRows as unknown as Record<string, unknown>[]);
  }
  if (dataset === "shop_violation_notices" || dataset === "all") {
    const rows = await shopViolationNoticeRepository.findAll();
    addSheetFromRows(workbook, "Shop Violation Notices", rows as unknown as Record<string, unknown>[]);
  }
  if (dataset === "shop_rental_applications" || dataset === "all") {
    const rows = await shopRentalApplicationRepository.list({});
    addSheetFromRows(workbook, "Shop Rental Applications", rows as unknown as Record<string, unknown>[]);
  }
  if (dataset === "trade_license_applications" || dataset === "all") {
    const rows = await tradeLicenseApplicationRepository.list({});
    addSheetFromRows(workbook, "Trade License Applications", rows as unknown as Record<string, unknown>[]);
    const checklistRows = await tradeLicenseApplicationRepository.findAllChecklistItems();
    addSheetFromRows(workbook, "Trade License Document Checklist", checklistRows as unknown as Record<string, unknown>[]);
  }

  return workbook;
}