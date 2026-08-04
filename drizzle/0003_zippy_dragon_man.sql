ALTER TABLE `applicants` ADD `retention_expires_at` integer;--> statement-breakpoint
ALTER TABLE `applicants` ADD `deletion_requested_at` integer;--> statement-breakpoint
ALTER TABLE `applicants` ADD `deletion_requested_by` text REFERENCES admin_users(id);--> statement-breakpoint
CREATE INDEX `idx_applicants_retention` ON `applicants` (`retention_expires_at`,`deletion_requested_at`);--> statement-breakpoint
ALTER TABLE `application_settings` ADD `retention_days` integer;