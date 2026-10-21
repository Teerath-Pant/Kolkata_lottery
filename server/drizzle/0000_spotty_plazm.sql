CREATE TYPE "public"."draw_mode" AS ENUM('random', 'admin_selected');--> statement-breakpoint
CREATE TYPE "public"."draw_status" AS ENUM('open', 'drawing', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ledger_type" AS ENUM('signup_bonus', 'daily_claim', 'ticket_purchase', 'prize', 'refund', 'admin_adjust');--> statement-breakpoint
CREATE TYPE "public"."prize_type" AS ENUM('fixed', 'pool_percent');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."theme" AS ENUM('green', 'red', 'blue');--> statement-breakpoint
CREATE TABLE "admin_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_id" integer,
	"action" text NOT NULL,
	"draw_id" integer,
	"payload" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "draws" (
	"id" serial PRIMARY KEY NOT NULL,
	"package_id" integer NOT NULL,
	"draw_time" timestamp with time zone NOT NULL,
	"status" "draw_status" DEFAULT 'open' NOT NULL,
	"mode" "draw_mode" DEFAULT 'random' NOT NULL,
	"selected_ticket_no" integer,
	"winning_ticket_no" integer,
	"winner_user_id" integer,
	"prize_amount" bigint,
	"win_method" text,
	"ticket_price" bigint NOT NULL,
	"prize_type" "prize_type" NOT NULL,
	"prize_value" bigint NOT NULL,
	"max_tickets" integer NOT NULL,
	"min_tickets" integer NOT NULL,
	"server_seed_hash" text NOT NULL,
	"server_seed" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" text NOT NULL,
	"user_id" integer NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"price" bigint NOT NULL,
	"prize_type" "prize_type" NOT NULL,
	"prize_value" bigint NOT NULL,
	"max_tickets" integer NOT NULL,
	"min_tickets" integer NOT NULL,
	"draw_interval_minutes" integer NOT NULL,
	"theme" "theme" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "pkg_price_pos" CHECK ("packages"."price" > 0),
	CONSTRAINT "pkg_max_range" CHECK ("packages"."max_tickets" BETWEEN 1 AND 9999),
	CONSTRAINT "pkg_min_range" CHECK ("packages"."min_tickets" BETWEEN 0 AND "packages"."max_tickets"),
	CONSTRAINT "pkg_interval_pos" CHECK ("packages"."draw_interval_minutes" > 0)
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"draw_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"ticket_no" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"mobile" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_mobile_unique" UNIQUE("mobile")
);
--> statement-breakpoint
CREATE TABLE "wallet_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"amount" bigint NOT NULL,
	"type" "ledger_type" NOT NULL,
	"ref_id" integer,
	"balance_after" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_balance_nonneg" CHECK ("wallets"."balance" >= 0)
);
--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_draw_id_draws_id_fk" FOREIGN KEY ("draw_id") REFERENCES "public"."draws"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draws" ADD CONSTRAINT "draws_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draws" ADD CONSTRAINT "draws_winner_user_id_users_id_fk" FOREIGN KEY ("winner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_draw_id_draws_id_fk" FOREIGN KEY ("draw_id") REFERENCES "public"."draws"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "admin_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "draws_pkg_status_idx" ON "draws" USING btree ("package_id","status");--> statement-breakpoint
CREATE INDEX "draws_status_time_idx" ON "draws" USING btree ("status","draw_time");--> statement-breakpoint
CREATE UNIQUE INDEX "one_open_draw_per_package" ON "draws" USING btree ("package_id") WHERE status = 'open';--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_draw_no_uq" ON "tickets" USING btree ("draw_id","ticket_no");--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_draw_user_uq" ON "tickets" USING btree ("draw_id","user_id");--> statement-breakpoint
CREATE INDEX "tickets_user_idx" ON "tickets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ledger_user_created_idx" ON "wallet_ledger" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_pay_once_idx" ON "wallet_ledger" USING btree ("user_id","ref_id","type") WHERE type IN ('prize','refund');