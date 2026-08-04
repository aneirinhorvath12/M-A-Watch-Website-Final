CREATE TABLE `analytics_daily` (
	`day` text NOT NULL,
	`event` text NOT NULL,
	`dimension_name` text NOT NULL,
	`dimension_value` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`day`, `event`, `dimension_name`, `dimension_value`)
);
--> statement-breakpoint
CREATE INDEX `idx_analytics_daily_event_day` ON `analytics_daily` (`event`,`day`);