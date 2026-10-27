-- Building plan permit: public online application, handled in the office by the Map Section Nodal Clerk.
--
--   draft -> submitted        applicant submitted; awaiting site verification + Amin report + AE report
--         -> scrutiny          reports on file; awaiting technical scrutiny of the drawing (fees finalised here)
--         -> awaiting_payment  development fee + permit fee + labour cess due (online or office counter)
--         -> processing        paid; file processing and verification (physical drawing sets, affidavit, ...)
--         -> authority         awaiting competent authority approval
--         -> sanctioned        approved by the competent authority; building plan approval to be issued
--         -> approved          permit number issued, approved drawing uploaded
--   returned  (to the applicant for correction, from submitted / scrutiny / processing; resubmission goes back there)
--   rejected

ALTER TABLE admins DROP CONSTRAINT admins_role_check;
ALTER TABLE admins ADD CONSTRAINT admins_role_check
  CHECK (role IN ('tax_daroga', 'tax_surveyor', 'tax_collector', 'mutation_nodal_clerk', 'deputy_commissioner', 'commissioner', 'stall_prabhari', 'city_manager', 'trade_license_nodal', 'assistant_town_planning_supervisor', 'assistant_architect', 'je_mechanical', 'ae_mechanical', 'establishment_clerk', 'agency_team_leader', 'agency_project_manager', 'abhilekh_prabhari', 'agency_operator', 'map_section_nodal_clerk'));

CREATE SEQUENCE IF NOT EXISTS bp_application_seq;
CREATE SEQUENCE IF NOT EXISTS bp_permit_seq;

CREATE TABLE IF NOT EXISTS bp_applications (
  id                     BIGSERIAL PRIMARY KEY,
  application_no         VARCHAR(24) UNIQUE,
  status                 VARCHAR(20) NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft', 'submitted', 'scrutiny', 'awaiting_payment', 'processing', 'authority', 'sanctioned', 'approved', 'returned', 'rejected')),
  returned_from          VARCHAR(20),
  upload_token_hash      VARCHAR(64) NOT NULL,
  -- applicant
  applicant_name         VARCHAR(150) NOT NULL,
  relation_name          VARCHAR(150),
  mobile                 VARCHAR(10) NOT NULL,
  email                  VARCHAR(150),
  applicant_address      TEXT NOT NULL,
  aadhaar_no             VARCHAR(12) NOT NULL,
  pan_no                 VARCHAR(10),
  -- site
  holding_no             VARCHAR(32),
  ward                   VARCHAR(16) NOT NULL,
  mauza                  VARCHAR(100),
  thana_no               VARCHAR(20),
  khata_no               VARCHAR(50) NOT NULL,
  khesra_no              VARCHAR(50) NOT NULL,
  site_address           TEXT NOT NULL,
  plot_area_sqm          NUMERIC(14, 2) NOT NULL CHECK (plot_area_sqm > 0),
  -- building
  use_type               VARCHAR(20) NOT NULL CHECK (use_type IN ('residential', 'commercial', 'mixed', 'institutional', 'industrial', 'other')),
  floors                 JSONB NOT NULL DEFAULT '[]',   -- [{ "floor": "Ground", "areaSqm": 120.5 }, ...]
  built_up_area_sqm      NUMERIC(14, 2) NOT NULL CHECK (built_up_area_sqm > 0),
  -- architect (UDHD registered)
  architect_name         VARCHAR(150) NOT NULL,
  architect_reg_no       VARCHAR(60) NOT NULL,
  architect_mobile       VARCHAR(10),
  -- fees as applied (calculator) and as finalised at technical scrutiny
  fee_development        NUMERIC(12, 2) NOT NULL,
  fee_permit             NUMERIC(12, 2) NOT NULL,
  fee_labour_cess        NUMERIC(12, 2) NOT NULL,
  fee_total              NUMERIC(12, 2) NOT NULL,
  verified_built_up_sqm  NUMERIC(14, 2),
  verified_plot_area_sqm NUMERIC(14, 2),
  verified_use_type      VARCHAR(20),
  final_fee_development  NUMERIC(12, 2),
  final_fee_permit       NUMERIC(12, 2),
  final_fee_labour_cess  NUMERIC(12, 2),
  final_fee_total        NUMERIC(12, 2),
  -- payment
  paid_at                TIMESTAMPTZ,
  payment_mode           VARCHAR(30),
  payment_ref            VARCHAR(80),
  payment_amount         NUMERIC(12, 2),
  payment_recorded_by    VARCHAR(64),
  -- outcome
  permit_no              VARCHAR(40) UNIQUE,
  permit_issued_at       TIMESTAMPTZ,
  permit_valid_till      DATE,
  authority_order_no     VARCHAR(80),
  authority_order_date   DATE,
  applicant_message      TEXT,          -- last return / rejection reason shown to the applicant
  created_ip             INET,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at           TIMESTAMPTZ,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bp_applications_status ON bp_applications (status, submitted_at);
CREATE INDEX IF NOT EXISTS idx_bp_applications_mobile ON bp_applications (mobile);

-- Applicant's documents and the office's reports / orders (source = 'applicant' | 'office').
CREATE TABLE IF NOT EXISTS bp_documents (
  id               BIGSERIAL PRIMARY KEY,
  application_id   BIGINT NOT NULL REFERENCES bp_applications(id) ON DELETE CASCADE,
  doc_type         VARCHAR(40) NOT NULL,
  source           VARCHAR(10) NOT NULL CHECK (source IN ('applicant', 'office')),
  file_path        TEXT NOT NULL,
  mime_type        VARCHAR(60) NOT NULL,
  size_bytes       BIGINT NOT NULL,
  file_name        VARCHAR(255) NOT NULL,
  uploaded_by      VARCHAR(64),
  uploaded_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bp_documents_app ON bp_documents (application_id, doc_type);

-- Timeline: every stage action with who / when / remarks; site-stage reports carry a finding.
CREATE TABLE IF NOT EXISTS bp_events (
  id               BIGSERIAL PRIMARY KEY,
  application_id   BIGINT NOT NULL REFERENCES bp_applications(id) ON DELETE CASCADE,
  stage            VARCHAR(30) NOT NULL,
  action           VARCHAR(40) NOT NULL,
  finding          VARCHAR(20),
  remarks          TEXT,
  by_username      VARCHAR(64),
  by_role          VARCHAR(40),
  public           BOOLEAN NOT NULL DEFAULT TRUE,   -- shown in the applicant's timeline
  at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bp_events_app ON bp_events (application_id, at);

-- Online payment orders (ICICI) for building permit fees.
CREATE TABLE IF NOT EXISTS bp_pg_orders (
  id                    BIGSERIAL PRIMARY KEY,
  order_id              VARCHAR(64) UNIQUE NOT NULL,
  application_id        BIGINT NOT NULL REFERENCES bp_applications(id) ON DELETE CASCADE,
  amount                NUMERIC(12, 2) NOT NULL,
  status                VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'needs_review')),
  bank_txn_id           VARCHAR(64),
  bank_status_response  JSONB,
  gateway_response      JSONB,
  failure_reason        TEXT,
  check_count           INTEGER NOT NULL DEFAULT 0,
  last_checked_at       TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bp_pg_orders_pending ON bp_pg_orders (status, created_at) WHERE status = 'pending';
