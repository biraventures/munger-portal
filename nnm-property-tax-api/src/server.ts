import { createApp } from "./app";
import { env } from "./config/env";
import { checkDbConnection, pool } from "./config/db";
import { clearInterruptedIntegrations } from "./services/propertyImportStaging.service";
import { scheduledRefreshTick } from "./services/demandRefresh.service";
import { reconcilePendingOnlineOrders } from "./services/onlinePayment.service";
import { purgeOldFaceData } from "./services/faceAttendance.service";

async function main() {
  await checkDbConnection();
  console.log("Connected to PostgreSQL");
  await clearInterruptedIntegrations();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`NNM Property Tax API listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  // Monthly demand refresh: on the 1st, 00:10-05:00 IST (see demandRefresh.service.ts). Checked every minute.
  const refreshTimer = setInterval(() => {
    scheduledRefreshTick().catch((err) => console.error("[demand-refresh] schedule check failed:", err));
  }, 60 * 1000);

  // Online payments whose citizen never came back from the bank page: ask ICICI for their status every 5 minutes.
  const pgReconcileTimer = setInterval(() => {
    reconcilePendingOnlineOrders().catch((err) => console.error("[online-payment] reconciliation failed:", err));
  }, 5 * 60 * 1000);

  // Face attendance housekeeping (old punch photos, spent challenges) - hourly.
  const faceHousekeepingTimer = setInterval(() => {
    purgeOldFaceData().catch((err) => console.error("[face] housekeeping failed:", err));
  }, 60 * 60 * 1000);

  const shutdown = async (signal: string) => {
    console.log(`${signal} received, shutting down...`);
    clearInterval(refreshTimer);
    clearInterval(pgReconcileTimer);
    clearInterval(faceHousekeepingTimer);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});