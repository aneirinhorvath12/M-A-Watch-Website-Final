import { ensureDatabase } from "@/db/bootstrap";
import { createId, database } from "@/lib/platform";

export type AuditInput = {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function writeAudit(input: AuditInput): Promise<void> {
  await ensureDatabase();
  await database()
    .prepare(
      `INSERT INTO audit_log
       (id, actor_id, action, entity_type, entity_id, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      createId("audit"),
      input.actorId ?? null,
      input.action,
      input.entityType,
      input.entityId ?? null,
      JSON.stringify(input.metadata ?? {}),
      Date.now(),
    )
    .run();
}
