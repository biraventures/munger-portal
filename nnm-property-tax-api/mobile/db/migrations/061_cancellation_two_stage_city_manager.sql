-- The Commissioner assigns each Tax Collector to one of the (two)
-- City Managers - only meaningful on tax_collector rows, NULL
-- otherwise. This is what routes a Tax-Collector-raised cancellation
-- request to the right City Manager for final approval below.
ALTER TABLE admins ADD COLUMN assigned_city_manager_username VARCHAR(100) REFERENCES admins(username);

-- Extends the existing single-stage (tax_daroga only) cancellation
-- flow to a second, optional stage for City Manager final approval -
-- added specifically for Tax-Collector-raised requests (a mistaken
-- receipt they issued), while an operator's request keeps behaving
-- exactly as before (tax_daroga alone decides, no second stage,
-- assigned_city_manager_username stays NULL for those rows).
ALTER TABLE cancellation_requests ADD COLUMN requested_by_username VARCHAR(100);
ALTER TABLE cancellation_requests ADD COLUMN requested_by_role VARCHAR(30);
ALTER TABLE cancellation_requests ADD COLUMN stage VARCHAR(20) NOT NULL DEFAULT 'tax_daroga' CHECK (stage IN ('tax_daroga', 'city_manager'));
ALTER TABLE cancellation_requests ADD COLUMN assigned_city_manager_username VARCHAR(100);
ALTER TABLE cancellation_requests ADD COLUMN assigned_city_manager_display_name VARCHAR(200);
ALTER TABLE cancellation_requests ADD COLUMN tax_daroga_approved_by VARCHAR(255);
ALTER TABLE cancellation_requests ADD COLUMN tax_daroga_approved_at TIMESTAMPTZ;
ALTER TABLE cancellation_requests ADD COLUMN tax_daroga_notes TEXT;
CREATE INDEX idx_cancellation_requests_stage ON cancellation_requests (stage, status);
