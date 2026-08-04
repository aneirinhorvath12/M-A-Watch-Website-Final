export const JOB_MAX_ATTEMPTS = 5;
export const JOB_LEASE_MS = 5 * 60 * 1000;
export const JOB_REQUEST_TIMEOUT_MS = 30 * 1000;

export function jobRetryDelayMs(attempts: number): number {
  const boundedAttempts = Math.max(1, Math.min(Math.floor(attempts), 16));
  return Math.min(60 * 60 * 1000, 2 ** boundedAttempts * 30_000);
}

export function jobIdempotencyKey(job: { id: string; type: string }): string {
  return `ma-watch:${job.type}:${job.id}`;
}
