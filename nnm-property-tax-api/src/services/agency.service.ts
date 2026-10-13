import { pool } from "../config/db";
import { ApiError } from "../utils/ApiError";
import { generateDemandNotice, getDemandNoticeForReprint } from "./demandNotice.service";

// ---------------------------------------------------------------------------
// Agency Project Manager reports
// ---------------------------------------------------------------------------

export type ReportPeriod = "daily" | "weekly" | "monthly" | "annual";

export interface ReportFilters {
  period: ReportPeriod;
  /** Inclusive, YYYY-MM-DD, Indian calendar dates. */
  from: string;
  to: string;
  ward?: string;
  /** Tax Collector login username. */
  collector?: string;
  /** When set, the report covers only these wards (a Tax Collector sees just their assigned wards). */
  wardScope?: string[];
}

interface Tally {
  count: number;
  amount: number;
  count2: number;
}

export interface SeriesPoint extends Tally {
  bucket: string;
}
export interface WardRow extends Tally {
  ward: string;
}
export interface CollectorRow extends Tally {
  username: string | null;
  name: string;
}
export interface DatasetReport {
  total: Tally;
  series: SeriesPoint[];
  byWard: WardRow[];
  byCollector: CollectorRow[];
  byType?: { type: string; count: number }[];
}

interface DatasetConfig {
  from: string;
  where: string;
  ts: string;
  ward: string;
  /** SQL for the Tax Collector's login username, or null when the dataset has no collector dimension. */
  collUser: string | null;
  collName: string;
  amount?: string;
  /** Second count, e.g. open flags or notices already delivered. */
  count2?: string;
  typeExpr?: string;
  fillWards: boolean;
  fillCollectors: boolean;
}

function bucketSql(period: ReportPeriod, tsExpr: string): string {
  const t = `(${tsExpr} AT TIME ZONE 'Asia/Kolkata')`;
  switch (period) {
    case "daily":
      return `to_char(${t}, 'YYYY-MM-DD')`;
    case "weekly":
      return `to_char(date_trunc('week', ${t}), 'YYYY-MM-DD')`;
    case "monthly":
      return `to_char(${t}, 'YYYY-MM')`;
    case "annual": {
      const fy = `to_char(${t} - interval '3 months', 'YYYY')`;
      return `(${fy} || '-' || lpad((((${fy})::int + 1) % 100)::text, 2, '0'))`;
    }
  }
}

function compareWards(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return a.localeCompare(b);
}

/** Indian calendar date (YYYY-MM-DD) for "now" shifted by `daysBack`. */
export function indianDate(daysBack = 0): string {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000 - daysBack * 86400 * 1000);
  return ist.toISOString().slice(0, 10);
}

export function defaultRangeFor(period: ReportPeriod): { from: string; to: string } {
  const days = period === "daily" ? 29 : period === "weekly" ? 83 : period === "monthly" ? 364 : 365 * 5 - 1;
  return { from: indianDate(days), to: indianDate(0) };
}

