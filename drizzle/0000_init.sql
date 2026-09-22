CREATE SCHEMA "auth";
--> statement-breakpoint
CREATE SCHEMA "pf";
--> statement-breakpoint
CREATE SCHEMA "market";
--> statement-breakpoint
CREATE SCHEMA "invest";
--> statement-breakpoint
CREATE TABLE "auth"."account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."rate_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"key" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth"."user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "auth"."verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pf"."period" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"income" numeric(15, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pf_period_kind_chk" CHECK ("pf"."period"."kind" in ('month','custom')),
	CONSTRAINT "pf_period_dates_chk" CHECK ("pf"."period"."start_date" <= "pf"."period"."end_date"),
	CONSTRAINT "pf_period_income_chk" CHECK ("pf"."period"."income" is null or "pf"."period"."income" >= 0)
);
--> statement-breakpoint
CREATE TABLE "pf"."period_expense" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_id" uuid NOT NULL,
	"category_key" text,
	"label" text NOT NULL,
	"is_custom" boolean DEFAULT false NOT NULL,
	"amount" numeric(15, 2),
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "pf_period_expense_amount_chk" CHECK ("pf"."period_expense"."amount" is null or "pf"."period_expense"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "market"."cache_entry" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market"."cache_lock" (
	"key" text PRIMARY KEY NOT NULL,
	"locked_until" timestamp with time zone NOT NULL,
	"owner" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market"."fundamentals" (
	"symbol" text NOT NULL,
	"fiscal_year" integer NOT NULL,
	"revenue" numeric(24, 2),
	"net_income" numeric(24, 2),
	"eps_diluted" numeric(18, 6),
	"gross_profit" numeric(24, 2),
	"operating_income" numeric(24, 2),
	"equity" numeric(24, 2),
	"assets" numeric(24, 2),
	"liabilities" numeric(24, 2),
	"op_cash_flow" numeric(24, 2),
	"capex" numeric(24, 2),
	"dividends_per_share" numeric(18, 6),
	"shares_out" numeric(24, 0),
	"sources" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fundamentals_symbol_fiscal_year_pk" PRIMARY KEY("symbol","fiscal_year")
);
--> statement-breakpoint
CREATE TABLE "market"."fx_rate" (
	"iso" text NOT NULL,
	"rate_date" date NOT NULL,
	"rate" numeric(18, 8) NOT NULL,
	"amount" integer DEFAULT 1 NOT NULL,
	"diff" numeric(18, 8),
	"source" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fx_rate_iso_rate_date_pk" PRIMARY KEY("iso","rate_date")
);
--> statement-breakpoint
CREATE TABLE "market"."job_run" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"job" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"stats" jsonb
);
--> statement-breakpoint
CREATE TABLE "market"."news_item" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"source" text NOT NULL,
	"url" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"region" text NOT NULL,
	"category" text NOT NULL,
	"topic" text NOT NULL,
	"summary" text,
	"image_url" text,
	"feed_id" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market"."price_daily" (
	"symbol" text NOT NULL,
	"date" date NOT NULL,
	"close" double precision NOT NULL,
	"adj_close" double precision NOT NULL,
	"volume" bigint,
	"source" text DEFAULT 'unknown' NOT NULL,
	CONSTRAINT "price_daily_symbol_date_pk" PRIMARY KEY("symbol","date")
);
--> statement-breakpoint
CREATE TABLE "market"."snapshot" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"as_of" date NOT NULL,
	"methodology_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market"."snapshot_pointer" (
	"name" text PRIMARY KEY NOT NULL,
	"snapshot_id" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market"."universe" (
	"symbol" text PRIMARY KEY NOT NULL,
	"cik" text,
	"name" text NOT NULL,
	"sector" text,
	"industry" text,
	"in_index" boolean DEFAULT true NOT NULL,
	"drop_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invest"."saved_recommendation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"mode" text NOT NULL,
	"inputs" jsonb NOT NULL,
	"usd_rate" numeric(18, 8) NOT NULL,
	"result" jsonb NOT NULL,
	"benchmark_summary" jsonb,
	"methodology_version" text NOT NULL,
	"snapshot_date" date NOT NULL,
	"result_hash" text NOT NULL,
	CONSTRAINT "invest_saved_mode_chk" CHECK ("invest"."saved_recommendation"."mode" in ('single','portfolio'))
);
--> statement-breakpoint
ALTER TABLE "auth"."account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pf"."period_expense" ADD CONSTRAINT "period_expense_period_id_period_id_fk" FOREIGN KEY ("period_id") REFERENCES "pf"."period"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "auth"."account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rate_event_lookup_idx" ON "auth"."rate_event" USING btree ("scope","key","occurred_at");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "auth"."session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "auth"."verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "pf_period_user_range_uq" ON "pf"."period" USING btree ("user_id","start_date","end_date");--> statement-breakpoint
CREATE INDEX "pf_period_user_start_idx" ON "pf"."period" USING btree ("user_id","start_date");--> statement-breakpoint
CREATE UNIQUE INDEX "pf_period_expense_label_uq" ON "pf"."period_expense" USING btree ("period_id",lower("label"));--> statement-breakpoint
CREATE INDEX "news_item_published_idx" ON "market"."news_item" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "price_daily_date_idx" ON "market"."price_daily" USING btree ("date");--> statement-breakpoint
CREATE INDEX "snapshot_as_of_idx" ON "market"."snapshot" USING btree ("as_of");--> statement-breakpoint
CREATE UNIQUE INDEX "invest_saved_user_hash_uq" ON "invest"."saved_recommendation" USING btree ("user_id","result_hash");--> statement-breakpoint
CREATE INDEX "invest_saved_user_created_idx" ON "invest"."saved_recommendation" USING btree ("user_id","created_at");