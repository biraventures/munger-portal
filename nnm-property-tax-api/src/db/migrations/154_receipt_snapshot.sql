-- The full holding tax receipt exactly as it was printed at the moment of payment (everything receipt-view.tsx
-- renders: property details, floor-wise ARV/tax, particulars, arrear periods, payment details). Reprints - single and
-- the Tax Daroga's bulk print - render this, so they look exactly like the original. Receipts from before this
-- column are rebuilt from their settled demand notice's frozen snapshot instead (see getReceiptForReprint).
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS receipt_snapshot JSONB;
