import { Router, type IRouter } from "express";
import { optionalAuth, type AuthRequest } from "../middleware/auth.ts";
import { loadTrainingStore, readTrainingRecord, updateTrainingRecord } from "../lib/training-store.ts";

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

async function updateTrial(uid: string, patch: Partial<TrialSession>): Promise<void> {
  await updateTrainingRecord<TrialSession>(uid, "trial", current => {
    if (!current) throw new Error("Model chat session is missing.");
    return { ...current, ...patch };
  });
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
  const store = await loadTrainingStore(uid);
  const jobs = Object.entries(store.jobOwners).filter(([, owner]) => owner === uid).reverse();
  for (const [jobId] of jobs) {
    const job = await togetherRequest(TOGETHER_V1, `/fine-tunes/${encodeURIComponent(jobId)}`);
    if (String(job?.status || "").toLowerCase() !== "completed") continue;
    const modelId = job?.model_object_id;
    const projectId = job?.project_id || job?.projectId;
    if (typeof modelId !== "string" || typeof projectId !== "string") {
      throw new Error("Training is complete, but the trained model's chat deployment identifiers are not available yet.");
    }
    return {
      jobId, modelId, projectId,
      modelName: String(job?.model_object_name || job?.model_output_name || job?.output_name || "Trained model"),
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
    let trial = await readTrainingRecord<TrialSession>(uid, "trial");
    // An existing trial must remain readable even if the training provider is unavailable.
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
          trial = await updateTrainingRecord<TrialSession>(uid, "trial", current =>
            current?.state === "starting"
              ? { ...current, state: "ready", readyAt: now.toISOString(), expiresAt: expiresAt.toISOString() }
              : current);
        }
        if (String(deployment?.status?.state || deployment?.state || "").includes("FAILED")) {
          trial = await updateTrainingRecord<TrialSession>(uid, "trial", current =>
            current?.state === "starting" ? { ...current, state: "failed" } : current);
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
  } catch (error: any) {
    const message = error?.message?.startsWith("Training is complete,")
      ? error.message : "Could not load model chat status.";
    return res.status(502).json({ success: false, error: message });
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
      `/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(model.modelId)}/configs`,
    );
    const config = selectConfig(Array.isArray(modelConfigs?.data) ? modelConfigs.data : []);
    if (!config) return res.status(422).json({ success: false, error: "This model is not available for chat yet." });

    await updateTrainingRecord<TrialSession>(uid, "trial", current => {
      if (current) throw new Error("TRIAL_ALREADY_USED");
      return {
        state: "starting",
        used: true,
        jobId: model.jobId,
        modelName: model.modelName,
        projectId,
        createdAt: new Date().toISOString(),
      };
    });
    reserved = true;

    const endpoint = await togetherRequest(TOGETHER_V2, `/projects/${encodeURIComponent(projectId)}/endpoints`, {
      method: "POST",
      body: JSON.stringify({ name: `sft-chat-${Date.now().toString(36)}`, visibility: "VISIBILITY_PRIVATE" }),
    });
    endpointId = endpoint?.id;
    if (!endpointId) throw new Error("Endpoint setup failed.");
    const endpointName = endpoint?.name;
    await updateTrial(uid, { endpointId, endpointName });

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
    await updateTrial(uid, { deploymentId });

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
        await updateTrainingRecord<TrialSession>(uid, "trial", () => null);
      } catch {
        await updateTrial(uid, { state: "failed", used: true, projectId, endpointId, deploymentId });
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
    const trial = await readTrainingRecord<TrialSession>(uid, "trial");
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
