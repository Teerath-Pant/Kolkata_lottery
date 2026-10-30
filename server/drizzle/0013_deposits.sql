CREATE TYPE "public"."deposit_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
ALTER TYPE "public"."ledger_type" ADD VALUE 'deposit';--> statement-breakpoint
CREATE TABLE "deposit_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"amount" bigint NOT NULL,
	"utr" text,
	"status" "deposit_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" integer,
	CONSTRAINT "deposit_amount_pos" CHECK ("deposit_requests"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "deposit_requests" ADD CONSTRAINT "deposit_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposit_requests" ADD CONSTRAINT "deposit_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deposits_user_created_idx" ON "deposit_requests" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "deposits_status_idx" ON "deposit_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "deposits_utr_uq" ON "deposit_requests" USING btree ("utr") WHERE utr IS NOT NULL AND status <> 'rejected';