-- Gates public visibility of a newly-entered shop behind a 3-stage
-- review (Stall Prabhari -> City Manager -> Deputy Municipal
-- Commissioner), separate from the shop's operational `status`
-- (vacant/occupied/etc). Without this, a shop entered by an operator
-- was immediately shown as available in the public "Apply for a New
-- Rental Shop" page the moment it was created (status defaults to
-- 'vacant'), before anyone had reviewed it - this was drawing
-- unnecessary public attention to entries that hadn't been confirmed
-- yet. publication_stage progressing through the 3 stages is what
-- controls that, not status itself - a shop can be legitimately
-- vacant internally while still awaiting public-listing approval.
--
-- Existing shops are backfilled to 'approved' immediately below,
-- since they were already publicly known before this gate existed -
-- only shops created from this point forward start the review chain.
ALTER TABLE shops ADD COLUMN publication_stage VARCHAR(30) NOT NULL DEFAULT 'stall_prabhari'
  CHECK (publication_stage IN ('stall_prabhari', 'city_manager', 'deputy_commissioner', 'approved'));
UPDATE shops SET publication_stage = 'approved';
