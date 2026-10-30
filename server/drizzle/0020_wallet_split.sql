ALTER TABLE "wallets" ADD COLUMN "income_balance" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallet_income_range" CHECK ("wallets"."income_balance" >= 0 AND "wallets"."income_balance" <= "wallets"."balance");--> statement-breakpoint
-- Backfill: replay every player's ledger with the same rules the app now uses (prizes -> income wallet, other credits ->
-- purchase wallet, debits take from purchase first), so existing balances split exactly as they would have.
DO $$
DECLARE
  r record;
  uid integer := NULL;
  p bigint := 0;
  i bigint := 0;
  take bigint;
BEGIN
  FOR r IN SELECT user_id, amount, type FROM wallet_ledger ORDER BY user_id, id LOOP
    IF uid IS DISTINCT FROM r.user_id THEN
      IF uid IS NOT NULL THEN
        UPDATE wallets SET income_balance = LEAST(i, balance) WHERE user_id = uid;
      END IF;
      uid := r.user_id; p := 0; i := 0;
    END IF;
    IF r.amount >= 0 THEN
      IF r.type = 'prize' THEN i := i + r.amount; ELSE p := p + r.amount; END IF;
    ELSE
      take := LEAST(p, -r.amount);
      p := p - take;
      i := GREATEST(0, i - (-r.amount - take));
    END IF;
  END LOOP;
  IF uid IS NOT NULL THEN
    UPDATE wallets SET income_balance = LEAST(i, balance) WHERE user_id = uid;
  END IF;
END $$;
