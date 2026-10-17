import { Router, type IRouter } from "express";
import { optionalAuth, type AuthRequest } from "../middleware/auth.ts";
import { getRecord, listRecords, setRecord } from "../lib/training-records.mjs";
import { ownedTrainingJobs, rememberJobStatus } from "../lib/training-jobs.ts";
import { logger } from "../lib/logger.ts";
import { refundModelChatCredits, reserveModelChatCredits } from "./whop.ts";

const TOGETHER_V1 = "https://api.together.ai/v1";
const TOGETHER_V2 = "https://api.together.ai/v2";
type ChatMessage = { role: "user" | "assistant"; content: string };
type PaidSession = {
  state: "starting" | "ready" | "stopping" | "stopped" | "expired" | "failed";
  jobId: string;
  modelName: string;
  projectId: string;
  endpointId?: string | null;
  endpointName?: string | null;
  deploymentId?: string | null;
  createdAt: string;
  readyAt?: string | null;
  expiresAt?: string | null;
  rateCentsPerMinute: number;
  reservedTicks: number;
  billingBypass: boolean;
};

const router: IRouter = Router();
router.use(optionalAuth);
const stopTimers = new Map<string, ReturnType<typeof setTimeout>>();
const readinessTimers = new Map<string, ReturnType<typeof setTimeout>>();

