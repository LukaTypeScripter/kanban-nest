ALTER TABLE "refresh_tokens" ALTER COLUMN "user_id" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD COLUMN "jti" text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_tokens_jti_idx" ON "refresh_tokens" USING btree ("jti");