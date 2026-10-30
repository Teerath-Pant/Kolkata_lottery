ALTER TABLE "wallet_ledger" ADD COLUMN "note" text;--> statement-breakpoint
CREATE INDEX "ledger_created_idx" ON "wallet_ledger" USING btree ("created_at","id");