function uid(req: AuthRequest, res: any) {
  const id = req.user?.uid;
  if (!id) {
    res.status(401).json({ success: false, error: "Sign in to use prepaid model chat." });
    return null;
  }
  return id;
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

async function loadLatestModel(userId: string) {
  const jobs = await ownedTrainingJobs(userId);
  for (const { id: jobId, data: saved } of jobs.reverse()) {
    if (["error", "user_error", "failed", "cancelled"].includes(saved.status)) continue;
    const job = await togetherRequest(TOGETHER_V1, `/fine-tunes/${encodeURIComponent(jobId)}`);
    await rememberJobStatus(userId, jobId, job);
    if (String(job?.status || "").trim().toLowerCase() !== "completed") continue;
    const modelId = job?.model_object_id || saved.modelId;
    if (typeof modelId !== "string") continue;
    let projectId = job?.project_id || job?.projectId || saved.projectId;
    if (!projectId) {
      const identity = await togetherRequest(TOGETHER_V1, "/whoami");
      projectId = identity?.project_id;
      if (typeof projectId !== "string" || !projectId) throw new Error("Together did not return the trained model's project ID.");
      await setRecord("job", jobId, { projectId });
    }
    return {
      jobId,
      modelId,
      projectId,
      modelName: String(job?.model_object_name || job?.model_output_name || job?.output_name || saved.outputName || "Trained model"),
    };
  }
  return null;
}

function selectConfig(configs: any[]) {
  return configs
    .filter(config => typeof config?.id === "string")
    .sort((a, b) => {
      const count = (item: any) => Number(item?.selectors?.find((s: any) => s.key === "accelerator_count")?.value) || 999;
      return count(a) - count(b);
    })[0];
}

function scheduleStop(userId: string, session: PaidSession) {
  const old = stopTimers.get(userId);
  if (old) clearTimeout(old);
  if (!session.expiresAt) return;
  stopTimers.set(userId, setTimeout(() => {
    stopTimers.delete(userId);
    void stopSession(userId, true).catch(error => {
      logger.warn({ error: String(error) }, "Prepaid model endpoint auto-stop failed");
      scheduleStop(userId, { ...session, expiresAt: new Date(Date.now() + 10000).toISOString() });
    });
  }, Math.max(0, Date.parse(session.expiresAt) - Date.now())));
}

function scheduleReadiness(userId: string) {
  const old = readinessTimers.get(userId);
  if (old) clearTimeout(old);
  readinessTimers.set(userId, setTimeout(() => {
    readinessTimers.delete(userId);
    void refreshSession(userId);
  }, 5000));
}

async function stopSession(userId: string, exhausted: boolean) {
  const session = await getRecord("paid_model_chat", userId) as PaidSession | null;
  if (!session || ["stopped", "expired", "failed", "stopping"].includes(session.state)) return session;
  await setRecord("paid_model_chat", userId, { state: "stopping" });
  const timer = stopTimers.get(userId);
  if (timer) clearTimeout(timer);
  stopTimers.delete(userId);
  const readinessTimer = readinessTimers.get(userId);
  if (readinessTimer) clearTimeout(readinessTimer);
  readinessTimers.delete(userId);
  try {
    if (session.endpointId && session.deploymentId) {
      await togetherRequest(
        TOGETHER_V2,
        `/projects/${encodeURIComponent(session.projectId)}/endpoints/${encodeURIComponent(session.endpointId)}/deployments/${encodeURIComponent(session.deploymentId)}`,
        { method: "PATCH", body: JSON.stringify({ autoscaling: { minReplicas: 0, maxReplicas: 0 } }) },
      );
    }
    if (session.endpointId) {
      await togetherRequest(TOGETHER_V2, `/projects/${encodeURIComponent(session.projectId)}/endpoints/${encodeURIComponent(session.endpointId)}`, { method: "DELETE" });
    }
    const elapsedMs = session.readyAt ? Math.max(0, Date.now() - Date.parse(session.readyAt)) : 0;
    const usedTicks = session.billingBypass || !session.readyAt
      ? 0
      : Math.min(session.reservedTicks, exhausted
        ? session.reservedTicks
        : Math.ceil(session.rateCentsPerMinute * elapsedMs / 1000));
    if (!session.billingBypass) refundModelChatCredits(userId, Math.max(0, session.reservedTicks - usedTicks));
    const state = exhausted ? "expired" : "stopped";
    await setRecord("paid_model_chat", userId, { state, reservedTicks: usedTicks, stoppedAt: new Date().toISOString() });
    return { ...session, state, reservedTicks: usedTicks };
  } catch (error) {
    await setRecord("paid_model_chat", userId, { state: session.state });
    throw error;
  }
}

async function refreshSession(userId: string) {
  const session = await getRecord("paid_model_chat", userId) as PaidSession | null;
  if (!session) return null;
  if (session.state === "starting" && session.endpointId && session.deploymentId) {
    try {
      const deployment = await togetherRequest(
        TOGETHER_V2,
        `/projects/${encodeURIComponent(session.projectId)}/endpoints/${encodeURIComponent(session.endpointId)}/deployments/${encodeURIComponent(session.deploymentId)}`,
      );
      const deploymentState = String(deployment?.status?.state || deployment?.state || "");
      if (deploymentState.includes("READY")) {
        const readyAt = new Date();
        const expiresAt = session.billingBypass
          ? null
          : new Date(readyAt.getTime() + session.reservedTicks / session.rateCentsPerMinute * 1000).toISOString();
        const readySession = { ...session, state: "ready" as const, readyAt: readyAt.toISOString(), expiresAt };
        await setRecord("paid_model_chat", userId, { state: "ready", readyAt: readySession.readyAt, expiresAt });
        if (expiresAt) scheduleStop(userId, readySession);
        return readySession;
      }
      if (deploymentState.includes("FAILED")) {
        await stopSession(userId, false);
        await setRecord("paid_model_chat", userId, { state: "failed" });
        return { ...session, state: "failed" as const };
      }
    } catch {
      // Retry status checks until the provider reports a terminal state.
    }
    scheduleReadiness(userId);
  }
  if (session.state === "ready" && session.expiresAt && Date.now() >= Date.parse(session.expiresAt)) {
    return stopSession(userId, true);
  }
  return session;
}

void listRecords("paid_model_chat").then(rows => {
  for (const row of rows) {
    const session = row.data as PaidSession;
    if (session.state === "starting") scheduleReadiness(row.id);
    if (session.state === "ready" && session.expiresAt) scheduleStop(row.id, session);
  }
}).catch(error => logger.warn({ error: String(error) }, "Prepaid model endpoint timers could not be restored"));

router.get("/finetune/model-chat/prepaid/status", async (req: AuthRequest, res) => {
  const userId = uid(req, res);
  if (!userId) return;
  try {
    const session = await refreshSession(userId);
    return res.json({
      success: true,
      session: session ? {
        state: session.state,
        modelName: session.modelName,
        rateCentsPerMinute: session.rateCentsPerMinute,
        expiresAt: session.expiresAt || null,
        remainingMs: session.state === "ready" && session.expiresAt
          ? Math.max(0, Date.parse(session.expiresAt) - Date.now())
          : null,
        billingBypass: session.billingBypass,
      } : null,
    });
  } catch {
    return res.status(502).json({ success: false, error: "Could not load prepaid model chat status." });
  }
});

router.post("/finetune/model-chat/prepaid/start", async (req: AuthRequest, res) => {
  const userId = uid(req, res);
  if (!userId) return;
  let projectId = "";
  let endpointId: string | undefined;
  let deploymentId: string | undefined;
  let reservedTicks = 0;
  let bypass = false;
  try {
    const trial = await getRecord("trial", userId);
    const trialEnded = trial && (trial.state === "failed" || trial.state === "expired"
      || (trial.state === "ready" && trial.expiresAt && Date.now() >= Date.parse(trial.expiresAt)));
    if (!trialEnded) return res.status(409).json({ success: false, error: "Finish the free model chat trial before starting prepaid chat." });

    const current = await getRecord("paid_model_chat", userId) as PaidSession | null;
    if (current && ["starting", "ready", "stopping"].includes(current.state)) {
      return res.status(409).json({ success: false, error: "A prepaid endpoint is already active." });
    }
    const model = await loadLatestModel(userId);
    if (!model) return res.status(409).json({ success: false, error: "Complete a training run before starting model chat." });
    projectId = model.projectId;
    const configs = await togetherRequest(
      TOGETHER_V2,
      `/projects/${encodeURIComponent(projectId)}/configs?referenceModel=${encodeURIComponent(`projects/${projectId}/models/${model.modelId}`)}`,
    );
    const config = selectConfig(Array.isArray(configs?.data) ? configs.data : []);
    if (!config) return res.status(422).json({ success: false, error: "This model is not available for chat yet." });

    const reservation = reserveModelChatCredits(req.user);
    reservedTicks = reservation.ticks;
    bypass = reservation.bypass;
    const rateCentsPerMinute = /llama/i.test(model.modelName) ? 50 : 25;
    await setRecord("paid_model_chat", userId, {
      state: "starting",
      jobId: model.jobId,
      modelName: model.modelName,
      projectId,
      createdAt: new Date().toISOString(),
      rateCentsPerMinute,
      reservedTicks,
      billingBypass: bypass,
      endpointId: null,
      endpointName: null,
      deploymentId: null,
      readyAt: null,
      expiresAt: null,
    });

    const endpoint = await togetherRequest(TOGETHER_V2, `/projects/${encodeURIComponent(projectId)}/endpoints`, {
      method: "POST",
      body: JSON.stringify({ name: `sft-paid-chat-${Date.now().toString(36)}`, visibility: "VISIBILITY_PRIVATE" }),
    });
    endpointId = endpoint?.id;
    if (!endpointId) throw new Error("Endpoint setup failed.");
    await setRecord("paid_model_chat", userId, { endpointId, endpointName: endpoint?.name });

    const deployment = await togetherRequest(
      TOGETHER_V2,
      `/projects/${encodeURIComponent(projectId)}/endpoints/${encodeURIComponent(endpointId)}/deployments`,
      {
        method: "POST",
        body: JSON.stringify({
          name: "model-chat-prepaid",
          model: `projects/${projectId}/models/${model.modelId}`,
          config: `projects/${config.projectId || projectId}/configs/${config.id}`,
          autoscaling: { minReplicas: 1, maxReplicas: 1 },
        }),
      },
    );
    deploymentId = deployment?.id;
    if (!deploymentId) throw new Error("Endpoint setup failed.");
    await setRecord("paid_model_chat", userId, { deploymentId });
    await togetherRequest(
      TOGETHER_V2,
      `/projects/${encodeURIComponent(projectId)}/endpoints/${encodeURIComponent(endpointId)}`,
      { method: "PATCH", body: JSON.stringify({ trafficSplit: [{ deploymentId, weight: 1 }] }) },
    );
    scheduleReadiness(userId);
    return res.json({ success: true, state: "starting", modelName: model.modelName, rateCentsPerMinute });
  } catch (error: any) {
    try {
      if (endpointId && deploymentId) {
        await togetherRequest(
          TOGETHER_V2,
          `/projects/${encodeURIComponent(projectId)}/endpoints/${encodeURIComponent(endpointId)}/deployments/${encodeURIComponent(deploymentId)}`,
          { method: "PATCH", body: JSON.stringify({ autoscaling: { minReplicas: 0, maxReplicas: 0 } }) },
        );
      }
      if (endpointId) await togetherRequest(TOGETHER_V2, `/projects/${encodeURIComponent(projectId)}/endpoints/${encodeURIComponent(endpointId)}`, { method: "DELETE" });
    } catch {
      // Preserve retryable setup state if provider cleanup is temporarily unavailable.
    }
    if (!bypass) refundModelChatCredits(userId, reservedTicks);
    if (error?.status) return res.status(error.status).json({ success: false, error: error.message });
    await setRecord("paid_model_chat", userId, { state: "failed", stoppedAt: new Date().toISOString() });
    return res.status(502).json({ success: false, error: "Prepaid model chat could not be started. Your unused credit was returned." });
  }
});

router.post("/finetune/model-chat/prepaid/stop", async (req: AuthRequest, res) => {
  const userId = uid(req, res);
  if (!userId) return;
  try {
    const session = await stopSession(userId, false);
    return res.json({ success: true, session: session ? { state: session.state } : null });
  } catch {
    return res.status(502).json({ success: false, error: "Could not stop the prepaid endpoint. Try again." });
  }
});

router.post("/finetune/model-chat/prepaid/chat", async (req: AuthRequest, res) => {
  const userId = uid(req, res);
  if (!userId) return;
  const messages = req.body?.messages;
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 30
    || messages.some((message: any) =>
      !message || !["user", "assistant"].includes(message.role)
      || typeof message.content !== "string" || !message.content.trim() || message.content.length > 12000)) {
    return res.status(400).json({ success: false, error: "Enter a message to continue." });
  }
  try {
    const session = await refreshSession(userId);
    if (!session || session.state !== "ready" || !session.endpointName
      || (session.expiresAt && Date.now() >= Date.parse(session.expiresAt))) {
      return res.status(410).json({ success: false, error: "Your prepaid model chat session has ended." });
    }
    const result = await togetherRequest("https://api-inference.together.ai/v1", "/chat/completions", {
      method: "POST",
      body: JSON.stringify({ model: session.endpointName, messages: messages.slice(-30), max_tokens: 1024 }),
      signal: AbortSignal.timeout(90000),
    });
    const content = result?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Invalid response.");
    const previous = await getRecord("model_chat_history", userId);
    const history: ChatMessage[] = Array.isArray(previous?.messages) ? previous.messages : [];
    await setRecord("model_chat_history", userId, {
      messages: [...history, messages.at(-1), { role: "assistant", content }],
    });
    return res.json({ success: true, content });
  } catch {
    return res.status(502).json({ success: false, error: "The model could not respond. Try again." });
  }
});

export default router;
