-- Online payments are now confirmed only by asking ICICI directly (status API, server to server), never from what
-- the citizen's browser posts back. These columns record that check. 'needs_review' = the bank says the money was
-- received but the payment could not be recorded automatically (e.g. the demand notice was paid or cancelled in the
-- meantime) - staff must settle or refund it by hand.
ALTER TABLE pg_request DROP CONSTRAINT IF EXISTS pg_request_status_check;
ALTER TABLE pg_request ADD CONSTRAINT pg_request_status_check
  CHECK (status IN ('pending', 'success', 'failed', 'needs_review'));
ALTER TABLE pg_request ADD COLUMN IF NOT EXISTS bank_txn_id VARCHAR(64);
ALTER TABLE pg_request ADD COLUMN IF NOT EXISTS bank_status_response JSONB;
ALTER TABLE pg_request ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE pg_request ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;
ALTER TABLE pg_request ADD COLUMN IF NOT EXISTS check_count INTEGER NOT NULL DEFAULT 0;
