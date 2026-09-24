import { pool } from "../config/db";
import { deriveMarketCode } from "../constants/marketCodes";

/**
 * Finds the highest existing numeric suffix for a market's prefix
 * (e.g. "NNC-7" -> 7) and returns prefix+1 as the next shop number.
 * Mirrors property tax's getMaxHoldingNoUnderPrefix — same "auto-number
 * a genuinely new record, but let an existing one keep its known
 * number" duality as the MMC-/MUNGMC- vs MUNG- pattern there.
 */
export async function getNextShopNoForMarket(marketName: string): Promise<string> {
  const prefix = deriveMarketCode(marketName);
  const { rows } = await pool.query<{ shop_no: string }>(`SELECT shop_no FROM shops WHERE shop_no LIKE $1`, [
    `${prefix}-%`,
  ]);

  let maxNum = 0;
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  for (const row of rows) {
    const match = row.shop_no.trim().match(pattern);
    if (match) {
      const n = parseInt(match[1]!, 10);
      if (n > maxNum) maxNum = n;
    }
  }

  return `${prefix}-${maxNum + 1}`;
}