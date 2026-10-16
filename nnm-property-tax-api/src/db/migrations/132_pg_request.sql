CREATE TABLE pg_request (
  id BIGSERIAL PRIMARY KEY,
  holding_no VARCHAR(32) NOT NULL REFERENCES properties(holding_no),
  receipt_no VARCHAR(32) REFERENCES transactions(receipt_no),
  ward VARCHAR(16),
  zone VARCHAR(16),
  demand_from VARCHAR(9),
  demand_upto VARCHAR(9),
  amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  demand INTEGER [] NOT NULL DEFAULT '{}',
  order_id VARCHAR(64) UNIQUE NOT NULL,
  gateway VARCHAR(32) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  gateway_response JSONB,
  failure_reason TEXT,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pg_request_holding_no ON pg_request (holding_no);

CREATE INDEX idx_pg_request_created_at ON pg_request (created_at);

CREATE INDEX idx_pg_request_status ON pg_request (status);