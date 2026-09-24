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
    await pool.query(
      `INSERT INTO admins (username, password_hash, display_name, role, active, is_demo)
       VALUES ($1, $2, $3, $4, TRUE, $5)`,
      [username, passwordHash, displayName, role, isDemo],
    );
    console.log(`Created admin "${username}" (${displayName}) with role ${role}${isDemo ? " [DEMO - read only]" : ""}.`);
  } catch (err) {
    console.error("Failed to create admin:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();