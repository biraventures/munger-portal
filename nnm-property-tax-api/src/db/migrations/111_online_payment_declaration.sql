-- Public online payments: the payer must tick a declaration before paying. The moment it was accepted is stored
-- on the transaction so the receipt can show it as a ticked declaration. NULL for counter / operator payments.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS online_declaration_accepted_at TIMESTAMPTZ;
