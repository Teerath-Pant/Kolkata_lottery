ALTER TABLE "draws" ADD COLUMN "package_name" text;--> statement-breakpoint
ALTER TABLE "draws" ADD COLUMN "theme" "theme";--> statement-breakpoint
-- existing draws take the package's current name / theme (what they showed until now); from here on each draw keeps its own copy
UPDATE "draws" d SET "package_name" = p."name", "theme" = p."theme" FROM "packages" p WHERE p."id" = d."package_id";--> statement-breakpoint
ALTER TABLE "draws" ALTER COLUMN "package_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "draws" ALTER COLUMN "theme" SET NOT NULL;
