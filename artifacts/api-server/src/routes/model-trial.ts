import { Router, type IRouter } from "express";
import fs from "node:fs";
import path from "node:path";
import { optionalAuth, type AuthRequest } from "../middleware/auth.ts";
import { adminDb } from "../lib/firebase-admin.ts";

const TOGETHER_V1 = "https://api.together.ai/v1";
const TOGETHER_V2 = "https://api.together.ai/v2";
const TRIAL_COLLECTION = "modelTrialSessions";
const TRIAL_LENGTH_MS = 15 * 60 * 1000;
const JOB_STORE = path.join(process.cwd(), ".data", "finetune-sessions.json");

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
  return adminDb.collection(TRIAL_COLLECTION).doc(uid);
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

function latestOwnedJob(uid: string): string | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(JOB_STORE, "utf8"));
    return Object.entries(parsed?.jobOwners || {})
      .filter(([, owner]) => owner === uid)
      .at(-1)?.[0] as string || null;
  } catch {
    return null;
  }
}

async function loadLatestCompletedModel(uid: string) {
  const jobId = latestOwnedJob(uid);
  if (!jobId) return null;
  const job = await togetherRequest(TOGETHER_V1, `/fine-tunes/${encodeURIComponent(jobId)}`);
  if (String(job?.status || "").toLowerCase() !== "completed") return null;
  const modelId = job?.model_object_id;
  const projectId = job?.project_id || job?.projectId;
  if (typeof modelId !== "string" || typeof projectId !== "string") return null;
  return {
    jobId,
    modelId,
    projectId,
    modelName: String(job?.model_object_name || job?.model_output_name || job?.output_name || "Trained model"),
  };
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
    const [snapshot, latest] = await Promise.all([
      trialRef(uid).get(),
      loadLatestCompletedModel(uid),
    ]);
    const trial = snapshot.exists ? snapshot.data() as TrialSession : null;
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
  } catch {
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
      `/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(model.modelId)}/configs`,
    );
    const config = selectConfig(Array.isArray(modelConfigs?.data) ? modelConfigs.data : []);
    if (!config) return res.status(422).json({ success: false, error: "This model is not available for chat yet." });

    const ref = trialRef(uid);
    await adminDb.runTransaction(async (transaction) => {
      const current = await transaction.get(ref);
      if (current.exists) throw new Error("TRIAL_ALREADY_USED");
      transaction.create(ref, {
        state: "starting",
        used: true,
        jobId: model.jobId,
        modelName: model.modelName,
        projectId,
        createdAt: new Date().toISOString(),
      } satisfies TrialSession);
      reserved = true;
    });

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
        await ref.set({ state: "failed", used: true, projectId, endpointId, deploymentId, createdAt: new Date().toISOString() }, { merge: true });
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
