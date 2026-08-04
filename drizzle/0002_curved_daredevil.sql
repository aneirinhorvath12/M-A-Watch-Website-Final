PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_application_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`open` integer DEFAULT false NOT NULL,
	`introduction` text DEFAULT '' NOT NULL,
	`closed_message` text DEFAULT '' NOT NULL,
	`notification_recipients` text DEFAULT '[]' NOT NULL,
	`privacy_policy_version` text DEFAULT '2026-08-04' NOT NULL,
	`updated_by` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_application_settings`("id", "open", "introduction", "closed_message", "notification_recipients", "privacy_policy_version", "updated_by", "updated_at") SELECT "id", "open", "introduction", "closed_message", "notification_recipients", "privacy_policy_version", "updated_by", "updated_at" FROM `application_settings`;--> statement-breakpoint
DROP TABLE `application_settings`;--> statement-breakpoint
ALTER TABLE `__new_application_settings` RENAME TO `application_settings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;