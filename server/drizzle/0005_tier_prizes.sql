CREATE TABLE "draw_tier_prizes" (
	"draw_id" integer NOT NULL,
	"match_digits" integer NOT NULL,
	"prize" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "draw_tier_prizes_draw_id_match_digits_pk" PRIMARY KEY("draw_id","match_digits"),
	CONSTRAINT "draw_tier_digits_range" CHECK ("draw_tier_prizes"."match_digits" BETWEEN 1 AND 5),
	CONSTRAINT "draw_tier_prize_nonneg" CHECK ("draw_tier_prizes"."prize" >= 0)
);
--> statement-breakpoint
CREATE TABLE "draw_tier_winners" (
	"id" serial PRIMARY KEY NOT NULL,
	"draw_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"ticket_no" integer NOT NULL,
	"match_digits" integer NOT NULL,
	"prize" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tier_winner_digits_range" CHECK ("draw_tier_winners"."match_digits" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "package_tier_prizes" (
	"package_id" integer NOT NULL,
	"match_digits" integer NOT NULL,
	"prize" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "package_tier_prizes_package_id_match_digits_pk" PRIMARY KEY("package_id","match_digits"),
	CONSTRAINT "pkg_tier_digits_range" CHECK ("package_tier_prizes"."match_digits" BETWEEN 1 AND 5),
	CONSTRAINT "pkg_tier_prize_nonneg" CHECK ("package_tier_prizes"."prize" >= 0)
);
--> statement-breakpoint
ALTER TABLE "draw_tier_prizes" ADD CONSTRAINT "draw_tier_prizes_draw_id_draws_id_fk" FOREIGN KEY ("draw_id") REFERENCES "public"."draws"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draw_tier_winners" ADD CONSTRAINT "draw_tier_winners_draw_id_draws_id_fk" FOREIGN KEY ("draw_id") REFERENCES "public"."draws"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draw_tier_winners" ADD CONSTRAINT "draw_tier_winners_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_tier_prizes" ADD CONSTRAINT "package_tier_prizes_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tier_winner_once_idx" ON "draw_tier_winners" USING btree ("draw_id","user_id");--> statement-breakpoint
CREATE INDEX "tier_winner_draw_idx" ON "draw_tier_winners" USING btree ("draw_id");