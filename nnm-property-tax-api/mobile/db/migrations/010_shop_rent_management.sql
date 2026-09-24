-- Municipal shop rent management. Mirrors the property tax system's
-- proven patterns deliberately: a demand-then-pay flow (like
-- demand_notices/transactions) for rent, and a staged approval queue
-- (like property_change_requests) for agreement changes — same
-- integrity guarantees (frozen amounts, atomic settlement, audit trail)
-- carried over rather than reinvented.

CREATE TABLE shops (
  shop_no VARCHAR(32) PRIMARY KEY,
  market_name VARCHAR(200),
  location VARCHAR(300) NOT NULL,
  ward VARCHAR(20),
  area_sqft NUMERIC(10,2),
  -- Distinguishing total plot/shop area from what's actually built and
  -- rentable — needed for a genuine per-sqft rent comparison across
  -- shops (a shop with a large open yard shouldn't be compared to a
  -- fully built one using total area alone). area_sqft above is kept
  -- for backward compatibility with earlier code, but these two are
  -- what the per-sqft-rate reporting actually uses.
  total_area_sqft NUMERIC(10,2),
  built_up_area_sqft NUMERIC(10,2),
  -- vacant | occupied | under_notice | terminated
  status VARCHAR(20) NOT NULL DEFAULT 'vacant',
  created_by VARCHAR(100) NOT NULL,
  created_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_modified_by VARCHAR(100),
  last_modified_date TIMESTAMPTZ
);

-- One shop can have a HISTORY of agreements over time (holder changes,
-- renewals) — same one-row-per-holding-but-many-edits idea as
-- properties, except here each new holder is a genuinely new row rather
-- than an edit to the same one. Escalation is stored per-agreement
-- (percentage + interval in years) rather than as one hardcoded formula,
-- since the exact rule can vary and wasn't fully specified up front.
CREATE TABLE shop_agreements (
  id SERIAL PRIMARY KEY,
  shop_no VARCHAR(32) NOT NULL REFERENCES shops(shop_no),
  agreement_number VARCHAR(64),
  -- Migrated records often carry two DIFFERENT names for the same stall
  -- (the original agreement, vs whoever the demand register actually
  -- bills today — commonly diverges via informal succession). Both are
  -- kept as reference; holder_name is the OPERATOR-CONFIRMED applicable
  -- one (picked via a dropdown of these two, or entered directly when
  -- there's no discrepancy to begin with).
  agreement_holder_name VARCHAR(200),
  demand_register_holder_name VARCHAR(200),
  holder_name VARCHAR(200) NOT NULL,
  holder_relation_type VARCHAR(10),
  holder_relation_name VARCHAR(200),
  holder_mobile VARCHAR(15),
  holder_address TEXT,
  id_proof_number VARCHAR(32),
  -- What's actually operating in the shop right now (e.g. "Sharma Tea
  -- Stall", "New Bharat Tailors") — descriptive only, not used in any
  -- calculation. Tied to the agreement (not the shop) since it
  -- naturally changes whenever the holder does.
  business_name VARCHAR(200),
  -- Same dual-reference/operator-confirmed pattern as the holder name
  -- above — "rent as per agreement" and "per month rent (demand
  -- register)" frequently differ in the migrated data.
  agreement_rent NUMERIC(12,2),
  demand_register_rent NUMERIC(12,2),
  -- Informational/summary only — the CURRENT applicable rent, refreshed
  -- whenever the agreement is saved. The actual calculation always
  -- derives fresh from the three period rates below via
  -- rentCalculation.service.ts, never trusted from this column alone.
  base_monthly_rent NUMERIC(12,2) NOT NULL,
  -- The confirmed escalation schedule (25% at 2019-20, a further 50%
  -- from 2020-21, then 5% every 3 years from 2024-25) is applied
  -- UNIFORMLY across all shops — it is not configurable per agreement.
  -- What IS per-agreement is which of these three period rates is
  -- actually known, since the migrated data comes from many different
  -- snapshots in time, not uniformly "the original pre-2019 rate".
  -- Whichever one is filled in, the others are derived automatically;
  -- if more than one is filled and they disagree with the formula,
  -- that's flagged (see resolveRentPeriods()) rather than silently
  -- picking one.
  rent_pre_2019 NUMERIC(12,2),
  rent_2019_20 NUMERIC(12,2),
  rent_2020_21_onwards NUMERIC(12,2),
  -- Nullable: many migrated records have no known start date at all —
  -- forcing one would misrepresent the historical record.
  agreement_start_date DATE,
  agreement_end_date DATE,
  security_deposit NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- One-off adjustments, kept explicitly separate from the automatic
  -- 2%-compounded-annual penalty (which is a fixed system rule, not
  -- operator-configurable) — a reason is required whenever either is
  -- set, same pattern as property tax's misc cost/rebate.
  misc_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  misc_cost_reason TEXT,
  misc_rebate NUMERIC(12,2) NOT NULL DEFAULT 0,
  misc_rebate_reason TEXT,
  -- Joint holder — optional, one additional name recorded alongside the
  -- primary holder (e.g. co-applicants, or a spouse informally added).
  joint_holder_name VARCHAR(200),
  joint_holder_relation VARCHAR(100),
  joint_holder_id_proof_number VARCHAR(32),
  -- Free-text institutional memory — e.g. "wife's name is on the
  -- receipt, agreement never formally transferred". Migrated from the
  -- source register's own Comments column; also usable going forward.
  notes TEXT,
  -- complete | partial — partial marks a migrated record with known
  -- gaps (missing start date, no agreement number on file, etc.).
  -- Completing a partial record's missing fields routes through a
  -- SHORTER approval chain (ending at Deputy Commissioner, not
  -- Commissioner) than a genuinely new agreement or a real holder
  -- change — see classifyShopAgreementChange() in
  -- shopAgreement.service.ts.
  data_status VARCHAR(20) NOT NULL DEFAULT 'complete',
  -- 'YYYY-MM' — last calendar month fully paid for. NULL = nothing paid
  -- yet. Pending months are always derived fresh from this + today's
  -- date, the same "never trust a stored balance" principle as
  -- properties' tax_paid_till_year.
  rent_paid_till_month VARCHAR(7),
  -- active | expired | terminated
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_by VARCHAR(100) NOT NULL,
  created_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_modified_by VARCHAR(100),
  last_modified_date TIMESTAMPTZ
);

