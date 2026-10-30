ALTER TABLE "wallets" DROP CONSTRAINT "wallet_split_range";--> statement-breakpoint
ALTER TABLE "wallets" ADD COLUMN "purchase_balance" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
-- the purchase wallet used to be whatever was left of balance; store it, so balance = purchase + income + bonus exactly
UPDATE "wallets" SET "purchase_balance" = "balance" - "income_balance" - "bonus_balance";--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallet_parts_nonneg" CHECK ("wallets"."purchase_balance" >= 0 AND "wallets"."income_balance" >= 0 AND "wallets"."bonus_balance" >= 0);--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallet_total_sum" CHECK ("wallets"."balance" = "wallets"."purchase_balance" + "wallets"."income_balance" + "wallets"."bonus_balance");