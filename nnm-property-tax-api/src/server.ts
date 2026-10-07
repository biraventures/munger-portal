import { createApp } from "./app";
import { env } from "./config/env";
import { checkDbConnection, pool } from "./config/db";
import { clearInterruptedIntegrations } from "./services/propertyImportStaging.service";

async function main() {
  await checkDbConnection();
  console.log("Connected to PostgreSQL");
  await clearInterruptedIntegrations();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`NNM Property Tax API listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = async (signal: string) => {
    console.log(`${signal} received, shutting down...`);
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