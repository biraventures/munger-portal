import { pool } from "../config/db";
import { ApiError } from "../utils/ApiError";

/**
 * The five things the Tax Collector must collect for every holding (field verification, migration 082): GPS
 * location, the owner's Aadhaar number, a photo of the holding, the previous year's holding tax receipt and a land
 * ownership document. Counted as "on file" across all field verifications of the holding (each may have been taken
 * on a different visit). Until all five are on file:
 *   - the Tax Collector cannot collect payment for the holding, and
 *   - the holding cannot be paid online (portal or demand notice QR code).
 */
export const HOLDING_DOCUMENT_LABELS = {
  gps: "GPS location of the holding",
  aadhaar: "Owner's Aadhaar number",
  holdingPhoto: "Photo of the holding",
  previousReceipt: "Previous year's holding tax receipt",
  landDocument: "Land ownership document",
} as const;
export type HoldingDocumentKey = keyof typeof HOLDING_DOCUMENT_LABELS;

export interface HoldingDocumentStatus {
  complete: boolean;
  onFile: Record<HoldingDocumentKey, boolean>;
  /** Labels of what is still missing, in display order. */
  missing: string[];
}

export async function getHoldingDocumentStatus(holdingNo: string): Promise<HoldingDocumentStatus> {
  const { rows } = await pool.query<Record<HoldingDocumentKey, boolean | null>>(
    `SELECT bool_or(gps_lat IS NOT NULL AND gps_lng IS NOT NULL) AS "gps",
            bool_or(aadhaar_number IS NOT NULL) AS "aadhaar",
            bool_or(holding_photo_path IS NOT NULL) AS "holdingPhoto",
            bool_or(previous_receipt_photo_path IS NOT NULL) AS "previousReceipt",
            bool_or(land_document_photo_path IS NOT NULL) AS "landDocument"
       FROM property_field_verifications WHERE holding_no = $1`,
    [holdingNo],
  );
  const r = rows[0] ?? ({} as Record<HoldingDocumentKey, boolean | null>);
  const onFile = Object.fromEntries((Object.keys(HOLDING_DOCUMENT_LABELS) as HoldingDocumentKey[]).map((k) => [k, !!r[k]])) as Record<HoldingDocumentKey, boolean>;
  const missing = (Object.keys(HOLDING_DOCUMENT_LABELS) as HoldingDocumentKey[]).filter((k) => !onFile[k]).map((k) => HOLDING_DOCUMENT_LABELS[k]);
  return { complete: missing.length === 0, onFile, missing };
}

/** The message shown to a citizen whose holding cannot be paid online yet. */
export function onlinePaymentDocumentsMessage(missing: string[]): string {
  return (
    `Online payment is not available for this holding until its documents are uploaded: ${missing.join(", ")}. ` +
    `Please get these uploaded through your ward's Tax Collector or at the Holding Tax Section, Municipal Corporation Office, Munger.`
  );
}

/** Online payment (portal or QR): refused until every document is on file. */
export async function assertDocumentsForOnlinePayment(holdingNo: string): Promise<void> {
  const status = await getHoldingDocumentStatus(holdingNo);
  if (!status.complete) throw ApiError.badRequest(onlinePaymentDocumentsMessage(status.missing));
}

/** Tax Collector collection: refused until every document is on file. */
export async function assertDocumentsForCollection(holdingNo: string): Promise<void> {
  const status = await getHoldingDocumentStatus(holdingNo);
  if (!status.complete) {
    throw ApiError.badRequest(
      `Collect the holding's documents first (Field Verification on this page): ${status.missing.join(", ")}. Payment can be collected once all are uploaded.`,
    );
  }
}

/** Aadhaar number check: 12 digits, not starting with 0 or 1, valid Verhoeff check digit. */
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
