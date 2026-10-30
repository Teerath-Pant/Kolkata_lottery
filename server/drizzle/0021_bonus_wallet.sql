ALTER TABLE "wallets" DROP CONSTRAINT "wallet_income_range";--> statement-breakpoint
-- No backfill: every bonus wallet starts at 0. Bonuses credited before this stay in the purchase wallet.
ALTER TABLE "wallets" ADD COLUMN "bonus_balance" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallet_split_range" CHECK ("wallets"."income_balance" >= 0 AND "wallets"."bonus_balance" >= 0 AND "wallets"."income_balance" + "wallets"."bonus_balance" <= "wallets"."balance");