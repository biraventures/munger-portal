/**
 * Moves the old admin-portal JE / AE - Mechanical logins to the asset management side, where that work is now done.
 *
 *   npm run move-mechanical-logins            (shows what would happen - changes nothing)
 *   npm run move-mechanical-logins -- --apply (does it)
 *
 * For each active admin login with role je_mechanical / ae_mechanical, an asset management login is created with
 * the same username, display name, role and password (the stored password hash is copied - both portals use the
 * same bcrypt hashing - so the person keeps logging in with the same password). The admin-portal login is then
 * deactivated. A username already used on the asset management side is skipped and reported.
 */
import "dotenv/config";
import { Pool } from "pg";

const apply = process.argv.includes("--apply");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    const { rows: admins } = await client.query<{
      id: string;
      username: string;
      display_name: string;
      role: string;
      password_hash: string;
    }>(
      `SELECT id, username, display_name, role, password_hash FROM admins
       WHERE role IN ('je_mechanical', 'ae_mechanical') AND active = TRUE ORDER BY role, username`,
    );
    if (!admins.length) {
      console.log("No active admin-portal JE / AE - Mechanical logins - nothing to move.");
      return;
    }
    await client.query("BEGIN");
    let moved = 0;
    for (const a of admins) {
      const { rows: taken } = await client.query<{ role: string }>(
        `SELECT role FROM attendance_users WHERE lower(username) = lower($1) AND deleted_at IS NULL`,
        [a.username],
      );
      if (taken[0]) {
        console.log(
          `SKIP  ${a.username} (${a.display_name}, ${a.role}) - username already used on asset management (role ${taken[0].role}).`,
        );
        continue;
      }
      console.log(`${apply ? "MOVE" : "WOULD MOVE"}  ${a.username} (${a.display_name}, ${a.role})`);
      if (apply) {
        await client.query(
          `INSERT INTO attendance_users (username, password_hash, display_name, role, ward_id, active) VALUES ($1, $2, $3, $4, NULL, TRUE)`,
          [a.username, a.password_hash, a.display_name, a.role],
        );
        await client.query(`UPDATE admins SET active = FALSE WHERE id = $1`, [a.id]);
      }
      moved++;
    }
    if (apply) {
      await client.query("COMMIT");
      console.log(`\nMoved ${moved} login(s). They log in on the asset management login page with the same username and password.`);
      console.log("Next: Commissioner (asset management) -> Engineer Ward Assignment -> assign their wards.");
    } else {
      await client.query("ROLLBACK");
      console.log(`\n${moved} login(s) would be moved. Run again with -- --apply to do it.`);
    }
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
