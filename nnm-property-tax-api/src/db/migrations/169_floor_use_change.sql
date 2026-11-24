-- Change of use / back-dated floor changes (operator change requests): a photo of the premises is attached, and the
-- request goes Tax Daroga -> City Manager -> Deputy Commissioner (approval_tier 'use_change').
ALTER TABLE property_change_requests ADD COLUMN IF NOT EXISTS premises_photo_path TEXT;

-- The City Manager is now a desk on property change requests (changes of use).
ALTER TABLE property_change_requests DROP CONSTRAINT IF EXISTS property_change_requests_current_stage_check;
ALTER TABLE property_change_requests ADD CONSTRAINT property_change_requests_current_stage_check
  CHECK (current_stage IN ('tax_daroga', 'tax_surveyor', 'mutation_nodal_clerk', 'city_manager', 'deputy_commissioner', 'commissioner'));
ALTER TABLE change_request_approvals DROP CONSTRAINT IF EXISTS change_request_approvals_stage_check;
ALTER TABLE change_request_approvals ADD CONSTRAINT change_request_approvals_stage_check
  CHECK (stage IN ('tax_daroga', 'tax_surveyor', 'mutation_nodal_clerk', 'city_manager', 'deputy_commissioner', 'commissioner'));
