ALTER TABLE "packages" ADD COLUMN "buy_start_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN "buy_end_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "pkg_buy_at_pair" CHECK (("packages"."buy_start_at" IS NULL) = ("packages"."buy_end_at" IS NULL) AND ("packages"."buy_start_at" IS NULL OR "packages"."buy_start_at" < "packages"."buy_end_at"));--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "pkg_buy_one_window" CHECK ("packages"."buy_start_at" IS NULL OR "packages"."buy_start_time" IS NULL);