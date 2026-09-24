-- Adds email to admins/operators (neither had one before — needed to
-- send a reset link somewhere) and a table of reset tokens.
--
-- email is nullable rather than NOT NULL: existing accounts were
-- created without one, and there's no way to backfill a real address
-- automatically. An account with no email on file simply can't use
-- "forgot password" until someone runs the set-admin-email /
-- set-operator-email script for it — requestPasswordReset() already
-- handles that account, along with a genuinely-not-found email,
-- identically (see passwordReset.service.ts) so this never leaks
-- which accounts have an email on file.
ALTER TABLE admins ADD COLUMN email VARCHAR(255);
ALTER TABLE operators ADD COLUMN email VARCHAR(255);

-- Only the HASH of the reset token is stored — same reasoning as
-- storing a password hash rather than the password itself. The raw
-- token only ever exists in the emailed link and briefly in memory
-- while handling that request; if this table were ever exposed, none
-- of its rows could be used to reset anything.
CREATE TABLE password_reset_tokens (
  id            BIGSERIAL PRIMARY KEY,
  account_type  VARCHAR(10) NOT NULL CHECK (account_type IN ('admin', 'operator')),
  account_id    BIGINT NOT NULL,
  token_hash    VARCHAR(64) UNIQUE NOT NULL,   -- sha256 hex digest of the raw token
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_password_reset_tokens_lookup ON password_reset_tokens (token_hash) WHERE used_at IS NULL;