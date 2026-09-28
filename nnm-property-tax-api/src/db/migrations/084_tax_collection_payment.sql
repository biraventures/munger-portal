-- Tax Collection & Payment Module
-- Database migration

ALTER TABLE public.tax_collectors
    ADD COLUMN IF NOT EXISTS mobile_number VARCHAR(20),
    ADD COLUMN IF NOT EXISTS password_hash TEXT,
    ADD COLUMN IF NOT EXISTS email VARCHAR(255);

ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,8),
    ADD COLUMN IF NOT EXISTS longitude NUMERIC(11,8),
    ADD COLUMN IF NOT EXISTS entry_ip_address VARCHAR(45);

CREATE TABLE IF NOT EXISTS public.payment_mode
(
    id BIGINT NOT NULL,
    name VARCHAR(100) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT payment_mode_pkey PRIMARY KEY (id)
);

INSERT INTO public.payment_mode (id, name)
VALUES
    (1, 'Cash'),
    (2, 'Cheque'),
    (3, 'Online / UPI'),
    (4, 'Card'),
    (5, 'Demand Draft')
ON CONFLICT (id) DO NOTHING;
