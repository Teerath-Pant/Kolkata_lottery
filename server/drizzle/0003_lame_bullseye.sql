ALTER TABLE "packages" DROP CONSTRAINT "pkg_min_range";--> statement-breakpoint
ALTER TABLE "draws" DROP COLUMN "min_tickets";--> statement-breakpoint
ALTER TABLE "packages" DROP COLUMN "min_tickets";