import { pool } from "../config/db";
import { csvRow } from "../utils/csv";

export type StreetlightReportKind = "ward-wise" | "street-wise" | "agency-wise" | "light-wise";
export const STREETLIGHT_REPORT_KINDS: StreetlightReportKind[] = ["ward-wise", "street-wise", "agency-wise", "light-wise"];

/** One generic table shape, so the on-screen preview and the CSV download are built from exactly the same data. */
export interface StreetlightReportTable {
  title: string;
  columns: string[];
  rows: (string | number)[][];
  totals: (string | number)[];
  generatedOn: string;
}

/**
 * A light is non-functional if it has an open fault OR its switch
 * status has been set to "Not working" - either one marks it down, in
 * every report below, so the per-light list and the summary counts
 * always agree. Faults are deduplicated per light, so a light with
 * two open faults still counts once. Deleted and deactivated lights
 * are left out entirely.
 *
 * Note this is deliberately a little wider than the status
 * dashboard's own count, which looks at open faults only: a light
 * whose switch status was set to "Not working" without a fault being
 * raised shows as non-functional here.
 */
const OPEN_FAULTS_CTE = `
  open_faults AS (
    SELECT light_id, bool_or(deadline_at < now()) AS overdue, MIN(reported_at) AS since
    FROM light_faults
    WHERE status = 'open' AND light_id IS NOT NULL
    GROUP BY light_id
  )`;

/** SQL predicate for "this light (l) is currently non-functional" - needs l and open_faults f in scope. */
const DOWN = `(f.light_id IS NOT NULL OR l.switch_status = 'not_working')`;

const SWITCH_LABEL: Record<string, string> = { working: "Working", not_working: "Not working", automatic: "Automatic", joint: "Joint" };

const ACTIVE_LIGHT = `l.active = TRUE AND l.deleted_at IS NULL`;

