import { pool } from "../config/db";

/**
 * Notices report for the Agency Team Leader / Project Manager (and senior officers): for a date or a period,
 * ward-wise and Tax Collector-wise -
 *   - property tax demand notices SERVED: the signed receiving copy uploaded by the Tax Collector (the date served is
 *     the upload date; the collector is the one who uploaded it), with the notices generated in the period alongside;
 *   - trade licence notices ISSUED (first / second notice from the Tax Collector's field survey);
 *   - trade licence APPLICATIONS received: one that came in against a Tax Collector's notice is credited to him (his
 *     collection); every other is an automatic application, credited to no one (tradeLicenseCredit.service.ts).
 * All dates are Indian calendar dates.
 */

export interface NoticeReportFilters {
  from: string;
  to: string;
  ward?: string;
  collector?: string;
}

export interface Breakdown {
  total: number;
  amount: number;
  byDay: { day: string; count: number; amount: number }[];
  byWard: { ward: string; count: number; amount: number; extra: number }[];
  byCollector: { username: string | null; name: string; count: number; amount: number }[];
  /** Collector x day counts, for the day-by-day table. */
  byCollectorDay: { username: string | null; day: string; count: number }[];
  /** A dataset-specific split (notice level, application status, channel). */
  split: { label: string; count: number }[];
  rows: Record<string, unknown>[];
  /** True when the list was cut at ROW_LIMIT (the totals above are still complete). */
  truncated: boolean;
}

const ROW_LIMIT = 5000;
const IST = (ts: string) => `(${ts} AT TIME ZONE 'Asia/Kolkata')`;
const dayOf = (ts: string) => `to_char(${IST(ts)}, 'YYYY-MM-DD')`;
const inRange = (ts: string) =>
  `${ts} >= (($1::date)::timestamp AT TIME ZONE 'Asia/Kolkata') AND ${ts} < ((($2::date) + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')`;

const wardSort = (a: string, b: string) => {
  const na = Number(a);
  const nb = Number(b);
  return !Number.isNaN(na) && !Number.isNaN(nb) ? na - nb : a.localeCompare(b);
};

interface Spec {
  /** Base: FROM ... WHERE (the period condition included) - aliases: ward, coll_user, coll_name, day, amount, split. */
  base: string;
  extraParams?: unknown[];
  /** Columns for the detail list (selected from the same base). */
  listCols: string;
  listOrder: string;
  /** Count for byWard.extra (e.g. notices generated in the period - a separate query). */
  extraByWard?: { sql: string };
  /** How the rows credited to no Tax Collector are named. */
  unattributed?: string;
}

