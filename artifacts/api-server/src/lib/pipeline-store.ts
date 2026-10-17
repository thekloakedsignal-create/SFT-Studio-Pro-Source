import { randomUUID } from "node:crypto";
import { createPool } from "../db/index.ts";

const worker = randomUUID();
let ready: Promise<unknown> | undefined;
async function pool() {
  const connection = createPool();
  if (!connection) throw new Error("Persistent storage is required for background automation.");
  ready ??= connection.query(`CREATE TABLE IF NOT EXISTS automation_runs (
    project_id text PRIMARY KEY, user_id text NOT NULL, data jsonb NOT NULL,
    lease_owner text, lease_until timestamptz
  )`).catch(error => { ready = undefined; throw error; });
  await ready;
  return connection;
}

export async function loadPipeline(projectId: string, userId: string) {
  const result = await (await pool()).query(
    "SELECT data, lease_until > NOW() AS active FROM automation_runs WHERE project_id=$1 AND user_id=$2",
    [projectId, userId]
  );
  const row = result.rows[0];
  if (!row) return null;
  const job = row.data;
  if (!row.active && !["complete", "stopped", "error", "awaiting-gate"].includes(job.stage)) {
    job.stage = "interrupted";
  }
  return job;
}

// Atomic lease prevents two tabs/servers from running the same project concurrently.
export async function claimPipeline(job: any, fresh = false) {
  const result = await (await pool()).query(`
    INSERT INTO automation_runs (project_id,user_id,data,lease_owner,lease_until)
    VALUES ($1,$2,$3::jsonb,$4,NOW() + INTERVAL '90 seconds')
    ON CONFLICT (project_id) DO UPDATE SET data=EXCLUDED.data,
      lease_owner=EXCLUDED.lease_owner, lease_until=EXCLUDED.lease_until
    WHERE automation_runs.user_id=EXCLUDED.user_id
      AND (automation_runs.lease_until IS NULL OR automation_runs.lease_until < NOW())
      AND ($5=false OR automation_runs.data->>'stage' IN ('complete','stopped'))
    RETURNING project_id`,
    [job.projectId, job.userId, JSON.stringify(job), worker, fresh]
  );
  return result.rowCount === 1;
}

export async function checkpointPipeline(job: any, release = false) {
  const result = await (await pool()).query(`
    UPDATE automation_runs SET data=$3::jsonb,
      lease_until=CASE WHEN $5 THEN NULL ELSE NOW() + INTERVAL '90 seconds' END,
      lease_owner=CASE WHEN $5 THEN NULL ELSE $4 END
    WHERE project_id=$1 AND user_id=$2 AND lease_owner=$4 RETURNING project_id`,
    [job.projectId, job.userId, JSON.stringify(job), worker, release]
  );
  if (result.rowCount !== 1) throw new Error("Background worker lease was lost.");
}
