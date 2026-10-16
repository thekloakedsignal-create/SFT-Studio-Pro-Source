import { listRecords, setRecord, trainingPool } from "../src/lib/training-records.mjs";
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

async function stopTrial(ref, trial) {
  if (trial.endpointId && trial.deploymentId) {
    await request(
      `/projects/${encodeURIComponent(trial.projectId)}/endpoints/${encodeURIComponent(trial.endpointId)}/deployments/${encodeURIComponent(trial.deploymentId)}`,
      "PATCH",
      { autoscaling: { minReplicas: 0, maxReplicas: 0 } },
    );
  }
  await ref.update({ state: "expired", stoppedAt: new Date().toISOString() });
}

const sessions = (await listRecords("trial"))
  .filter(document => ["starting", "ready", "failed"].includes(document.data.state));
let stopped = 0;
let errors = 0;
const now = Date.now();

for (const document of sessions) {
  const trial = document.data;
  const ref = { update: data => setRecord("trial", document.id, data) };
  try {
    if (trial.state === "starting" && trial.endpointId && trial.deploymentId) {
      const deployment = await request(
        `/projects/${encodeURIComponent(trial.projectId)}/endpoints/${encodeURIComponent(trial.endpointId)}/deployments/${encodeURIComponent(trial.deploymentId)}`,
      );
      const state = String(deployment?.status?.state || deployment?.state || "");
      if (state.includes("READY") && !trial.expiresAt) {
        const readyAt = new Date();
        const expiresAt = new Date(readyAt.getTime() + trialLengthMs);
        await ref.update({ state: "ready", readyAt: readyAt.toISOString(), expiresAt: expiresAt.toISOString() });
        continue;
      }
      const createdAt = Date.parse(trial.createdAt || "");
      if (state.includes("FAILED") || (Number.isFinite(createdAt) && now - createdAt > 45 * 60 * 1000)) {
        await stopTrial(ref, trial);
        stopped++;
      }
      continue;
    }
    if (trial.state === "ready" && Date.parse(trial.expiresAt || "") <= now) {
      await stopTrial(ref, trial);
      stopped++;
      continue;
    }
    if (trial.state === "failed") {
      await stopTrial(ref, trial);
      stopped++;
    }
  } catch {
    errors++;
  }
}

console.log(`Model trial cleanup finished: ${stopped} stopped, ${errors} retryable errors.`);
await trainingPool().end();
