-- Payment details for every collection, and reconciliation recorded as the process flows.
--   cash / prepaid card            -> 'reconciled' at collection (by whoever collected it)
--   card, UPI, online banking      -> 'pending' until the Project Manager and then the Tax Daroga reconcile it
--   cheque, demand draft           -> 'pending' as above, and the demand notice is ON HOLD meanwhile
--   bounced / invalid              -> 'bounced' (receipt cancelled, demand unsettled again)
--   receipt cancelled              -> 'cancelled'
--   District Treasury, online gateway and receipts issued before this -> 'not_required'
-- 'pm_verified' is still "reconciliation pending": the Project Manager has confirmed the credit, the Tax Daroga not yet.
-- instrument_no (migration 126) now also holds the UPI URN, the online-banking UTR or the card approval code.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS card_type              VARCHAR(20);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS card_holder_name       VARCHAR(50);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS card_last4             CHAR(4) CHECK (card_last4 IS NULL OR card_last4 ~ '^[0-9]{4}$');
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS amount_demanded        NUMERIC(14,2);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS amount_received_actual NUMERIC(14,2);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS pm_verified_by_id      BIGINT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reconciled_by_id       BIGINT;

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_reconcile_status_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_reconcile_status_check
  CHECK (reconcile_status IN ('not_required', 'pending', 'pm_verified', 'reconciled', 'bounced', 'cancelled'));

-- Receipts already cancelled while awaiting reconciliation (under migration 126) get the new 'cancelled' status.
UPDATE transactions SET reconcile_status = 'cancelled' WHERE cancelled AND reconcile_status IN ('pending', 'pm_verified');
