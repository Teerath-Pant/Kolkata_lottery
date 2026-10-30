CREATE TABLE "complaint_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"complaint_id" integer NOT NULL,
	"mime" text NOT NULL,
	"data" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "complaint_images" ADD CONSTRAINT "complaint_images_complaint_id_complaints_id_fk" FOREIGN KEY ("complaint_id") REFERENCES "public"."complaints"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "complaint_images_complaint_idx" ON "complaint_images" USING btree ("complaint_id");