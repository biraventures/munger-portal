/**
 * One-off CLI to create an admin account. There's no self-service admin
 * signup by design — someone with database access has to run this.
 *
 * Usage:
 *   npm run create-admin -- <username> <password> "<Display Name>" <role> [--demo]
 *   role is one of the AdminRole values in src/types/admin.types.ts
 *   --demo creates a read-only demo account: it can log in and view
 *   everything, but every request that isn't a GET is blocked.
 *
 *   For role "tax_collector", a 7-character alphanumeric TC code is
 *   generated automatically and printed at the end — this is the code
 *   the Tax Collector gives citizens/operators to enter on the payment
 *   flow (verified against this account, see admin.repository.ts's
 *   findActiveTaxCollectorByCode). There's nothing to pass in for it.
 *
 * Example:
 *   npm run create-admin -- rmishra "TempPass123!" "Rakesh Mishra" commissioner
 *   npm run create-admin -- demotc1 "TempPass123!" "Demo Tax Collector" tax_collector --demo
 */
import "dotenv/config";
import bcrypt from "bcrypt";
import { Pool } from "pg";
import { ADMIN_ROLES } from "../src/types/admin.types";

const args = process.argv.slice(2);
const isDemo = args.includes("--demo");
const [username, password, displayName, role] = args.filter((a) => a !== "--demo");

const VALID_ROLES: string[] = ADMIN_ROLES;

// Excludes visually-confusable characters (0/O, 1/I) - these codes get
// read aloud and typed by hand in the field, so ambiguity here is a
// real source of failed verifications at payment time.
const TC_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TC_CODE_LENGTH = 7; // within the requested 6-8 digit range

function randomTaxCollectorCode(): string {
  let code = "";
  for (let i = 0; i < TC_CODE_LENGTH; i++) {
    code += TC_CODE_ALPHABET[Math.floor(Math.random() * TC_CODE_ALPHABET.length)];
  }
  return code;
}

/** Retries on the rare collision - the UNIQUE constraint on admins.tax_collector_code is the real guarantee. */
async function generateUniqueTaxCollectorCode(pool: Pool): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = randomTaxCollectorCode();
    const { rows } = await pool.query(`SELECT 1 FROM admins WHERE tax_collector_code = $1 LIMIT 1`, [code]);
    if (rows.length === 0) return code;
  }
  throw new Error("Could not generate a unique tax collector code after 20 attempts - this should be virtually impossible.");
}

async function main() {
  if (!username || !password || !displayName || !role) {
    console.error('Usage: npm run create-admin -- <username> <password> "<Display Name>" <role> [--demo]');
    console.error(`role must be one of: ${VALID_ROLES.join(", ")}`);
    process.exit(1);
  }
  if (!VALID_ROLES.includes(role)) {
    console.error(`Invalid role "${role}". Must be one of: ${VALID_ROLES.join(", ")}`);
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password should be at least 8 characters.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const taxCollectorCode = role === "tax_collector" ? await generateUniqueTaxCollectorCode(pool) : null;

    await pool.query(
      `INSERT INTO admins (username, password_hash, display_name, role, active, is_demo, tax_collector_code)
       VALUES ($1, $2, $3, $4, TRUE, $5, $6)`,
      [username, passwordHash, displayName, role, isDemo, taxCollectorCode],
    );
    console.log(`Created admin "${username}" (${displayName}) with role ${role}${isDemo ? " [DEMO - read only]" : ""}.`);
    if (taxCollectorCode) {
      console.log(`Tax Collector code: ${taxCollectorCode}  (give this to ${displayName} - it's what they'll tell citizens/operators to enter at payment)`);
    }
  } catch (err) {
    console.error("Failed to create admin:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
