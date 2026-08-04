export const MAINTENANCE_FRESHNESS_MS = 20 * 60 * 1_000;

export function maintenanceSuccessIsRecent(
  lastCompletedAt: number | null | undefined,
  now = Date.now(),
): boolean {
  return (
    typeof lastCompletedAt === "number" &&
    Number.isFinite(lastCompletedAt) &&
    lastCompletedAt <= now &&
    lastCompletedAt > now - MAINTENANCE_FRESHNESS_MS
  );
}