async function run(spec: Spec, f: NoticeReportFilters): Promise<Breakdown> {
  const params: unknown[] = [f.from, f.to, ...(spec.extraParams ?? [])];
  const conds: string[] = [];
  if (f.ward) {
    params.push(f.ward);
    conds.push(`ward = $${params.length}`);
  }
  if (f.collector) {
    params.push(f.collector);
    conds.push(`coll_user = $${params.length}`);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const src = `(${spec.base}) x ${where}`;

  const [agg, list, extra] = await Promise.all([
    pool.query<{
      day: string;
      ward: string | null;
      coll_user: string | null;
      coll_name: string | null;
      split: string | null;
      n: number;
      amt: number;
    }>(
      `SELECT day, ward, coll_user, coll_name, split, COUNT(*)::int AS n, COALESCE(SUM(amount), 0)::float8 AS amt
         FROM ${src} GROUP BY 1, 2, 3, 4, 5`,
      params,
    ),
    pool.query(`SELECT ${spec.listCols} FROM ${src} ORDER BY ${spec.listOrder} LIMIT ${ROW_LIMIT + 1}`, params),
    spec.extraByWard
      ? pool.query<{ ward: string | null; n: number }>(spec.extraByWard.sql, [f.from, f.to, f.ward ?? null])
      : Promise.resolve({ rows: [] as { ward: string | null; n: number }[] }),
  ]);

  const byDay = new Map<string, { day: string; count: number; amount: number }>();
  const byWard = new Map<string, { ward: string; count: number; amount: number; extra: number }>();
  const byColl = new Map<string, { username: string | null; name: string; count: number; amount: number }>();
  const byCollDay = new Map<string, { username: string | null; day: string; count: number }>();
  const split = new Map<string, number>();
  let total = 0;
  let amount = 0;
  for (const r of agg.rows) {
    total += r.n;
    amount += r.amt;
    const d = byDay.get(r.day) ?? { day: r.day, count: 0, amount: 0 };
    d.count += r.n;
    d.amount += r.amt;
    byDay.set(r.day, d);
    const wk = r.ward?.trim() || "(no ward)";
    const w = byWard.get(wk) ?? { ward: wk, count: 0, amount: 0, extra: 0 };
    w.count += r.n;
    w.amount += r.amt;
    byWard.set(wk, w);
    const ck = r.coll_user ?? "";
    const c = byColl.get(ck) ?? {
      username: r.coll_user,
      name: r.coll_name ?? spec.unattributed ?? "Not attributed to a Tax Collector",
      count: 0,
      amount: 0,
    };
    c.count += r.n;
    c.amount += r.amt;
    byColl.set(ck, c);
    const cdk = `${ck}|${r.day}`;
    const cd = byCollDay.get(cdk) ?? { username: r.coll_user, day: r.day, count: 0 };
    cd.count += r.n;
    byCollDay.set(cdk, cd);
    if (r.split) split.set(r.split, (split.get(r.split) ?? 0) + r.n);
  }
  for (const e of extra.rows) {
    const wk = e.ward?.trim() || "(no ward)";
    const w = byWard.get(wk) ?? { ward: wk, count: 0, amount: 0, extra: 0 };
    w.extra += e.n;
    byWard.set(wk, w);
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    total,
    amount: round(amount),
    byDay: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)).map((d) => ({ ...d, amount: round(d.amount) })),
    byWard: [...byWard.values()].sort((a, b) => wardSort(a.ward, b.ward)).map((w) => ({ ...w, amount: round(w.amount) })),
    byCollector: [...byColl.values()]
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .map((c) => ({ ...c, amount: round(c.amount) })),
    byCollectorDay: [...byCollDay.values()],
    split: [...split.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    rows: list.rows.slice(0, ROW_LIMIT),
    truncated: list.rows.length > ROW_LIMIT,
  };
}

/** Demand notices served = receiving copy uploaded. */
const SERVED: Spec = {
  base: `SELECT ${dayOf("c.uploaded_at")} AS day, btrim(p.ward) AS ward,
                COALESCE(a.username, c.uploaded_by_username) AS coll_user,
                COALESCE(a.display_name, c.uploaded_by_display_name) AS coll_name,
                d.total_amount_demanded AS amount,
                CASE WHEN d.settled THEN 'Paid since' WHEN d.cancelled THEN 'Notice cancelled' ELSE 'Not paid yet' END AS split,
                c.id AS copy_id, c.uploaded_at AS served_at, d.demand_no, d.holding_no, d.notice_date,
                COALESCE(p.owner_name, '') AS owner_name, d.settled
           FROM demand_notice_receiving_copies c
           JOIN demand_notices d ON d.demand_no = c.demand_no
           JOIN properties p ON p.holding_no = d.holding_no
           LEFT JOIN admins a ON a.username = c.uploaded_by_username
          WHERE c.copy_no = 1 AND ${inRange("c.uploaded_at")}`,
  listCols: `day, served_at, ward, coll_user, coll_name, demand_no, holding_no, owner_name, notice_date, amount, settled, copy_id`,
  listOrder: `served_at DESC`,
  extraByWard: {
    // Notices generated in the same period, ward-wise, for comparison.
    sql: `SELECT btrim(p.ward) AS ward, COUNT(*)::int AS n
            FROM demand_notices d JOIN properties p ON p.holding_no = d.holding_no
           WHERE d.cancelled = FALSE AND NOT COALESCE(d.wrongly_generated, FALSE) AND ${inRange("d.notice_date")}
             AND ($3::text IS NULL OR btrim(p.ward) = $3)
           GROUP BY 1`,
  },
};

