-- Tracks the survey status of a holding added via the partially-known
-- entry flow (old ARV known, no real floor survey done - see
-- newEntry.service.ts / partially-known-form.tsx) whose area is only
-- a synthetic, back-calculated placeholder until a real survey
-- happens. NULL for every ordinary holding that never needed this -
-- this is an opt-in flag, not a status every property has an opinion
-- on.
--
-- to_be_surveyed -> surveyed (surveyor recorded, see
-- postRecordPropertySurvey) -> cleared back to NULL once the
-- surveyed area is actually finalized. Finalizing the area reuses
-- the existing mutation approval chain (savePropertyByHoldingNo /
-- change_requests) rather than a new one - see changeRequest.service.ts's
-- approveAtCurrentStage(), which clears survey_status on final
-- approval when the underlying change request's proposed_data carries
-- isSurveyFinalization: true.
ALTER TABLE properties ADD COLUMN survey_status VARCHAR(20) CHECK (survey_status IS NULL OR survey_status IN ('to_be_surveyed', 'surveyed'));
ALTER TABLE properties ADD COLUMN surveyor_name VARCHAR(255);
ALTER TABLE properties ADD COLUMN surveyor_id_number VARCHAR(64);
ALTER TABLE properties ADD COLUMN survey_date DATE;

CREATE INDEX idx_properties_survey_status ON properties (survey_status) WHERE survey_status IS NOT NULL;