async function runDataset(cfg: DatasetConfig, f: ReportFilters, allWards: string[], allCollectors: { username: string; name: string }[]): Promise<DatasetReport> {
  const params: unknown[] = [f.from, f.to];
  let filterSql = "";
  if (f.ward) {
    params.push(f.ward);
    filterSql += ` AND ${cfg.ward} = $${params.length}`;
  }
  if (f.wardScope) {
    params.push(f.wardScope);
    filterSql += ` AND ${cfg.ward} = ANY($${params.length}::text[])`;
  }
  if (f.collector) {
    if (!cfg.collUser) {
      // A collector filter makes no sense for a dataset without that dimension.
      return { total: { count: 0, amount: 0, count2: 0 }, series: [], byWard: [], byCollector: [] };
    }
    params.push(f.collector);
    filterSql += ` AND ${cfg.collUser} = $${params.length}`;
  }

  const sql = `
    SELECT ${bucketSql(f.period, cfg.ts)} AS bucket,
           ${cfg.ward} AS ward,
           ${cfg.collUser ?? "NULL::text"} AS coll_user,
           ${cfg.collUser ? cfg.collName : "NULL::text"} AS coll_name,
           ${cfg.typeExpr ?? "NULL::text"} AS type,
           COUNT(*)::int AS n,
           ${cfg.amount ? `COALESCE(SUM(${cfg.amount}), 0)::float8` : "0::float8"} AS amt,
           ${cfg.count2 ? `(COUNT(*) FILTER (WHERE ${cfg.count2}))::int` : "0"} AS n2
      FROM ${cfg.from}
     WHERE ${cfg.where}
       AND ${cfg.ts} >= (($1::date)::timestamp AT TIME ZONE 'Asia/Kolkata')
       AND ${cfg.ts} <  ((($2::date) + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')
       ${filterSql}
     GROUP BY 1, 2, 3, 4, 5`;

  const { rows } = await pool.query<{ bucket: string; ward: string | null; coll_user: string | null; coll_name: string | null; type: string | null; n: number; amt: number; n2: number }>(sql, params);

  const total: Tally = { count: 0, amount: 0, count2: 0 };
  const series = new Map<string, SeriesPoint>();
  const wards = new Map<string, WardRow>();
  const collectors = new Map<string, CollectorRow>();
  const types = new Map<string, number>();

  const add = (t: Tally, r: { n: number; amt: number; n2: number }) => {
    t.count += r.n;
    t.amount += r.amt;
    t.count2 += r.n2;
  };

  for (const r of rows) {
    add(total, r);
    if (!series.has(r.bucket)) series.set(r.bucket, { bucket: r.bucket, count: 0, amount: 0, count2: 0 });
    add(series.get(r.bucket)!, r);

    const wardKey = r.ward?.trim() ? r.ward.trim() : "(no ward)";
    if (!wards.has(wardKey)) wards.set(wardKey, { ward: wardKey, count: 0, amount: 0, count2: 0 });
    add(wards.get(wardKey)!, r);

    if (cfg.collUser) {
      const key = r.coll_user ?? "";
      if (!collectors.has(key)) collectors.set(key, { username: r.coll_user, name: r.coll_user ? (r.coll_name ?? r.coll_user) : "Not attributed to a collector", count: 0, amount: 0, count2: 0 });
      add(collectors.get(key)!, r);
    }
    if (cfg.typeExpr && r.type) types.set(r.type, (types.get(r.type) ?? 0) + r.n);
  }

  if (cfg.fillWards && !f.ward) {
    for (const w of allWards) if (!wards.has(w)) wards.set(w, { ward: w, count: 0, amount: 0, count2: 0 });
  }
  if (cfg.fillCollectors && cfg.collUser && !f.collector) {
    for (const c of allCollectors) if (!collectors.has(c.username)) collectors.set(c.username, { username: c.username, name: c.name, count: 0, amount: 0, count2: 0 });
  }

  return {
    total,
    series: [...series.values()].sort((a, b) => a.bucket.localeCompare(b.bucket)),
    byWard: [...wards.values()].sort((a, b) => compareWards(a.ward, b.ward)),
    byCollector: [...collectors.values()].sort((a, b) => a.name.localeCompare(b.name)),
    ...(cfg.typeExpr ? { byType: [...types.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count) } : {}),
  };
}

export async function listReportFilterOptions(wardScope?: string[]): Promise<{ wards: string[]; collectors: { username: string; name: string; code: string | null }[] }> {
  const [w, c] = await Promise.all([
    pool.query<{ ward: string }>(`SELECT DISTINCT btrim(ward) AS ward FROM properties WHERE ward IS NOT NULL AND btrim(ward) <> ''`),
    pool.query<{ username: string; display_name: string; tax_collector_code: string | null }>(
      `SELECT username, display_name, tax_collector_code FROM admins WHERE role = 'tax_collector' AND active = TRUE ORDER BY display_name`,
    ),
  ]);
  let wards = w.rows.map((r) => r.ward);
  let collectors = c.rows.map((r) => ({ username: r.username, name: r.display_name, code: r.tax_collector_code }));
  if (wardScope) {
    // Only the viewer's own wards, and only the collectors who work in them.
    wards = wards.filter((x) => wardScope.includes(x));
    const { rows } = await pool.query<{ tax_collector_username: string }>(
      `SELECT DISTINCT tax_collector_username FROM tax_collector_login_wards WHERE ward = ANY($1::text[])`,
      [wardScope],
    );
    const inScope = new Set(rows.map((r) => r.tax_collector_username));
    collectors = collectors.filter((x) => inScope.has(x.username));
  }
  return { wards: wards.sort(compareWards), collectors };
}

export interface AgencyReport {
  filters: ReportFilters;
  collection: DatasetReport;
  noticesGenerated: DatasetReport;
  receivingCopies: DatasetReport;
  resurveyFlags: DatasetReport;
  newHouses: DatasetReport;
  collectionIssues: DatasetReport;
  ranking: {
    highestWards: WardRow[];
    lowestWards: WardRow[];
    highestCollectors: CollectorRow[];
    lowestCollectors: CollectorRow[];
  };
}

