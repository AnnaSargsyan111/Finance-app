CREATE SCHEMA "watch";
--> statement-breakpoint
CREATE TABLE "watch"."recommendation_watch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"recommendation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"baseline" jsonb,
	"last_checked_at" timestamp with time zone,
	"last_emailed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "watch_user_rec_uq" ON "watch"."recommendation_watch" USING btree ("user_id","recommendation_id");--> statement-breakpoint
CREATE INDEX "watch_user_idx" ON "watch"."recommendation_watch" USING btree ("user_id");