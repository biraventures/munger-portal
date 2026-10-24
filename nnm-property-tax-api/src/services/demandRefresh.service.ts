import path from "node:path";
import { fork } from "node:child_process";
import { pool } from "../config/db";
import { ApiError } from "../utils/ApiError";

/**
 * Monthly demand refresh: regenerates the demand notice of every holding with dues that has no live notice from the
 * current month (late fee grows each month, so last month's amount is stale). The work itself is
 * bulkGenerateMissingDemandNotices(); this module runs it as a background job - never inside a web request (a
 * request that long is cut off by nginx with a 504) - and on a schedule:
 *
 *   1st of every month, from 00:10 IST; if the server was down then, as soon as it is back up, until 05:00 IST.
 *
 * The job runs in its own Node process pinned to Asia/Kolkata (TZ), so the notice date and the month used for the late
 * fee are Indian dates even if the server clock is UTC (at 00:10 IST a UTC server is still on the previous day).
 * One run at a time: the job holds a Postgres advisory lock for its whole run.
 */

export const REFRESH_LOCK: [number, number] = [8842, 1]; // pg advisory lock key (classid, objid)
const START_MINUTE_IST = 10; // 00:10
const END_MINUTE_IST = 5 * 60; // 05:00
const RETRY_GAP_MINUTES = 10;

export interface IstNow {
  month: string; // YYYY-MM
  day: number;
  minuteOfDay: number;
}

export function istNow(at: Date = new Date()): IstNow {
  const d = new Date(at.getTime() + 5.5 * 3600 * 1000); // read with UTC getters = Indian wall-clock time
  return {
    month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
    day: d.getUTCDate(),
    minuteOfDay: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}

/** Is a refresh job running right now (someone holds the lock)? */
export async function refreshRunning(): Promise<boolean> {
  const { rows } = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND classid = $1 AND objid = $2 AND granted`,
    REFRESH_LOCK,
  );
  return (rows[0]?.n ?? 0) > 0;
}

/** Starts the job in a separate process (returns at once). */
export function launchRefresh(trigger: "schedule" | "manual", startedBy: string): void {
  const ext = path.extname(__filename); // .js when built, .ts under tsx in development
  const child = fork(path.join(__dirname, "..", "jobs", `demandRefresh.job${ext}`), [trigger, startedBy], {
    env: { ...process.env, TZ: "Asia/Kolkata" },
    execArgv: process.execArgv,
    stdio: "inherit",
  });
  child.on("error", (err) => console.error("[demand-refresh] could not start the job:", err));
  child.on("exit", (code) => {
    if (code) console.error(`[demand-refresh] job exited with code ${code}`);
  });
}

/** Started by hand from the Bulk Demand Notice page. */
export async function startManualRefresh(startedBy: string): Promise<void> {
  if (await refreshRunning()) throw new ApiError(409, "A demand refresh is already running - its progress is shown below.");
  launchRefresh("manual", startedBy);
}

/** Called every minute by the API server: starts this month's automatic run inside the 00:10-05:00 IST window on the 1st. */
export async function scheduledRefreshTick(now: Date = new Date()): Promise<"started" | "skipped"> {
  const ist = istNow(now);
  if (ist.day !== 1 || ist.minuteOfDay < START_MINUTE_IST || ist.minuteOfDay >= END_MINUTE_IST) return "skipped";
  const { rows } = await pool.query<{ done: boolean; recent: boolean }>(
    `SELECT bool_or(status = 'completed') AS done,
            bool_or(started_at > now() - make_interval(mins => $2)) AS recent
       FROM demand_refresh_runs WHERE run_month = $1 AND trigger = 'schedule'`,
    [ist.month, RETRY_GAP_MINUTES],
  );
  if (rows[0]?.done || rows[0]?.recent) return "skipped";
  if (await refreshRunning()) return "skipped";
  launchRefresh("schedule", "System (Monthly Refresh)");
  return "started";
}

export async function listRefreshRuns(limit = 12) {
  const { rows } = await pool.query(
    `SELECT id, run_month, trigger, started_by, status, started_at, finished_at, total, processed, failed, errors, message
       FROM demand_refresh_runs ORDER BY started_at DESC LIMIT $1`,
    [limit],
  );
  const ist = istNow();
  const { rows: thisMonth } = await pool.query<{ done: boolean }>(
    `SELECT bool_or(status = 'completed') AS done FROM demand_refresh_runs WHERE run_month = $1`,
    [ist.month],
  );
  return { runs: rows, running: await refreshRunning(), currentMonth: ist.month, currentMonthDone: !!thisMonth[0]?.done };
}
