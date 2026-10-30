ALTER TABLE "packages" DROP CONSTRAINT "pkg_one_schedule";--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN "run_once_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "pkg_one_schedule" CHECK (num_nonnulls("packages"."draw_interval_minutes", "packages"."daily_time", "packages"."run_once_at") = 1);