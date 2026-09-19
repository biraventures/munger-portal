-- Soft delete - keeps the row (for audit/history) but removes it
-- from normal listings and search. Established Clerk deletes go
-- through this, not a hard DELETE.
ALTER TABLE employees ADD COLUMN deleted_at TIMESTAMPTZ;
CREATE INDEX idx_employees_aadhaar ON employees (aadhaar_number) WHERE deleted_at IS NULL;
