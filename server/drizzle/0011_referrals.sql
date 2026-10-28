CREATE TABLE "referral_tree" (
	"ancestor_id" integer NOT NULL,
	"descendant_id" integer NOT NULL,
	"depth" integer NOT NULL,
	CONSTRAINT "referral_tree_ancestor_id_descendant_id_pk" PRIMARY KEY("ancestor_id","descendant_id"),
	CONSTRAINT "referral_tree_depth_pos" CHECK ("referral_tree"."depth" >= 1)
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "referral_code" text DEFAULT upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)) NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "referred_by" integer;--> statement-breakpoint
ALTER TABLE "referral_tree" ADD CONSTRAINT "referral_tree_ancestor_id_users_id_fk" FOREIGN KEY ("ancestor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_tree" ADD CONSTRAINT "referral_tree_descendant_id_users_id_fk" FOREIGN KEY ("descendant_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "referral_tree_descendant_idx" ON "referral_tree" USING btree ("descendant_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_referred_by_users_id_fk" FOREIGN KEY ("referred_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_referred_by_idx" ON "users" USING btree ("referred_by");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_referral_code_unique" UNIQUE("referral_code");