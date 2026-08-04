CREATE TABLE `admin_users` (
	`id` text PRIMARY KEY NOT NULL,
	`external_user_id` text,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'admin' NOT NULL,
	`status` text DEFAULT 'invited' NOT NULL,
	`invitation_token_hash` text,
	`invitation_expires_at` integer,
	`last_login_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_admin_users_email` ON `admin_users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_admin_users_external_id` ON `admin_users` (`external_user_id`);--> statement-breakpoint
CREATE INDEX `idx_admin_users_status_role` ON `admin_users` (`status`,`role`);--> statement-breakpoint
CREATE TABLE `applicant_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`applicant_id` text NOT NULL,
	`body` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`applicant_id`) REFERENCES `applicants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_applicant_notes_applicant` ON `applicant_notes` (`applicant_id`);--> statement-breakpoint
CREATE TABLE `applicant_status_history` (
	`id` text PRIMARY KEY NOT NULL,
	`applicant_id` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`changed_by` text,
	`changed_at` integer NOT NULL,
	FOREIGN KEY (`applicant_id`) REFERENCES `applicants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`changed_by`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_applicant_history_applicant` ON `applicant_status_history` (`applicant_id`);--> statement-breakpoint
CREATE TABLE `applicants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`university` text NOT NULL,
	`email` text NOT NULL,
	`division` text NOT NULL,
	`cv_key` text NOT NULL,
	`cv_filename` text NOT NULL,
	`cv_size` integer NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`privacy_acknowledged_at` integer NOT NULL,
	`privacy_policy_version` text NOT NULL,
	`source` text,
	`campaign` text,
	`submitted_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_applicants_email` ON `applicants` (`email`);--> statement-breakpoint
CREATE INDEX `idx_applicants_pipeline` ON `applicants` (`status`,`division`,`submitted_at`);--> statement-breakpoint
CREATE TABLE `application_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`open` integer DEFAULT true NOT NULL,
	`introduction` text DEFAULT '' NOT NULL,
	`closed_message` text DEFAULT '' NOT NULL,
	`notification_recipients` text DEFAULT '[]' NOT NULL,
	`privacy_policy_version` text DEFAULT '2026-08-04' NOT NULL,
	`updated_by` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	`ip_hash` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_audit_entity` ON `audit_log` (`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_actor` ON `audit_log` (`actor_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `background_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`error` text,
	`run_after` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_jobs_queue` ON `background_jobs` (`status`,`run_after`);--> statement-breakpoint
CREATE TABLE `content_entries` (
	`key` text PRIMARY KEY NOT NULL,
	`draft_value` text DEFAULT '{}' NOT NULL,
	`published_value` text DEFAULT '{}' NOT NULL,
	`updated_by` text,
	`updated_at` integer NOT NULL,
	`published_at` integer,
	FOREIGN KEY (`updated_by`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `publication_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`publication_id` text NOT NULL,
	`revision_number` integer NOT NULL,
	`source_pdf_key` text,
	`web_body` text NOT NULL,
	`parse_warnings` text DEFAULT '[]' NOT NULL,
	`note` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_publication_revision_number` ON `publication_revisions` (`publication_id`,`revision_number`);--> statement-breakpoint
CREATE TABLE `publications` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`publication_date` integer NOT NULL,
	`status` text DEFAULT 'uploaded' NOT NULL,
	`scheduled_at` integer,
	`authors` text DEFAULT '[]' NOT NULL,
	`chapter` text,
	`cover_image_key` text,
	`source_pdf_key` text,
	`web_body` text DEFAULT '[]' NOT NULL,
	`parser_version` text,
	`parse_warnings` text DEFAULT '[]' NOT NULL,
	`parse_error` text,
	`structured_metadata` text DEFAULT '{}' NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`search_text` text DEFAULT '' NOT NULL,
	`created_by` text,
	`updated_by` text,
	`published_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`published_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`published_by`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_publications_slug` ON `publications` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_publications_public_listing` ON `publications` (`status`,`type`,`publication_date`);--> statement-breakpoint
CREATE INDEX `idx_publications_scheduled` ON `publications` (`status`,`scheduled_at`);--> statement-breakpoint
CREATE TABLE `team_members` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`group_name` text NOT NULL,
	`photo_key` text,
	`photo_alt` text,
	`biography` text DEFAULT '' NOT NULL,
	`linkedin_url` text,
	`display_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_team_public_order` ON `team_members` (`active`,`group_name`,`display_order`);