import { backfillStoredTaxFigures } from "../src/services/propertyBulkImport.service";
import { pool } from "../src/config/db";

/** One-off: fill the stored annual tax / solid waste / amount-due figures for holdings still showing 0. */
async function main(): Promise<void> {
  const r = await backfillStoredTaxFigures();
  console.log(`Updated ${r.updated} holdings; ${r.failed.length} failed.`);
  r.failed.slice(0, 20).forEach((f) => console.log(` - ${f.holdingNo}: ${f.message}`));
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
