import pg from "pg";

const db = new pg.Pool(process.env.SQL_HOST ? {
  host: process.env.SQL_HOST,
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  database: process.env.SQL_DB_NAME,
} : { connectionString: process.env.DATABASE_URL });
const apiKey = process.env.TOGETHER_API_KEY;
const apiBase = "https://api.together.ai/v2";
const trialLengthMs = 15 * 60 * 1000;

if (!apiKey) throw new Error("TOGETHER_API_KEY is not configured.");

async function request(path, method = "GET", body) {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  let result = null;
  try { result = text ? JSON.parse(text) : null; } catch { /* response checked below */ }
  if (!response.ok) throw new Error(`Provider cleanup request failed (${response.status}).`);
  return result;
}

async function updateTrial(uid, patch, expectedState) {
  await db.query(
    `UPDATE training_state SET data = data || $2::jsonb, updated_at = now()
     WHERE user_id = $1 AND kind = 'trial' AND data->>'state' = $3`,
    [uid, JSON.stringify(patch), expectedState],
  );
}

async function stopTrial(uid, trial) {
  if (trial.endpointId && trial.deploymentId) {
    await request(
      `/projects/${encodeURIComponent(trial.projectId)}/endpoints/${encodeURIComponent(trial.endpointId)}/deployments/${encodeURIComponent(trial.deploymentId)}`,
      "PATCH",
      { autoscaling: { minReplicas: 0, maxReplicas: 0 } },
    );
  }
  await updateTrial(uid, { state: "expired", stoppedAt: new Date().toISOString() }, trial.state);
}

const sessions = await db.query(
  `SELECT user_id, data FROM training_state
   WHERE kind = 'trial' AND data->>'state' IN ('starting', 'ready', 'failed')`,
);
let stopped = 0;
let errors = 0;
const now = Date.now();

for (const document of sessions.rows) {
  const trial = document.data;
  const uid = document.user_id;
  try {
    if (trial.state === "starting" && trial.endpointId && trial.deploymentId) {
      const deployment = await request(
        `/projects/${encodeURIComponent(trial.projectId)}/endpoints/${encodeURIComponent(trial.endpointId)}/deployments/${encodeURIComponent(trial.deploymentId)}`,
      );
      const state = String(deployment?.status?.state || deployment?.state || "");
      if (state.includes("READY") && !trial.expiresAt) {
        const readyAt = new Date();
        const expiresAt = new Date(readyAt.getTime() + trialLengthMs);
        await updateTrial(uid, { state: "ready", readyAt: readyAt.toISOString(), expiresAt: expiresAt.toISOString() }, "starting");
        continue;
      }
      const createdAt = Date.parse(trial.createdAt || "");
      if (state.includes("FAILED") || (Number.isFinite(createdAt) && now - createdAt > 45 * 60 * 1000)) {
        await stopTrial(uid, trial);
        stopped++;
      }
      continue;
    }
    if (trial.state === "ready" && Date.parse(trial.expiresAt || "") <= now) {
      await stopTrial(uid, trial);
      stopped++;
      continue;
    }
    if (trial.state === "failed") {
      await stopTrial(uid, trial);
      stopped++;
    }
  } catch {
    errors++;
  }
}

console.log(`Model trial cleanup finished: ${stopped} stopped, ${errors} retryable errors.`);
await db.end();
