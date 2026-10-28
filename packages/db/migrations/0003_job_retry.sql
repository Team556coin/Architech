ALTER TABLE "edit_jobs" ADD COLUMN "retry_of_job_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "edit_jobs_retry_of_idx" ON "edit_jobs" USING btree ("retry_of_job_id");