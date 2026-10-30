ALTER TABLE "packages" ADD COLUMN "buy_start_time" text;--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN "buy_end_time" text;--> statement-breakpoint
ALTER TABLE "draws" DROP COLUMN "buy_start_at";--> statement-breakpoint
ALTER TABLE "draws" DROP COLUMN "buy_end_at";--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "pkg_buy_time_fmt" CHECK (("packages"."buy_start_time" IS NULL OR "packages"."buy_start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') AND ("packages"."buy_end_time" IS NULL OR "packages"."buy_end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'));--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "pkg_buy_time_pair" CHECK (("packages"."buy_start_time" IS NULL) = ("packages"."buy_end_time" IS NULL) AND ("packages"."buy_start_time" IS NULL OR "packages"."buy_start_time" <> "packages"."buy_end_time"));