-- Hard cap: at most 5 operator accounts, enforced in the database itself
-- (not just the application layer) so it holds even if someone inserts
-- directly via psql/pgAdmin. Per NNM's requirement: "5 operators at once
-- maximum". This limits total accounts, not concurrent sessions — there's
-- no session table in this schema, so "5 logged in at once" isn't a
-- meaningful distinction here (each login just issues a stateless JWT).

CREATE OR REPLACE FUNCTION enforce_max_operators() RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT count(*) FROM operators) >= 5 THEN
    RAISE EXCEPTION 'Cannot create more than 5 operator accounts';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_max_operators
  BEFORE INSERT ON operators
  FOR EACH ROW
  EXECUTE FUNCTION enforce_max_operators();