DROP INDEX "tier_winner_once_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "tier_winner_once_idx" ON "draw_tier_winners" USING btree ("draw_id","ticket_no");