CREATE INDEX idx_shop_agreements_shop_no ON shop_agreements (shop_no);

-- Approval queue for creating/editing a shop agreement. Tiered like
-- property changes: a brand-new agreement or a genuine holder change
-- always needs the full 5-stage chain (Stall Prabhari → Tax Daroga NOC
-- → City Manager → Deputy Commissioner → Commissioner); completing a
-- partial/migrated record's missing fields stops at Deputy Commissioner
-- instead. See classifyShopAgreementChange().
CREATE TABLE shop_agreement_change_requests (
  id SERIAL PRIMARY KEY,
  shop_no VARCHAR(32) NOT NULL,
  -- NULL when this request is for a brand new agreement (a vacant shop,
  -- or the previous agreement already ended) rather than editing one
  -- that's currently active.
  agreement_id INTEGER REFERENCES shop_agreements(id),
  requested_by VARCHAR(100) NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  change_reason TEXT,
  proposed_data JSONB NOT NULL,
  current_stage VARCHAR(30) NOT NULL,
  approval_tier VARCHAR(20) NOT NULL DEFAULT 'full',
  final_stage VARCHAR(30) NOT NULL DEFAULT 'commissioner',
  final_decided_at TIMESTAMPTZ,
  reviewed_by VARCHAR(100),
  reviewed_role VARCHAR(30),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT
);

CREATE TABLE shop_agreement_change_approvals (
  id SERIAL PRIMARY KEY,
  change_request_id INTEGER NOT NULL REFERENCES shop_agreement_change_requests(id),
  stage VARCHAR(30) NOT NULL,
  decision VARCHAR(20) NOT NULL,
  admin_username VARCHAR(100) NOT NULL,
  admin_display_name VARCHAR(200) NOT NULL,
  notes TEXT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Mirrors demand_notices: a frozen amount for a specific period (one
-- month, or twelve for an annual payment), generated once and settled
-- once. Paying one always advances rent_paid_till_month — same fix
-- applied here from the start that had to be retrofitted onto property
-- tax payments.
CREATE TABLE shop_rent_demands (
  demand_no VARCHAR(32) PRIMARY KEY,
  shop_no VARCHAR(32) NOT NULL REFERENCES shops(shop_no),
  agreement_id INTEGER NOT NULL REFERENCES shop_agreements(id),
  demand_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by VARCHAR(100) NOT NULL,
  period_start_month VARCHAR(7) NOT NULL,
  period_end_month VARCHAR(7) NOT NULL,
  base_rent_amount NUMERIC(12,2) NOT NULL,
  penalty_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Copied from the agreement's CURRENT misc_cost/misc_rebate at the
  -- moment this demand is generated, applied once per demand (not
  -- per month within it) — frozen here rather than only living on the
  -- agreement, so a later edit to the agreement's standing
  -- misc_cost/rebate never silently rewrites what an already-issued
  -- demand said.
  misc_cost_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  misc_cost_reason TEXT,
  misc_rebate_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  misc_rebate_reason TEXT,
  total_amount_demanded NUMERIC(12,2) NOT NULL,
  settled BOOLEAN NOT NULL DEFAULT FALSE,
  settled_receipt_no VARCHAR(32),
  settled_at TIMESTAMPTZ
);

CREATE INDEX idx_shop_rent_demands_shop_settled ON shop_rent_demands (shop_no, settled);

CREATE TABLE shop_rent_payments (
  receipt_no VARCHAR(32) PRIMARY KEY,
  shop_no VARCHAR(32) NOT NULL REFERENCES shops(shop_no),
  agreement_id INTEGER NOT NULL REFERENCES shop_agreements(id),
  demand_no VARCHAR(32) NOT NULL REFERENCES shop_rent_demands(demand_no),
  payment_mode VARCHAR(50) NOT NULL,
  amount_received NUMERIC(12,2) NOT NULL,
  collected_by VARCHAR(100) NOT NULL,
  counter VARCHAR(50),
  txn_date TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Free-text category (not a rigid enum) so it doesn't block on a fixed
-- list — the operator UI will suggest common ones (non-payment,
-- unauthorized subletting, change of use, unauthorized alteration,
-- encroachment, damage to municipal property) but isn't limited to them.
CREATE TABLE shop_violation_notices (
  id SERIAL PRIMARY KEY,
  shop_no VARCHAR(32) NOT NULL REFERENCES shops(shop_no),
  agreement_id INTEGER REFERENCES shop_agreements(id),
  violation_category VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  issued_by VARCHAR(100) NOT NULL,
  issued_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- issued | resolved | escalated
  status VARCHAR(20) NOT NULL DEFAULT 'issued',
  resolved_notes TEXT,
  resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_shop_violation_notices_shop ON shop_violation_notices (shop_no);