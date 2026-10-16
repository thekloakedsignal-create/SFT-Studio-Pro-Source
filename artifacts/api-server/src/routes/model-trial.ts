import { Router, type IRouter } from "express";
import { optionalAuth, type AuthRequest } from "../middleware/auth.ts";
import { createRecord, deleteRecord, getRecord, setRecord } from "../lib/training-records.mjs";
import { ownedTrainingJobs, rememberJobStatus } from "../lib/training-jobs.ts";
import { logger } from "../lib/logger.ts";

const TOGETHER_V1 = "https://api.together.ai/v1";
const TOGETHER_V2 = "https://api.together.ai/v2";
const TRIAL_LENGTH_MS = 15 * 60 * 1000;

type TrialSession = {
  state: "starting" | "ready" | "expired" | "failed";
  used: boolean;
  jobId: string;
  modelName: string;
  projectId: string;
  endpointId?: string;
  endpointName?: string;
  deploymentId?: string;
  createdAt: string;
  readyAt?: string;
  expiresAt?: string;
};

const router: IRouter = Router();
router.use(optionalAuth);

function userId(req: AuthRequest, res: any): string | null {
  const uid = req.user?.uid;
  if (!uid) {
    res.status(401).json({ success: false, error: "Sign in to use model chat." });
    return null;
  }
  return uid;
}

function trialRef(uid: string) {
  return {
    get: async () => {
      const data = await getRecord("trial", uid);
      return { exists: data !== null, data: () => data };
    },
    update: (data: Record<string, unknown>) => setRecord("trial", uid, data),
    set: (data: Record<string, unknown>) => setRecord("trial", uid, data),
    delete: () => deleteRecord("trial", uid),
  };
}

