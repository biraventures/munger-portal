-- Recommendation of Municipal Board - yes/no, with the proceeding
-- number and date required only when yes.
ALTER TABLE employees ADD COLUMN municipal_board_recommendation BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE employees ADD COLUMN proceeding_number VARCHAR(100);
ALTER TABLE employees ADD COLUMN proceeding_date DATE;
