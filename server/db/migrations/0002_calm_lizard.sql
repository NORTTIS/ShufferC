ALTER TABLE "save_states" ADD COLUMN "user_id" uuid;--> statement-breakpoint
CREATE INDEX "save_states_user_id_idx" ON "save_states" USING btree ("user_id");