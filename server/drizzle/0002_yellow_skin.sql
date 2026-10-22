DROP INDEX "tickets_draw_user_uq";--> statement-breakpoint
CREATE INDEX "tickets_draw_user_idx" ON "tickets" USING btree ("draw_id","user_id");