import { database } from "@/lib/platform";
import { maintenanceSuccessIsRecent } from "@/lib/maintenance-policy";

export async function hasRecentMaintenanceSuccess(
  now = Date.now(),
): Promise<boolean> {
  const state = await database()
    .prepare("SELECT last_completed_at FROM maintenance_state WHERE id = 1")
    .first<{ last_completed_at: number | null }>();
  return maintenanceSuccessIsRecent(state?.last_completed_at, now);
}

export async function recordMaintenanceSuccess(now = Date.now()): Promise<void> {
  await database()
    .prepare(
      `INSERT INTO maintenance_state (id, last_completed_at, updated_at)
       VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         last_completed_at = excluded.last_completed_at,
         updated_at = excluded.updated_at`,
    )
    .bind(now, now)
    .run();
}
