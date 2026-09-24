-- New shop rental applications — prospective tenants applying for a
-- VACANT shop. Same 5-stage chain as agreement changes (Stall Prabhari
-- -> Tax Daroga NOC -> City Manager -> Deputy Commissioner ->
-- Commissioner), always the full chain — no tiering here, since every
-- application is a genuinely fresh decision, never a data-completion
-- shortcut. Tax Daroga's stage specifically means checking whether the
-- APPLICANT's own property tax (on their separate holding, if any) is
-- clear — see shopRentalApplication.service.ts, which enriches the
-- application detail with a live property tax lookup for exactly this.
--
-- On final (Commissioner) approval, the agreement is created
-- automatically — an applicant who already passed the full chain here
-- does not go through a second approval round for the agreement itself.
CREATE TABLE shop_rental_applications (
  id SERIAL PRIMARY KEY,
  shop_no VARCHAR(32) NOT NULL REFERENCES shops(shop_no),
  applicant_name VARCHAR(200) NOT NULL,
  applicant_relation_type VARCHAR(10),
  applicant_relation_name VARCHAR(200),
  applicant_mobile VARCHAR(15),
  applicant_address TEXT,
  applicant_id_proof_number VARCHAR(32),
  applicant_business_name VARCHAR(200),
  proposed_monthly_rent NUMERIC(12,2) NOT NULL,
  -- The applicant's OWN property tax holding number, if any — this is
  -- what Tax Daroga's NOC check is against. Optional: not everyone
  -- applying necessarily owns separately-taxed property in NNM.
  applicant_property_holding_no VARCHAR(32),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  current_stage VARCHAR(30) NOT NULL,
  requested_by VARCHAR(100) NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  final_decided_at TIMESTAMPTZ,
  reviewed_by VARCHAR(100),
  reviewed_role VARCHAR(30),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  -- Set once approved and the agreement is auto-created — traceability
  -- back from the application to the resulting agreement.
  created_agreement_id INTEGER REFERENCES shop_agreements(id)
);

CREATE INDEX idx_shop_rental_applications_shop_no ON shop_rental_applications (shop_no);

CREATE TABLE shop_rental_application_approvals (
  id SERIAL PRIMARY KEY,
  application_id INTEGER NOT NULL REFERENCES shop_rental_applications(id),
  stage VARCHAR(30) NOT NULL,
  decision VARCHAR(20) NOT NULL,
  admin_username VARCHAR(100) NOT NULL,
  admin_display_name VARCHAR(200) NOT NULL,
  notes TEXT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now()
);