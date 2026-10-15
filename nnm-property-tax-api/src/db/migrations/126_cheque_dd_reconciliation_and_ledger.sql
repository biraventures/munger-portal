-- 1. Cheque / DD reconciliation.
--    A cheque or demand draft taken at the counter or in the field is only provisional until it is credited to the
--    Nagar Nigam account: the Project Manager checks it first, then the Tax Daroga marks it reconciled (or bounced).
--    reconcile_status: 'not_required' (cash, UPI, card, treasury, online) | 'pending' | 'pm_verified' | 'reconciled' | 'bounced'
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS instrument_no       VARCHAR(50);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS instrument_date     DATE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS bank_name           VARCHAR(50);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS branch_name         VARCHAR(50);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reconcile_status    VARCHAR(16) NOT NULL DEFAULT 'not_required'
  CHECK (reconcile_status IN ('not_required', 'pending', 'pm_verified', 'reconciled', 'bounced'));
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS pm_verified_by      VARCHAR(100);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS pm_verified_at      TIMESTAMPTZ;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reconciled_by       VARCHAR(100);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reconciled_at       TIMESTAMPTZ;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reconcile_remarks   VARCHAR(200);
-- Who actually recorded the payment (login username) and whether it was a Tax Collector in the field or an operator at
-- the counter - collected_by only holds a display name.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS collected_by_username VARCHAR(64);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS collected_by_role     VARCHAR(16);
CREATE INDEX IF NOT EXISTS idx_transactions_reconcile_open ON transactions (reconcile_status) WHERE reconcile_status IN ('pending', 'pm_verified');
CREATE INDEX IF NOT EXISTS idx_transactions_collected_by_username ON transactions (collected_by_username);

-- A demand notice paid by cheque/DD stays settled but ON HOLD until reconciliation. While any notice of a holding is on
-- hold, no new demand notice can be raised for it. A bounce re-opens the notice (unsettled) and lifts the hold.
ALTER TABLE demand_notices ADD COLUMN IF NOT EXISTS on_hold BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_demand_notices_on_hold ON demand_notices (holding_no) WHERE on_hold;

-- 2. Wards a Tax Collector has ever been assigned (the live table only holds the current ones), so the collection
--    report can still show a collector's collection from a ward taken away from them later.
CREATE TABLE IF NOT EXISTS tax_collector_ward_history (
  tax_collector_username VARCHAR(64) NOT NULL,
  ward                   VARCHAR(16) NOT NULL,
  first_assigned_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tax_collector_username, ward)
);
INSERT INTO tax_collector_ward_history (tax_collector_username, ward)
  SELECT tax_collector_username, btrim(ward) FROM tax_collector_login_wards
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION record_tax_collector_ward_history() RETURNS trigger AS $$
BEGIN
  INSERT INTO tax_collector_ward_history (tax_collector_username, ward)
  VALUES (NEW.tax_collector_username, btrim(NEW.ward))
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tax_collector_ward_history ON tax_collector_login_wards;
CREATE TRIGGER trg_tax_collector_ward_history
  AFTER INSERT OR UPDATE ON tax_collector_login_wards
  FOR EACH ROW EXECUTE FUNCTION record_tax_collector_ward_history();

-- 3. Transaction ledger tables (structure as specified by NNM). Every property-tax payment recorded by the portal is
--    also written here: one master row per receipt and one detail row with the instrument (cheque/DD/UPI/card) and its
--    reconciliation status. trans_no is the receipt number. properties gets a numeric key for prop_pk_id.
ALTER TABLE properties ADD COLUMN IF NOT EXISTS pk_id BIGSERIAL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_properties_pk_id ON properties (pk_id);

CREATE TABLE IF NOT EXISTS public.tbl_transaction_master
(
  pk_id bigserial PRIMARY KEY,
  municipalmstrid bigint,
  ward_id bigint,
  prop_pk_id bigint,
  trans_no character varying(50),
  trans_date date,
  due_from character varying(50),
  due_upto character varying(50),
  actual_demand numeric(18,0),
  penalty numeric(18,0),
  water_charge numeric(18,0),
  late_submission numeric(18,0),
  rain_wtr numeric(18,0),
  rebate_early numeric(18,0),
  total_rebate numeric(18,0),
  payable_amount numeric(18,0),
  advance numeric(18,0),
  paid_amount numeric(18,0),
  remarks character varying(200),
  payment_mode character varying(50),
  cancel_status smallint,
  recstatus smallint DEFAULT 1,
  entrydatetime timestamp with time zone DEFAULT now(),
  entryby bigint,
  entryipaddress character varying(150),
  cash_verify_stts smallint DEFAULT 0,
  cash_verify_id bigint,
  verify_date_time date,
  scheme character varying(150),
  reg_fee numeric(18,0),
  bpl_actual_demand numeric(15,2) DEFAULT 0,
  pole_amount numeric(18,0) DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tbl_transaction_master_trans_no ON public.tbl_transaction_master (trans_no);
CREATE INDEX IF NOT EXISTS idx_tbl_transaction_master_prop ON public.tbl_transaction_master (prop_pk_id);

CREATE TABLE IF NOT EXISTS public.tbl_transaction_details
(
  pk_id bigserial PRIMARY KEY,
  prop_pk_id bigint,
  trans_id bigint,
  upi_cheque_cardtrans_id_neftref_no character varying(50),
  cheque_neft_date date DEFAULT now(),
  branch_name character varying(50),
  bank_name character varying(50),
  card_type character varying(50),
  card_no character varying(50),
  card_holder_name character varying(50),
  paid_amount numeric(18,0),
  trans_status smallint,
  reconcile_date timestamp without time zone,
  reconcile_by bigint,
  remarks character varying(150),
  upi_cheque_dd_image character varying(150),
  updatedatetime timestamp without time zone,
  updateby bigint,
  entrydatetime timestamp without time zone DEFAULT now(),
  entryby bigint,
  entryipaddress character varying(150),
  recstatus smallint DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_tbl_transaction_details_trans ON public.tbl_transaction_details (trans_id);
