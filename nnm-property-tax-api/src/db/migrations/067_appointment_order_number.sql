-- Appointment order/letter is just the order number (alphanumeric,
-- may include special characters) - not a document upload. Drops the
-- BYTEA file columns from migration 066 and replaces them with a
-- plain text field.
ALTER TABLE employees DROP COLUMN appointment_order_file_data;
ALTER TABLE employees DROP COLUMN appointment_order_file_name;
ALTER TABLE employees ADD COLUMN appointment_order_number VARCHAR(100);
