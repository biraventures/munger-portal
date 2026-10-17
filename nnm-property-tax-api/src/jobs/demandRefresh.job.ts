/**
 * Monthly demand refresh job - one run of bulk demand notice regeneration, with its progress recorded in
 * demand_refresh_runs. Started by the API (services/demandRefresh.service.ts) in its own process with TZ=Asia/Kolkata,
 * or by hand on the server:
 *
 *   TZ=Asia/Kolkata npm run demand-refresh
 *
 * Holds an advisory lock for the whole run, so a second copy exits straight away. Safe to re-run: holdings that already
 * have a notice from this month are skipped, so an interrupted run simply carries on where it stopped.
 */
import "dotenv/config";
import { pool } from "../config/db";
import { demandNoticeRepository } from "../repositories/demandNotice.repository";
import { generateDemandNotice } from "../services/demandNotice.service";
import { istNow, REFRESH_LOCK } from "../services/demandRefresh.service";

const MAX_LOGGED_ERRORS = 500;

async function main() {
  const trigger = process.argv[2] === "schedule" ? "schedule" : "manual";
  const startedBy = process.argv[3] || (trigger === "schedule" ? "System (Monthly Refresh)" : "Server (command line)");
  if (process.env.TZ !== "Asia/Kolkata") {
    console.error("[demand-refresh] run with TZ=Asia/Kolkata so notice dates and late fee use Indian dates.");
    process.exitCode = 2;
    return;
  }

  // The lock lives on this one connection for the whole run.
  const lockConn = await pool.connect();
  try {
    const { rows } = await lockConn.query<{ ok: boolean }>(`SELECT pg_try_advisory_lock($1, $2) AS ok`, REFRESH_LOCK);
    if (!rows[0]?.ok) {
      console.log("[demand-refresh] another run is in progress - exiting.");
      return;
    }
    // A row still 'running' now can only be a run that was killed (server restart) - mark it.
    await pool.query(`UPDATE demand_refresh_runs SET status = 'interrupted', finished_at = now() WHERE status = 'running'`);

    const month = istNow().month;
    const { rows: run } = await pool.query<{ id: string }>(
      `INSERT INTO demand_refresh_runs (run_month, trigger, started_by) VALUES ($1, $2, $3) RETURNING id`,
      [month, trigger, startedBy],
    );
    const runId = run[0]!.id;
    console.log(`[demand-refresh] run ${runId} (${trigger}) for ${month} started`);

    let processed = 0;
    const errors: { holdingNo: string; message: string }[] = [];
    let failed = 0;
    const save = (extra = "") =>
      pool.query(`UPDATE demand_refresh_runs SET processed = $2, failed = $3, errors = $4::jsonb ${extra} WHERE id = $1`, [
        runId,
        processed,
        failed,
        JSON.stringify(errors),
      ]);
    try {
      const holdingNos = await demandNoticeRepository.findHoldingNosNeedingDemandNotice();
      await pool.query(`UPDATE demand_refresh_runs SET total = $2 WHERE id = $1`, [runId, holdingNos.length]);
      for (const [i, holdingNo] of holdingNos.entries()) {
        try {
          await generateDemandNotice(holdingNo, startedBy);
          processed++;
        } catch (err) {
          failed++;
          if (errors.length < MAX_LOGGED_ERRORS) errors.push({ holdingNo, message: err instanceof Error ? err.message : String(err) });
        }
        if ((i + 1) % 25 === 0) await save();
      }
      await save(`, status = 'completed', finished_at = now()`);
      console.log(`[demand-refresh] run ${runId} completed: ${processed} generated, ${failed} skipped/failed of ${holdingNos.length}`);
    } catch (err) {
      await pool.query(`UPDATE demand_refresh_runs SET status = 'failed', finished_at = now(), message = $2, processed = $3, failed = $4 WHERE id = $1`, [
        runId,
        err instanceof Error ? err.message : String(err),
        processed,
        failed,
      ]);
      throw err;
    }
  } finally {
    await lockConn.query(`SELECT pg_advisory_unlock($1, $2)`, REFRESH_LOCK).catch(() => undefined);
    lockConn.release();
  }
}

main()
  .catch((err) => {
    console.error("[demand-refresh] failed:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