export async function buildAgencyReport(f: ReportFilters): Promise<AgencyReport> {
  const { wards, collectors } = await listReportFilterOptions(f.wardScope);
  const collList = collectors.map((c) => ({ username: c.username, name: c.name }));

  const configs: Record<string, DatasetConfig> = {
    collection: {
      from: `transactions t
             JOIN properties p ON p.holding_no = t.holding_no
             LEFT JOIN admins a ON a.tax_collector_code = t.tax_collector_code AND a.role = 'tax_collector'`,
      where: `t.status = 'success' AND t.cancelled = FALSE AND t.receipt_no IS NOT NULL`,
      ts: "t.txn_date",
      ward: "btrim(p.ward)",
      collUser: "COALESCE(a.username, t.tax_collector_code)",
      collName: "COALESCE(a.display_name, t.tax_collector_name, t.tax_collector_code)",
      amount: "t.amount_received",
      fillWards: true,
      fillCollectors: true,
    },
    noticesGenerated: {
      from: `demand_notices d JOIN properties p ON p.holding_no = d.holding_no`,
      where: `d.cancelled = FALSE`,
      ts: "d.notice_date",
      ward: "btrim(p.ward)",
      collUser: null,
      collName: "",
      amount: "d.total_amount_demanded",
      // Delivered = at least one signed receiving copy has been uploaded for the notice.
      count2: `EXISTS (SELECT 1 FROM demand_notice_receiving_copies c WHERE c.demand_no = d.demand_no)`,
      fillWards: true,
      fillCollectors: false,
    },
    receivingCopies: {
      from: `demand_notice_receiving_copies c
             JOIN demand_notices d ON d.demand_no = c.demand_no
             JOIN properties p ON p.holding_no = d.holding_no
             LEFT JOIN admins a ON a.username = c.uploaded_by_username`,
      where: "TRUE",
      ts: "c.uploaded_at",
      ward: "btrim(p.ward)",
      collUser: "COALESCE(a.username, c.uploaded_by_username)",
      collName: "COALESCE(a.display_name, c.uploaded_by_display_name)",
      fillWards: true,
      fillCollectors: true,
    },
    resurveyFlags: {
      from: `property_resurvey_flags f
             JOIN properties p ON p.holding_no = f.holding_no
             LEFT JOIN admins a ON a.username = f.flagged_by_username`,
      where: "TRUE",
      ts: "f.flagged_at",
      ward: "btrim(p.ward)",
      collUser: "COALESCE(a.username, f.flagged_by_username)",
      collName: "COALESCE(a.display_name, f.flagged_by_display_name)",
      count2: "f.status = 'open'",
      fillWards: false,
      fillCollectors: true,
    },
    newHouses: {
      from: `unsurveyed_houses u LEFT JOIN admins a ON a.username = u.recorded_by_username`,
      where: "TRUE",
      ts: "u.recorded_at",
      ward: "btrim(u.ward)",
      collUser: "COALESCE(a.username, u.recorded_by_username)",
      collName: "COALESCE(a.display_name, u.recorded_by_display_name)",
      fillWards: false,
      fillCollectors: true,
    },
    collectionIssues: {
      from: `collection_issues ci
             JOIN properties p ON p.holding_no = ci.holding_no
             LEFT JOIN admins a ON a.username = ci.reported_by_username`,
      where: "TRUE",
      ts: "ci.reported_at",
      ward: "btrim(p.ward)",
      collUser: "COALESCE(a.username, ci.reported_by_username)",
      collName: "COALESCE(a.display_name, ci.reported_by_display_name)",
      typeExpr: "ci.issue_type",
      fillWards: false,
      fillCollectors: true,
    },
  };

  const [collection, noticesGenerated, receivingCopies, resurveyFlags, newHouses, collectionIssues] = await Promise.all(
    ["collection", "noticesGenerated", "receivingCopies", "resurveyFlags", "newHouses", "collectionIssues"].map((k) => runDataset(configs[k]!, f, wards, collList)),
  );

  const wardsByAmount = [...collection!.byWard].filter((w) => w.ward !== "(no ward)").sort((a, b) => b.amount - a.amount || compareWards(a.ward, b.ward));
  const collsByAmount = [...collection!.byCollector].filter((c) => c.username !== null).sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));

  return {
    filters: f,
    collection: collection!,
    noticesGenerated: noticesGenerated!,
    receivingCopies: receivingCopies!,
    resurveyFlags: resurveyFlags!,
    newHouses: newHouses!,
    collectionIssues: collectionIssues!,
    ranking: {
      highestWards: wardsByAmount.slice(0, 5),
      lowestWards: [...wardsByAmount].reverse().slice(0, 5),
      highestCollectors: collsByAmount.slice(0, 5),
      lowestCollectors: [...collsByAmount].reverse().slice(0, 5),
    },
  };
}

