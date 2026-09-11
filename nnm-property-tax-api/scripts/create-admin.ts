/**
 * One-off CLI to create an admin account. There's no self-service admin
 * signup by design — someone with database access has to run this.
 *
 * Usage:
 *   npm run create-admin -- <username> <password> "<Display Name>" <role>
 *   role is one of the AdminRole values in src/types/admin.types.ts
 *
 * Example:
 *   npm run create-admin -- rmishra "TempPass123!" "Rakesh Mishra" commissioner
 */
import "dotenv/config";
import bcrypt from "bcrypt";
import { Pool } from "pg";
import { ADMIN_ROLES } from "../src/types/admin.types";

const [username, password, displayName, role] = process.argv.slice(2);

const VALID_ROLES: string[] = ADMIN_ROLES;

async function main() {
  if (!username || !password || !displayName || !role) {
    console.error('Usage: npm run create-admin -- <username> <password> "<Display Name>" <role>');
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
      `INSERT INTO admins (username, password_hash, display_name, role, active)
       VALUES ($1, $2, $3, $4, TRUE)`,
      [username, passwordHash, displayName, role],
    );
    console.log(`Created admin "${username}" (${displayName}) with role ${role}.`);
  } catch (err) {
    console.error("Failed to create admin:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();