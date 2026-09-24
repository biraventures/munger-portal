-- Online payment gateway support. Existing counter-recorded rows are
-- unaffected — they keep receipt_no set immediately and default to
-- status='success', exactly as before. Online payments instead go
-- through a pending -> success/failed lifecycle, and only get a
-- receipt_no once confirmed successful (a receipt means money changed
-- hands — same principle as the counter flow).

ALTER TABLE transactions DROP CONSTRAINT transactions_pkey;
ALTER TABLE transactions ALTER COLUMN receipt_no DROP NOT NULL;
ALTER TABLE transactions ADD COLUMN id BIGSERIAL PRIMARY KEY;
ALTER TABLE transactions ADD CONSTRAINT transactions_receipt_no_key UNIQUE (receipt_no);

ALTER TABLE transactions ADD COLUMN order_id VARCHAR(64) UNIQUE;
ALTER TABLE transactions ADD COLUMN gateway VARCHAR(32);
ALTER TABLE transactions ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'success'
  CHECK (status IN ('pending', 'success', 'failed'));
ALTER TABLE transactions ADD COLUMN gateway_response JSONB;
ALTER TABLE transactions ADD COLUMN confirmed_at TIMESTAMPTZ;

CREATE INDEX idx_transactions_order_id ON transactions (order_id);
CREATE INDEX idx_transactions_status ON transactions (status);