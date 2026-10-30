CREATE TYPE "public"."withdrawal_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
ALTER TYPE "public"."ledger_type" ADD VALUE 'withdrawal';--> statement-breakpoint
CREATE TABLE "withdrawal_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"amount" bigint NOT NULL,
	"upi_id" text NOT NULL,
	"holder_name" text NOT NULL,
	"from_income" bigint DEFAULT 0 NOT NULL,
	"from_purchase" bigint DEFAULT 0 NOT NULL,
	"from_bonus" bigint DEFAULT 0 NOT NULL,
	"status" "withdrawal_status" DEFAULT 'pending' NOT NULL,
	"payout_ref" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" integer,
	CONSTRAINT "withdrawal_amount_pos" CHECK ("withdrawal_requests"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "withdrawals_user_created_idx" ON "withdrawal_requests" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "withdrawals_status_idx" ON "withdrawal_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "withdrawals_one_pending_uq" ON "withdrawal_requests" USING btree ("user_id") WHERE status = 'pending';