CREATE TABLE `maintenance_state` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`last_completed_at` integer,
	`updated_at` integer NOT NULL
);--> statement-breakpoint
DELETE FROM `audit_log`
WHERE `entity_type` = 'applicant'
  AND `entity_id` IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM `applicants`
    WHERE `applicants`.`id` = `audit_log`.`entity_id`
  );--> statement-breakpoint
DELETE FROM `background_jobs`
WHERE `type` = 'applicant_delete' AND `status` = 'succeeded';--> statement-breakpoint
UPDATE `background_jobs`
SET `status` = 'queued', `attempts` = 0, `error` = NULL,
    `claim_token` = NULL, `run_after` = 0, `updated_at` = 0
WHERE `type` = 'applicant_delete' AND `status` = 'failed'
  AND json_valid(`payload`)
  AND json_extract(`payload`, '$.applicationId') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM `applicants`
    WHERE `applicants`.`id` = json_extract(
      `background_jobs`.`payload`, '$.applicationId'
    )
  );--> statement-breakpoint
DELETE FROM `background_jobs`
WHERE `type` <> 'applicant_delete'
  AND json_valid(`payload`)
  AND COALESCE(
    json_extract(`payload`, '$.applicationId'),
    json_extract(`payload`, '$.data.applicationId')
  ) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM `applicants`
    WHERE `applicants`.`id` = COALESCE(
      json_extract(`background_jobs`.`payload`, '$.applicationId'),
      json_extract(`background_jobs`.`payload`, '$.data.applicationId')
    )
  );