/** Trade licence notices issued (first and second). */
const TL_NOTICES: Spec = {
  base: `SELECT to_char(n.issued_on, 'YYYY-MM-DD') AS day, btrim(p.ward) AS ward,
                COALESCE(a.username, s.recorded_by_username) AS coll_user,
                COALESCE(a.display_name, s.recorded_by_name) AS coll_name,
                0::numeric AS amount,
                CASE n.level WHEN 1 THEN 'First notice' ELSE 'Second notice' END AS split,
                n.id AS notice_id, n.receiving_uploaded_at, n.notice_no, n.level, n.issued_on, n.due_on, s.holding_no, s.business_name, s.person_name, s.phone, s.status, s.latitude, s.longitude
           FROM trade_license_notices n
           JOIN trade_license_surveys s ON s.id = n.survey_id
           LEFT JOIN properties p ON p.holding_no = s.holding_no
           LEFT JOIN admins a ON a.username = s.recorded_by_username
          WHERE n.issued_on BETWEEN $1::date AND $2::date AND n.superseded_at IS NULL`,
  listCols: `day, ward, coll_user, coll_name, notice_id, receiving_uploaded_at, notice_no, level, issued_on, due_on, holding_no, business_name, person_name, phone, status, latitude, longitude`,
  listOrder: `issued_on DESC, notice_no DESC`,
};

/**
 * Trade licence applications received. One brought in by a Tax Collector's notice is credited to him (his
 * collection); any other is an automatic application, credited to no one.
 */
const TL_APPLICATIONS: Spec = {
  base: `SELECT ${dayOf("t.requested_at")} AS day, btrim(p.ward) AS ward,
                CASE WHEN t.source = 'notice' THEN COALESCE(a.username, t.credited_collector_username) END AS coll_user,
                CASE WHEN t.source = 'notice' THEN COALESCE(a.display_name, t.credited_collector_name) END AS coll_name,
                0::numeric AS amount,
                CASE WHEN t.source = 'notice' THEN 'Against a Tax Collector''s notice' ELSE 'Automatic application' END AS split,
                CASE WHEN t.requested_by = t.applicant_name THEN 'Online (citizen)' ELSE 'At the counter' END AS channel,
                t.application_number, t.application_type, t.requested_at, t.requested_by, t.applicant_name, t.entity_name,
                t.holding_no, t.status, t.current_stage, t.source, t.tl_notice_no
           FROM trade_license_applications t
           LEFT JOIN properties p ON p.holding_no = t.holding_no
           LEFT JOIN admins a ON a.username = t.credited_collector_username
          WHERE ${inRange("t.requested_at")}`,
  listCols: `day, ward, coll_user, coll_name, application_number, application_type, requested_at, requested_by, applicant_name, entity_name, holding_no, status, current_stage, split, channel, source, tl_notice_no`,
  listOrder: `requested_at DESC`,
  unattributed: "Automatic applications (no notice)",
};

export interface NoticeReport {
  filters: NoticeReportFilters;
  served: Breakdown;
  tlNotices: Breakdown;
  tlApplications: Breakdown;
  /** Status split of the applications (pending / approved / rejected). */
  applicationStatus: { label: string; count: number }[];
}

export async function buildNoticeReport(f: NoticeReportFilters): Promise<NoticeReport> {
  const [served, tlNotices, tlApplications] = await Promise.all([run(SERVED, f), run(TL_NOTICES, f), run(TL_APPLICATIONS, f)]);
  const statusCount = new Map<string, number>();
  for (const r of tlApplications.rows) statusCount.set(String(r.status), (statusCount.get(String(r.status)) ?? 0) + 1);
  return {
    filters: f,
    served,
    tlNotices,
    tlApplications,
    applicationStatus: [...statusCount.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
  };
}