// ---------------------------------------------------------------------------
// Agency Team Leader: ward-wise demand notices for holdings with dues pending
// ---------------------------------------------------------------------------

/** A holding with something to pay: has floors, not disputed, tax paid only till an earlier year than its assessment year. */
const PENDING_HOLDING_SQL = `
  FROM properties p
  WHERE NOT COALESCE(p.is_disputed, FALSE)
    AND EXISTS (SELECT 1 FROM floors f WHERE f.holding_no = p.holding_no)
    AND (p.tax_paid_till_year IS NULL OR p.tax_paid_till_year < p.assessment_year)`;

/** A full-dues notice for the current Indian calendar month that is still live. */
const CURRENT_MONTH_LIVE_NOTICE_SQL = `
  SELECT d.demand_no FROM demand_notices d
   WHERE d.holding_no = $1 AND d.superseded = FALSE AND d.cancelled = FALSE AND d.settled = FALSE
     AND COALESCE(d.part_payment, FALSE) = FALSE
     AND d.notice_date >= (date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata')
   ORDER BY d.notice_date DESC LIMIT 1`;

export async function listWardsWithPendingHoldings(): Promise<{ ward: string; pending: number }[]> {
  const { rows } = await pool.query<{ ward: string | null; pending: number }>(
    `SELECT btrim(p.ward) AS ward, COUNT(*)::int AS pending ${PENDING_HOLDING_SQL} GROUP BY 1`,
  );
  return rows
    .map((r) => ({ ward: r.ward && r.ward !== "" ? r.ward : "(no ward)", pending: r.pending }))
    .sort((a, b) => compareWards(a.ward, b.ward));
}

export async function listPendingHoldingNos(ward: string): Promise<string[]> {
  const wardClause = ward === "(no ward)" ? `(p.ward IS NULL OR btrim(p.ward) = '')` : `btrim(p.ward) = $1`;
  const { rows } = await pool.query<{ holding_no: string }>(
    `SELECT p.holding_no ${PENDING_HOLDING_SQL} AND ${wardClause} ORDER BY p.holding_no`,
    ward === "(no ward)" ? [] : [ward],
  );
  return rows.map((r) => r.holding_no);
}

export interface PreparedNotices {
  notices: Awaited<ReturnType<typeof getDemandNoticeForReprint>>[];
  errors: { holdingNo: string; message: string }[];
}

/**
 * For up to 25 holdings: makes sure each still-pending holding has a live
 * full-dues notice for the current month (re-using this month's notice
 * when one exists, otherwise generating a fresh one so the late fee is
 * current), and returns the notices ready to print.
 */
export async function prepareNoticesForPrint(holdingNos: string[], generatedBy: string): Promise<PreparedNotices> {
  if (holdingNos.length === 0 || holdingNos.length > 25) throw ApiError.badRequest("Send between 1 and 25 holdings at a time.");
  const { rows: stillPending } = await pool.query<{ holding_no: string }>(`SELECT p.holding_no ${PENDING_HOLDING_SQL} AND p.holding_no = ANY($1::text[])`, [holdingNos]);
  const pendingSet = new Set(stillPending.map((r) => r.holding_no));

  const result: PreparedNotices = { notices: [], errors: [] };
  for (const holdingNo of holdingNos) {
    if (!pendingSet.has(holdingNo)) {
      result.errors.push({ holdingNo, message: "No dues pending (or disputed / no floor data) - skipped." });
      continue;
    }
    try {
      const existing = await pool.query<{ demand_no: string }>(CURRENT_MONTH_LIVE_NOTICE_SQL, [holdingNo]);
      const demandNo = existing.rows[0]?.demand_no ?? (await generateDemandNotice(holdingNo, generatedBy)).demandNo;
      result.notices.push(await getDemandNoticeForReprint(demandNo));
    } catch (err) {
      result.errors.push({ holdingNo, message: err instanceof Error ? err.message : String(err) });
    }
  }
  return result;
}