async function togetherRequest(base: string, route: string, init: RequestInit = {}) {
  const apiKey = process.env.TOGETHER_API_KEY;
  if (!apiKey) throw new Error("Model chat is not configured.");
  const response = await fetch(`${base}${route}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    signal: init.signal || AbortSignal.timeout(20000),
  });
  const text = await response.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* handled below */ }
  if (!response.ok) throw new Error(`Provider request failed (${response.status}).`);
  return body;
}

async function loadLatestCompletedModel(uid: string) {
  const jobs = await ownedTrainingJobs(uid);
  for (const { id: jobId, data: saved } of jobs.reverse()) {
    if (["error", "user_error", "failed", "cancelled"].includes(saved.status)) continue;
    const job = await togetherRequest(TOGETHER_V1, `/fine-tunes/${encodeURIComponent(jobId)}`);
    await rememberJobStatus(uid, jobId, job);
    if (String(job?.status || "").trim().toLowerCase() !== "completed") continue;
    const modelId = job?.model_object_id || saved.modelId;
    if (typeof modelId !== "string") continue;
    let projectId = job?.project_id || job?.projectId || saved.projectId;
    if (!projectId) {
      const identity = await togetherRequest(TOGETHER_V1, "/whoami");
      projectId = identity?.project_id;
      if (typeof projectId !== "string" || !projectId) {
        throw new Error("Together did not return the trained model's project ID.");
      }
      await setRecord("job", jobId, { projectId });
    }
    return {
      jobId, modelId, projectId,
      modelName: String(job?.model_object_name || job?.model_output_name || job?.output_name || saved.outputName || "Trained model"),
    };
  }
  return null;
}

function selectConfig(configs: any[]) {
  return configs
    .filter((config) => typeof config?.id === "string")
    .sort((a, b) => {
      const count = (item: any) => Number(item?.selectors?.find((s: any) => s.key === "accelerator_count")?.value) || 999;
      return count(a) - count(b);
    })[0];
}

router.get("/finetune/model-trial/status", async (req: AuthRequest, res) => {
  const uid = userId(req, res);
  if (!uid) return;
  try {
    res.setHeader("Cache-Control", "no-store");
    const snapshot = await trialRef(uid).get();
    const trial = snapshot.exists ? snapshot.data() as TrialSession : null;
    // An existing chat session does not depend on the training API remaining up.
    const latest = trial ? null : await loadLatestCompletedModel(uid);
    if (trial?.state === "starting" && trial.endpointId && trial.deploymentId) {
      try {
        const deployment = await togetherRequest(
          TOGETHER_V2,
          `/projects/${encodeURIComponent(trial.projectId)}/endpoints/${encodeURIComponent(trial.endpointId)}/deployments/${encodeURIComponent(trial.deploymentId)}`,
        );
        if (String(deployment?.status?.state || deployment?.state || "").includes("READY")) {
          const now = new Date();
          const expiresAt = new Date(now.getTime() + TRIAL_LENGTH_MS);
          await trialRef(uid).update({ state: "ready", readyAt: now.toISOString(), expiresAt: expiresAt.toISOString() });
          trial.state = "ready";
          trial.readyAt = now.toISOString();
          trial.expiresAt = expiresAt.toISOString();
        }
        if (String(deployment?.status?.state || deployment?.state || "").includes("FAILED")) {
          await trialRef(uid).update({ state: "failed" });
          trial.state = "failed";
        }
      } catch {
        // Keep the persisted status and let the next poll retry.
      }
    }
    const expires = trial?.expiresAt ? Date.parse(trial.expiresAt) : null;
    return res.json({
      success: true,
      availableModelName: latest?.modelName || null,
      available: Boolean(latest && !trial),
      trial: trial ? {
        state: trial.state,
        modelName: trial.modelName,
        expiresAt: trial.expiresAt || null,
        remainingMs: trial.state === "ready" && expires ? Math.max(0, expires - Date.now()) : null,
      } : null,
    });
  } catch (error) {
    logger.warn({ error: String(error) }, "Model chat status could not be loaded");
    return res.status(502).json({ success: false, error: "Could not load model chat status." });
  }
});

router.post("/finetune/model-trial/start", async (req: AuthRequest, res) => {
  const uid = userId(req, res);
  if (!uid) return;
  let endpointId: string | undefined;
  let deploymentId: string | undefined;
  let projectId = "";
  let reserved = false;
  try {
    const model = await loadLatestCompletedModel(uid);
    if (!model) return res.status(409).json({ success: false, error: "Complete a training run before starting model chat." });
    projectId = model.projectId;

    const modelConfigs = await togetherRequest(
      TOGETHER_V2,
      `/projects/${encodeURIComponent(projectId)}/configs?referenceModel=${encodeURIComponent(`projects/${projectId}/models/${model.modelId}`)}`,
    );
    const config = selectConfig(Array.isArray(modelConfigs?.data) ? modelConfigs.data : []);
    if (!config) return res.status(422).json({ success: false, error: "This model is not available for chat yet." });

    const ref = trialRef(uid);
    const created = await createRecord("trial", uid, {
        state: "starting",
        used: true,
        jobId: model.jobId,
        modelName: model.modelName,
        projectId,
        createdAt: new Date().toISOString(),
    } satisfies TrialSession);
    if (!created) throw new Error("TRIAL_ALREADY_USED");
    reserved = true;

    const endpoint = await togetherRequest(TOGETHER_V2, `/projects/${encodeURIComponent(projectId)}/endpoints`, {
      method: "POST",
      body: JSON.stringify({ name: `sft-chat-${Date.now().toString(36)}`, visibility: "VISIBILITY_PRIVATE" }),
    });
    endpointId = endpoint?.id;
    if (!endpointId) throw new Error("Endpoint setup failed.");
    const endpointName = endpoint?.name;
    await ref.update({ endpointId, endpointName });

    const deployment = await togetherRequest(
      TOGETHER_V2,
      `/projects/${encodeURIComponent(projectId)}/endpoints/${encodeURIComponent(endpointId)}/deployments`,
      {
        method: "POST",
        body: JSON.stringify({
          name: "model-chat",
          model: `projects/${projectId}/models/${model.modelId}`,
          config: `projects/${config.projectId || projectId}/configs/${config.id}`,
          autoscaling: { minReplicas: 1, maxReplicas: 1 },
        }),
      },
    );
    deploymentId = deployment?.id;
    if (!deploymentId) throw new Error("Endpoint setup failed.");
    await ref.update({ deploymentId });

    await togetherRequest(
      TOGETHER_V2,
      `/projects/${encodeURIComponent(projectId)}/endpoints/${encodeURIComponent(endpointId)}`,
      { method: "PATCH", body: JSON.stringify({ trafficSplit: [{ deploymentId, weight: 1 }] }) },
    );
    return res.json({ success: true, state: "starting", modelName: model.modelName });
  } catch (error: any) {
    if (error?.message === "TRIAL_ALREADY_USED") {
      return res.status(409).json({ success: false, error: "Your one-time model chat session has already been used." });
    }
    if (reserved) {
      const ref = trialRef(uid);
      try {
        if (endpointId && deploymentId) {
          await togetherRequest(
            TOGETHER_V2,
            `/projects/${encodeURIComponent(projectId)}/endpoints/${encodeURIComponent(endpointId)}/deployments/${encodeURIComponent(deploymentId)}`,
            { method: "PATCH", body: JSON.stringify({ autoscaling: { minReplicas: 0, maxReplicas: 0 } }) },
          );
        }
        if (endpointId) {
          await togetherRequest(TOGETHER_V2, `/projects/${encodeURIComponent(projectId)}/endpoints/${encodeURIComponent(endpointId)}`, { method: "DELETE" });
        }
        await ref.delete();
      } catch {
        await ref.set({ state: "failed", used: true, projectId, endpointId, deploymentId, createdAt: new Date().toISOString() });
      }
    }
    return res.status(502).json({ success: false, error: "Model chat could not be started. The session was not charged." });
  }
});

router.post("/finetune/model-trial/chat", async (req: AuthRequest, res) => {
  const uid = userId(req, res);
  if (!uid) return;
  const messages = req.body?.messages;
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 30
    || messages.some((message: any) =>
      !message || !["user", "assistant"].includes(message.role)
      || typeof message.content !== "string" || !message.content.trim() || message.content.length > 12000)) {
    return res.status(400).json({ success: false, error: "Enter a message to continue." });
  }
  try {
    const snapshot = await trialRef(uid).get();
    const trial = snapshot.data() as TrialSession | undefined;
    if (!trial || trial.state !== "ready" || !trial.endpointName || !trial.expiresAt || Date.now() >= Date.parse(trial.expiresAt)) {
      return res.status(410).json({ success: false, error: "Your model chat session has ended." });
    }
    const result = await togetherRequest("https://api-inference.together.ai/v1", "/chat/completions", {
      method: "POST",
      body: JSON.stringify({ model: trial.endpointName, messages, max_tokens: 1024 }),
      signal: AbortSignal.timeout(90000),
    });
    const content = result?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Invalid response.");
    return res.json({ success: true, content });
  } catch {
    return res.status(502).json({ success: false, error: "The model could not respond. Try again." });
  }
});

export default router;
