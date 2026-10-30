-- Where each demand notice sits in a printed ward bundle, so the Tax Collector can find a holding's notice in the
-- stack without searching: "Ward 5, bundle of 29-10-2026, Part 1 of 2, Sl. No. 37 of 250". The same Sl. No. is
-- printed in the corner of the notice itself. One row per notice per print.
CREATE TABLE IF NOT EXISTS notice_print_positions (
  id              BIGSERIAL PRIMARY KEY,
  demand_no       VARCHAR(32) NOT NULL,
  holding_no      VARCHAR(32) NOT NULL,
  ward            VARCHAR(16),
  part_no         INTEGER NOT NULL CHECK (part_no >= 1),
  part_count      INTEGER NOT NULL CHECK (part_count >= part_no),
  serial_no       INTEGER NOT NULL CHECK (serial_no >= 1),
  part_size       INTEGER NOT NULL CHECK (part_size >= serial_no),
  printed_by      VARCHAR(128),
  printed_by_role VARCHAR(64),
  printed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notice_print_positions_holding ON notice_print_positions (holding_no, printed_at DESC);
CREATE INDEX IF NOT EXISTS idx_notice_print_positions_demand ON notice_print_positions (demand_no);
