/**
 * One-off CLI to create an operator account. There's no self-service
 * operator signup by design - someone with database access has to run
 * this. Note: the operators table enforces a hard cap of 5 accounts at
 * the database level (see migration 002_limit_operators.sql) - this
 * will fail with a clear Postgres error if that limit is already hit.
 *
 * Usage:
 *   npm run create-operator -- <username> <password> "<Display Name>" [--demo]
 *   --demo creates a read-only demo account: it can log in and view
 *   everything, but every request that isn't a GET is blocked.
 *
 * Example:
 *   npm run create-operator -- Operator1KK "Opr234RT" "Operator Window 1"
 *   npm run create-operator -- DemoOperator1 "TempPass123!" "Demo Operator" --demo
 */
import "dotenv/config";
import bcrypt from "bcrypt";
import { Pool } from "pg";

const args = process.argv.slice(2);
const isDemo = args.includes("--demo");
const [username, password, displayName] = args.filter((a) => a !== "--demo");

async function main() {
  if (!username || !password || !displayName) {
    console.error('Usage: npm run create-operator -- <username> <password> "<Display Name>" [--demo]');
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
      `INSERT INTO operators (username, password_hash, display_name, active, is_demo)
       VALUES ($1, $2, $3, TRUE, $4)`,
      [username, passwordHash, displayName, isDemo],
    );
    console.log(`Created operator "${username}" (${displayName})${isDemo ? " [DEMO - read only]" : ""}.`);
  } catch (err) {
    console.error("Failed to create operator:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();