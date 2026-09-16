-- Sometimes the agreement holder (or the name the demand register
-- actually bills) is not who is physically running the shop today -
-- ownership/tenancy can informally pass along without the paperwork
-- catching up. These three fields record who's actually there now,
-- as a separate, optional reference alongside holder_name/
-- agreement_holder_name/demand_register_holder_name - none of this
-- feeds into any calculation, and none of it is mandatory, since it
-- often simply isn't known.
ALTER TABLE shop_agreements ADD COLUMN present_occupant_name VARCHAR(200);
ALTER TABLE shop_agreements ADD COLUMN present_occupant_aadhaar VARCHAR(16);
-- Free text rather than a number - "around 8-9 years", "since childhood
-- of current owner" are how this is actually known in practice, not a
-- precise figure.
ALTER TABLE shop_agreements ADD COLUMN present_occupant_years_approx VARCHAR(64);