function todayIst(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function sumColumns(rows: (string | number)[][], from: number): (string | number)[] {
  const out: (string | number)[] = [];
  for (let c = from; c < (rows[0]?.length ?? 0); c++) {
    out.push(rows.reduce((acc, r) => acc + Number(r[c] ?? 0), 0));
  }
  return out;
}

async function wardWise(): Promise<StreetlightReportTable> {
  const { rows } = await pool.query<{
    ward_name: string;
    sl_total: number;
    sl_not_working: number;
    hm_total: number;
    hm_not_working: number;
  }>(
    `WITH ${OPEN_FAULTS_CTE}
     SELECT w.ward_name,
       COUNT(l.id) FILTER (WHERE l.light_type = 'streetlight')::int AS sl_total,
       COUNT(l.id) FILTER (WHERE l.light_type = 'streetlight' AND ${DOWN})::int AS sl_not_working,
       COUNT(l.id) FILTER (WHERE l.light_type = 'high_mast')::int AS hm_total,
       COUNT(l.id) FILTER (WHERE l.light_type = 'high_mast' AND ${DOWN})::int AS hm_not_working
     FROM attendance_wards w
     LEFT JOIN lights l ON l.ward_id = w.id AND ${ACTIVE_LIGHT}
     LEFT JOIN open_faults f ON f.light_id = l.id
     GROUP BY w.id, w.ward_name
     HAVING COUNT(l.id) > 0
     ORDER BY NULLIF(regexp_replace(w.ward_name, '[^0-9]', '', 'g'), '')::int NULLS LAST, w.ward_name`,
  );

  const body = rows.map((r) => [
    r.ward_name,
    r.sl_total,
    r.sl_total - r.sl_not_working,
    r.sl_not_working,
    r.hm_total,
    r.hm_total - r.hm_not_working,
    r.hm_not_working,
    r.sl_total + r.hm_total,
    r.sl_total + r.hm_total - r.sl_not_working - r.hm_not_working,
    r.sl_not_working + r.hm_not_working,
  ]);
  return {
    title: "Ward-wise Street Light Report",
    columns: [
      "Ward",
      "Street lights - Total",
      "Street lights - Working",
      "Street lights - Not working",
      "High mast - Total",
      "High mast - Working",
      "High mast - Not working",
      "All lights - Total",
      "All lights - Working",
      "All lights - Not working",
    ],
    rows: body,
    totals: ["TOTAL", ...sumColumns(body, 1)],
    generatedOn: todayIst(),
  };
}

async function streetWise(): Promise<StreetlightReportTable> {
  const { rows } = await pool.query<{
    ward_name: string;
    start_point: string;
    intermediate_point: string | null;
    end_point: string | null;
    agency_name: string | null;
    total: number;
    not_working: number;
  }>(
    `WITH ${OPEN_FAULTS_CTE}
     SELECT w.ward_name, ss.start_point, ss.intermediate_point, ss.end_point, ia.agency_name,
       COUNT(l.id)::int AS total,
       COUNT(l.id) FILTER (WHERE ${DOWN})::int AS not_working
     FROM street_segments ss
     JOIN attendance_wards w ON w.id = ss.ward_id
     LEFT JOIN installation_agencies ia ON ia.id = ss.installation_agency_id
     LEFT JOIN lights l ON l.segment_id = ss.id AND ${ACTIVE_LIGHT}
     LEFT JOIN open_faults f ON f.light_id = l.id
     GROUP BY ss.id, w.ward_name, ss.start_point, ss.intermediate_point, ss.end_point, ia.agency_name
     ORDER BY NULLIF(regexp_replace(w.ward_name, '[^0-9]', '', 'g'), '')::int NULLS LAST, w.ward_name, ss.start_point, ss.id`,
  );

  const body = rows.map((r) => [
    r.ward_name,
    r.start_point,
    r.intermediate_point ?? "",
    r.end_point ?? "",
    r.agency_name ?? "",
    r.total,
    r.total - r.not_working,
    r.not_working,
  ]);
  return {
    title: "Street-wise Street Light Report",
    columns: ["Ward", "Start point", "Intermediate point", "End point", "Installation agency", "Total lights", "Working", "Not working"],
    rows: body,
    totals: ["TOTAL", "", "", "", "", ...sumColumns(body, 5)],
    generatedOn: todayIst(),
  };
}

async function agencyWise(): Promise<StreetlightReportTable> {
  const { rows } = await pool.query<{
    agency_name: string;
    wards_covered: number;
    sl_total: number;
    sl_not_working: number;
    hm_total: number;
    hm_not_working: number;
    overdue: number;
  }>(
    `WITH ${OPEN_FAULTS_CTE}
     SELECT COALESCE(ia.agency_name, '(Agency not recorded)') AS agency_name,
       COUNT(DISTINCT l.ward_id)::int AS wards_covered,
       COUNT(l.id) FILTER (WHERE l.light_type = 'streetlight')::int AS sl_total,
       COUNT(l.id) FILTER (WHERE l.light_type = 'streetlight' AND ${DOWN})::int AS sl_not_working,
       COUNT(l.id) FILTER (WHERE l.light_type = 'high_mast')::int AS hm_total,
       COUNT(l.id) FILTER (WHERE l.light_type = 'high_mast' AND ${DOWN})::int AS hm_not_working,
       COUNT(l.id) FILTER (WHERE f.overdue)::int AS overdue
     FROM lights l
     LEFT JOIN installation_agencies ia ON ia.id = l.installation_agency_id
     LEFT JOIN open_faults f ON f.light_id = l.id
     WHERE ${ACTIVE_LIGHT}
     GROUP BY ia.id, ia.agency_name
     ORDER BY (ia.id IS NULL), ia.agency_name`,
  );

  const body = rows.map((r) => [
    r.agency_name,
    r.wards_covered,
    r.sl_total,
    r.sl_total - r.sl_not_working,
    r.sl_not_working,
    r.hm_total,
    r.hm_total - r.hm_not_working,
    r.hm_not_working,
    r.sl_total + r.hm_total,
    r.sl_total + r.hm_total - r.sl_not_working - r.hm_not_working,
    r.sl_not_working + r.hm_not_working,
    r.overdue,
  ]);
  const totals = ["TOTAL", "", ...sumColumns(body, 2)];
  return {
    title: "Agency-wise Street Light Report",
    columns: [
      "Installation agency",
      "Wards covered",
      "Street lights - Total",
      "Street lights - Working",
      "Street lights - Not working",
      "High mast - Total",
      "High mast - Working",
      "High mast - Not working",
      "All lights - Total",
      "All lights - Working",
      "All lights - Not working",
      "Faults past repair deadline",
    ],
    rows: body,
    totals,
    generatedOn: todayIst(),
  };
}

async function lightWise(): Promise<StreetlightReportTable> {
  const { rows } = await pool.query<{
    ward_name: string;
    place: string | null;
    light_type: "streetlight" | "high_mast";
    serial_number: string;
    agency_name: string | null;
    switch_status: string | null;
    fault_since: string | null;
    down: boolean;
  }>(
    `WITH ${OPEN_FAULTS_CTE}
     SELECT w.ward_name,
       CASE WHEN ss.id IS NOT NULL
         THEN ss.start_point || COALESCE(' - ' || ss.end_point, '')
         ELSE l.locality_name END AS place,
       l.light_type, l.serial_number, ia.agency_name, l.switch_status,
       to_char(f.since AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS fault_since,
       ${DOWN} AS down
     FROM lights l
     JOIN attendance_wards w ON w.id = l.ward_id
     LEFT JOIN street_segments ss ON ss.id = l.segment_id
     LEFT JOIN installation_agencies ia ON ia.id = l.installation_agency_id
     LEFT JOIN open_faults f ON f.light_id = l.id
     WHERE ${ACTIVE_LIGHT}
     ORDER BY NULLIF(regexp_replace(w.ward_name, '[^0-9]', '', 'g'), '')::int NULLS LAST, w.ward_name,
       (l.light_type = 'high_mast'), place, l.light_serial_seq NULLS LAST, l.light_serial_suffix NULLS FIRST, l.serial_number`,
  );

  const body = rows.map((r) => [
    r.ward_name,
    r.place ?? "",
    r.light_type === "high_mast" ? "High mast" : "Street light",
    r.serial_number,
    r.agency_name ?? "",
    r.switch_status ? (SWITCH_LABEL[r.switch_status] ?? r.switch_status) : "",
    r.fault_since ?? "",
    r.down ? "Non-functional" : "Functional",
  ]);
  const nonFunctional = rows.filter((r) => r.down).length;
  return {
    title: "Light-wise Street Light Report",
    columns: ["Ward", "Street / location", "Light type", "Serial number", "Installation agency", "Switch status", "Open fault since", "Functional status"],
    rows: body,
    totals: [`TOTAL: ${rows.length} lights`, "", "", "", "", "", "", `${rows.length - nonFunctional} functional, ${nonFunctional} non-functional`],
    generatedOn: todayIst(),
  };
}

export async function buildStreetlightReport(kind: StreetlightReportKind): Promise<StreetlightReportTable> {
  if (kind === "ward-wise") return wardWise();
  if (kind === "street-wise") return streetWise();
  if (kind === "agency-wise") return agencyWise();
  return lightWise();
}

/** UTF-8 with a byte-order mark, so Excel opens ward/street names in Hindi correctly instead of garbling them. */
export function streetlightReportToCsv(table: StreetlightReportTable): string {
  const lines = [csvRow([table.title]), csvRow([`As on ${table.generatedOn}`]), "", csvRow(table.columns)];
  for (const r of table.rows) lines.push(csvRow(r));
  if (table.rows.length > 0) lines.push(csvRow(table.totals));
  return "﻿" + lines.join("\r\n") + "\r\n";
}
