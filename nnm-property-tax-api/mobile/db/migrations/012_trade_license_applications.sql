-- Trade license applications (new and renewal) — a third, separate
-- approval chain from properties and shops (see admin.types.ts's
-- TRADE_LICENSE_APPROVAL_STAGE_ORDER: Trade License Nodal -> City
-- Manager -> Deputy Commissioner, final).
--
-- Real typed columns rather than a flexible JSONB blob, since the full
-- field list was given directly rather than being open-ended.
CREATE TABLE trade_license_applications (
  id SERIAL PRIMARY KEY,
  -- Auto-generated, e.g. "TL-2026-00001" — never client-supplied.
  application_number VARCHAR(32) UNIQUE NOT NULL,
  -- 'new' | 'renewal'
  application_type VARCHAR(20) NOT NULL,

  -- Applicant
  applicant_name VARCHAR(200) NOT NULL,
  relation_type VARCHAR(10),      -- S/O, W/O
  relation_name VARCHAR(200),
  mobile VARCHAR(15),
  email VARCHAR(200),

  -- Entity
  entity_name VARCHAR(200) NOT NULL,
  entity_name_hindi VARCHAR(200),
  -- fully_owned | partnership | pvt_limited | public_ltd
  entity_type VARCHAR(30),
  type_of_business VARCHAR(200),

  -- Location
  complete_address TEXT NOT NULL,
  -- Cross-reference into properties, NOT a foreign key — a trade
  -- license applicant's holding may not exist in this system yet, or
  -- may belong to someone else (a rented premises), so this is
  -- deliberately unconstrained rather than enforced.
  holding_no VARCHAR(32),
  commercial_area_sqft NUMERIC(10,2),
  -- self_owned | rented
  area_ownership VARCHAR(20),
  houseowner_name VARCHAR(200),

  -- License terms
  duration_years INTEGER,          -- 1, 3, or 5
  -- upto_10L | above_10L
  annual_turnover_bracket VARCHAR(20),

  -- IDs
  tan_or_gstr_number VARCHAR(50),
  pan_number VARCHAR(20),

  -- Declarations
  bpl_proof_attached BOOLEAN NOT NULL DEFAULT FALSE,
  holding_receipt_attached BOOLEAN NOT NULL DEFAULT FALSE,

  -- Workflow
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  current_stage VARCHAR(30) NOT NULL,
  requested_by VARCHAR(100) NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  final_decided_at TIMESTAMPTZ,
  reviewed_by VARCHAR(100),
  reviewed_role VARCHAR(30),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,

  -- Set when this is a renewal built from a prior application's data —
  -- traceability, not used for any calculation.
  renewed_from_application_id INTEGER REFERENCES trade_license_applications(id)
);

CREATE INDEX idx_trade_license_holding ON trade_license_applications (holding_no);
CREATE INDEX idx_trade_license_status_stage ON trade_license_applications (status, current_stage);
CREATE INDEX idx_trade_license_requested_at ON trade_license_applications (requested_at);

-- One row per required document per application, so the operator can
-- tick+comment each independently. Seeded automatically from
-- TRADE_LICENSE_REQUIRED_DOCUMENTS (see constants/tradeLicenseDocuments.ts)
-- when an application is created — not a dynamic/editable master list,
-- since the actual 9 documents were given directly.
CREATE TABLE trade_license_document_checklist (
  id SERIAL PRIMARY KEY,
  application_id INTEGER NOT NULL REFERENCES trade_license_applications(id),
  document_name VARCHAR(200) NOT NULL,
  submitted BOOLEAN NOT NULL DEFAULT FALSE,
  comments TEXT,
  checked_by VARCHAR(100),
  checked_at TIMESTAMPTZ
);

CREATE INDEX idx_trade_license_checklist_app ON trade_license_document_checklist (application_id);

CREATE TABLE trade_license_application_approvals (
  id SERIAL PRIMARY KEY,
  application_id INTEGER NOT NULL REFERENCES trade_license_applications(id),
  stage VARCHAR(30) NOT NULL,
  decision VARCHAR(20) NOT NULL,
  admin_username VARCHAR(100) NOT NULL,
  admin_display_name VARCHAR(200) NOT NULL,
  notes TEXT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now()
);