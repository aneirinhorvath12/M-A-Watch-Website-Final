ALTER TABLE `publications` ADD `edit_version` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TRIGGER publications_edit_version
AFTER UPDATE ON publications
WHEN NEW.edit_version = OLD.edit_version
BEGIN
  UPDATE publications SET
    edit_version = OLD.edit_version + 1,
    status = CASE WHEN NEW.web_body != OLD.web_body AND NEW.status IN ('review', 'scheduled') THEN 'draft' ELSE NEW.status END,
    scheduled_at = CASE WHEN NEW.web_body != OLD.web_body AND NEW.status IN ('review', 'scheduled') THEN NULL ELSE NEW.scheduled_at END
  WHERE id = NEW.id;
END;
--> statement-breakpoint
-- Existing approvals cannot be tied to a verified body revision. Re-review them.
UPDATE publications SET status = 'draft', scheduled_at = NULL
WHERE type != 'markets' AND status IN ('review', 'scheduled');
