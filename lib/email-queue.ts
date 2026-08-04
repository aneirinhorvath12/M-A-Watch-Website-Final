import { ensureDatabase } from "@/db/bootstrap";
import { createId, database } from "@/lib/platform";

export type EmailJob = {
  template:
    | "applicant-confirmation"
    | "new-application-admin"
    | "account-invitation"
    | "account-disabled";
  to: string[];
  data: Record<string, string>;
};

export async function queueEmail(job: EmailJob): Promise<string> {
  await ensureDatabase();
  const id = createId("job");
  const now = Date.now();
  await database()
    .prepare(
      `INSERT INTO background_jobs
       (id, type, status, payload, attempts, run_after, created_at, updated_at)
       VALUES (?, 'email', 'queued', ?, 0, ?, ?, ?)`,
    )
    .bind(id, JSON.stringify(job), now, now, now)
    .run();
  return id;
}
