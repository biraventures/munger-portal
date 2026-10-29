import { pool } from "../config/db";

/**
 * Holdings for which holding tax was collected on a given day (Indian date): one row per receipt, with the holding,
 * who collected it and how, and the year the holding is now paid till. Cancelled receipts are listed (marked) but not
 * counted in the total. For the Team Leader, Project Manager, Tax Daroga and senior officers.
 */
export interface CollectedHoldingRow {
  receipt_no: string;
  txn_time: string;
  holding_no: string;
  old_holding_no: string | null;
  owner_name: string | null;
  mobile_no: string | null;
  ward: string | null;
  amount: string;
  payment_mode: string;
  collected_by: string | null;
  collected_by_role: string | null;
  tax_collector_name: string | null;
  demand_no: string | null;
  paid_till: string | null;
  cancelled: boolean;
  reconcile_status: string | null;
}

/** A Tax Collector's field visit of a holding: who, when, GPS, which photos are on file, Aadhaar (masked). */
export interface FieldVisitSummary {
  id: number;
  holding_no: string;
  captured_by_display_name: string;
  captured_by_role: string;
  captured_at: string;
  gps_lat: string | null;
  gps_lng: string | null;
  aadhaar_number: string | null;
  holding_photo_path: string | null;
  aadhaar_photo_path: string | null;
  previous_receipt_photo_path: string | null;
  land_document_photo_path: string | null;
  register_photo_path: string | null;
}

export async function listCollectedHoldings(
  date: string,
  ward?: string,
): Promise<{ date: string; rows: CollectedHoldingRow[]; holdings: number; receipts: number; total: number; fieldVisits: Record<string, FieldVisitSummary[]> }> {
  const params: unknown[] = [date];
  let wardClause = "";
  if (ward) {
    params.push(ward);
    wardClause = `AND btrim(p.ward) = $2`;
  }
  const { rows } = await pool.query<CollectedHoldingRow>(
    `SELECT t.receipt_no, t.txn_date AS txn_time, t.holding_no, p.old_holding_no, p.owner_name, p.mobile_no, btrim(p.ward) AS ward,
            t.amount_received AS amount, t.payment_mode, t.collected_by, t.collected_by_role, t.tax_collector_name, t.demand_no,
            COALESCE(CASE WHEN n.part_payment AND n.paid_through_year IS NOT NULL THEN n.paid_through_year ELSE n.assessment_year END, p.tax_paid_till_year) AS paid_till,
            COALESCE(t.cancelled, FALSE) AS cancelled, t.reconcile_status
       FROM transactions t
       JOIN properties p ON p.holding_no = t.holding_no
       LEFT JOIN demand_notices n ON n.settled_receipt_no = t.receipt_no
      WHERE t.status = 'success' AND t.receipt_no IS NOT NULL
        AND t.txn_date >= (($1::date)::timestamp AT TIME ZONE 'Asia/Kolkata')
        AND t.txn_date <  ((($1::date) + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')
        ${wardClause}
      ORDER BY t.txn_date, t.receipt_no`,
    params,
  );
  // Field visits (photos, Aadhaar) of these holdings, newest first. Photo columns only say whether a photo is on file.
  const holdingNos = [...new Set(rows.map((r) => r.holding_no))];
  const fieldVisits: Record<string, FieldVisitSummary[]> = {};
  if (holdingNos.length) {
    const { rows: visits } = await pool.query<FieldVisitSummary>(
      `SELECT id, holding_no, captured_by_display_name, captured_by_role, captured_at, gps_lat, gps_lng,
              CASE WHEN aadhaar_number IS NULL THEN NULL ELSE 'XXXX XXXX ' || RIGHT(aadhaar_number, 4) END AS aadhaar_number,
              CASE WHEN holding_photo_path IS NULL THEN NULL ELSE 'on-file' END AS holding_photo_path,
              CASE WHEN aadhaar_photo_path IS NULL THEN NULL ELSE 'on-file' END AS aadhaar_photo_path,
              CASE WHEN previous_receipt_photo_path IS NULL THEN NULL ELSE 'on-file' END AS previous_receipt_photo_path,
              CASE WHEN land_document_photo_path IS NULL THEN NULL ELSE 'on-file' END AS land_document_photo_path,
              CASE WHEN register_photo_path IS NULL THEN NULL ELSE 'on-file' END AS register_photo_path
         FROM property_field_verifications WHERE holding_no = ANY($1::varchar[])
        ORDER BY captured_at DESC`,
      [holdingNos],
    );
    for (const v of visits) (fieldVisits[v.holding_no] ??= []).push(v);
  }
  const valid = rows.filter((r) => !r.cancelled);
  return {
    date,
    rows,
    holdings: new Set(valid.map((r) => r.holding_no)).size,
    receipts: valid.length,
    total: valid.reduce((s, r) => s + Number(r.amount), 0),
    fieldVisits,
  };
}
