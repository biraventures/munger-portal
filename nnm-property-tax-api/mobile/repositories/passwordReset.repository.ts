import { pool } from "../config/db";

export interface PasswordResetTokenRow {
  id: number;
  account_type: "admin" | "operator";
  account_id: number;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
}

export const passwordResetRepository = {
  async insert(accountType: "admin" | "operator", accountId: number, tokenHash: string, expiresAt: Date): Promise<void> {
    await pool.query(
      `INSERT INTO password_reset_tokens (account_type, account_id, token_hash, expires_at) VALUES ($1,$2,$3,$4)`,
      [accountType, accountId, tokenHash, expiresAt],
    );
  },

  /** Only a token that's unused AND unexpired is "valid" — anything else should be treated as not found. */
  async findValidByTokenHash(tokenHash: string): Promise<PasswordResetTokenRow | null> {
    const { rows } = await pool.query<PasswordResetTokenRow>(
      `SELECT * FROM password_reset_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
      [tokenHash],
    );
    return rows[0] ?? null;
  },

  async markUsed(id: number): Promise<void> {
    await pool.query(`UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`, [id]);
  },
};