ALTER TABLE "packages" DROP CONSTRAINT "pkg_interval_pos";--> statement-breakpoint
ALTER TABLE "packages" ALTER COLUMN "draw_interval_minutes" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN "daily_time" text;--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "pkg_daily_time_fmt" CHECK ("packages"."daily_time" IS NULL OR "packages"."daily_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "pkg_one_schedule" CHECK (("packages"."draw_interval_minutes" IS NULL) <> ("packages"."daily_time" IS NULL));--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "pkg_interval_pos" CHECK ("packages"."draw_interval_minutes" IS NULL OR "packages"."draw_interval_minutes" > 0);