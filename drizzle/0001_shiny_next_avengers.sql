CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window_started_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_rate_limits_expiry` ON `rate_limits` (`expires_at`);--> statement-breakpoint
ALTER TABLE `applicants` ADD `submission_key` text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_applicants_submission_key` ON `applicants` (`submission_key`);