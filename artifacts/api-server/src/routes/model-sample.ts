import { Router } from "express";
import { createHash } from "node:crypto";
import type { AuthRequest } from "../middleware/auth.ts";
import { logger } from "../lib/logger.ts";

const PREFIX = "sft-sample-v1-";
const SAMPLE_MS = 15 * 60_000;
const STARTUP_MS = 30 * 60_000;
type SampleState = "available" | "starting" | "ready" | "ended" | "unavailable";
type Endpoint = { id: string; name: string; projectId: string; createdAt: string; deployments?: any[]; trafficSplit?: any[] };
type OwnedJob = (uid: string, jobId: string) => Promise<any>;

// The stopped endpoint is deliberately retained as a durable, provider-side
// one-use marker. No project storage or training data is changed.
const active = new Map<string, Endpoint>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const checking = new Map<string, Promise<ReturnType<typeof view>>>();
const sending = new Set<string>();
const stopping = new Set<string>();
let projectPromise: Promise<string> | undefined;

function view(state: SampleState, expiresAt: number | null = null) {
  return { state, expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null, serverNow: new Date().toISOString() };
}

async function request(url: string, init: RequestInit = {}): Promise<any> {
  const key = process.env.TOGETHER_API_KEY;
  if (!key) throw new Error("Sample service is not configured.");
  const response = await fetch(url, {
    ...init,
    signal: init.signal || AbortSignal.timeout(20_000),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...init.headers },
  });
  if (!response.ok) {
    const error = new Error("Sample service request failed.") as Error & { status: number };
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

const api = (path: string, init?: RequestInit) => request(`https://api.together.ai/v2${path}`, init);
const patch = (path: string, data: unknown) => api(path, { method: "PATCH", body: JSON.stringify(data) });
const endpointPath = (ep: Endpoint) => `/projects/${encodeURIComponent(ep.projectId)}/endpoints/${encodeURIComponent(ep.id)}`;

async function projectId() {
  if (!projectPromise) {
    projectPromise = request("https://api.together.ai/v1/whoami")
      .then(data => {
        if (typeof data.project_id !== "string" || !data.project_id) throw new Error("Missing project.");
        return data.project_id as string;
      }).catch(error => { projectPromise = undefined; throw error; });
  }
  return projectPromise;
}

async function list(path: string): Promise<any[]> {
  const result: any[] = [];
  let after = "";
  do {
    const page = await api(`${path}${path.includes("?") ? "&" : "?"}limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`);
    if (!Array.isArray(page.data)) throw new Error("Invalid sample service response.");
    result.push(...page.data);
    after = page.next_cursor || "";
  } while (after);
  return result;
}

function sampleName(modelId: string) {
  return `${PREFIX}${createHash("sha256").update(modelId).digest("hex").slice(0, 24)}`;
}

async function findEndpoint(project: string, name: string): Promise<Endpoint | undefined> {
  const endpoints = await list(`/projects/${encodeURIComponent(project)}/endpoints`);
  return endpoints.find(ep => ep.name?.split("/").pop() === name);
}

function watch(ep: Endpoint, expiresAt: number) {
  active.set(ep.id, ep);
  if (timers.has(ep.id)) return;
  const timer = setTimeout(() => {
    timers.delete(ep.id);
    void reconcile(ep).catch(() => logger.warn("Sample shutdown will be retried."));
  }, Math.max(0, expiresAt - Date.now()));
  timer.unref();
  timers.set(ep.id, timer);
}

async function stop(ep: Endpoint, deployment: any) {
  // Do not delete the endpoint: its unique name permanently consumes this
  // model's sample. Zero replicas stops hosting charges after draining.
  await patch(`${endpointPath(ep)}/deployments/${encodeURIComponent(deployment.id)}`, {
    name: `sample-until-${Date.now()}`,
    autoscaling: { minReplicas: 0, maxReplicas: 0 },
  });
}

async function inspect(ep: Endpoint) {
  const current: Endpoint = await api(endpointPath(ep));
  const summary = current.deployments?.find(d => /sample-(pending|until)-\d+$/.test(d.name || ""));
  if (!summary) {
    if (Date.now() - Date.parse(current.createdAt) < 120_000) return view("starting");
    active.delete(ep.id);
    return view("ended");
  }
  const path = `${endpointPath(ep)}/deployments/${encodeURIComponent(summary.id)}`;
  let deployment = await api(path);
  const match = /sample-(pending|until)-(\d+)$/.exec(deployment.name || "");
  if (!match) return view("unavailable");
  const state = deployment.status?.state;
  let deadline = Number(match[2]);
  if (["DEPLOYMENT_STATE_STOPPED", "DEPLOYMENT_STATE_FAILED"].includes(state)) {
    active.delete(ep.id);
    stopping.delete(ep.id);
    const timer = timers.get(ep.id);
    if (timer) clearTimeout(timer);
    timers.delete(ep.id);
    return view("ended");
  }
  active.set(ep.id, ep);
  if (stopping.has(ep.id) || Date.now() >= deadline || state === "DEPLOYMENT_STATE_STOPPING") {
    await stop(ep, deployment);
    return view("ended", match[1] === "until" ? deadline : null);
  }
  if (match[1] === "pending" && state === "DEPLOYMENT_STATE_READY"
    && current.trafficSplit?.some(t => t.deploymentId === deployment.id && t.weight > 0)) {
    deadline = Date.now() + SAMPLE_MS;
    // Persist the deadline with optimistic concurrency. Refreshes, duplicate
    // requests and other server instances cannot reset an existing countdown.
    try {
      deployment = await patch(path, { name: `sample-until-${deadline}`, etag: deployment.etag });
    } catch (error: any) {
      if (![409, 412].includes(error.status)) throw error;
      return inspect(ep);
    }
    const timer = timers.get(ep.id);
    if (timer) clearTimeout(timer);
    timers.delete(ep.id);
    watch(ep, deadline);
    return view("ready", deadline);
  }
  watch(ep, deadline);
  return view(match[1] === "until" && state === "DEPLOYMENT_STATE_READY" ? "ready" : "starting",
    match[1] === "until" ? deadline : null);
}

function reconcile(ep: Endpoint): Promise<ReturnType<typeof view>> {
  const pending = checking.get(ep.id);
  if (pending) return pending;
  const task = inspect(ep).finally(() => checking.delete(ep.id));
  checking.set(ep.id, task);
  return task;
}

// Recovery is independent of browsers and discovers provider-persisted timers
// after process restarts. The provider's 30-minute idle timeout is a second guard.
let sweeping = false;
let nextDiscovery = 0;
async function sweep() {
  if (sweeping || !process.env.TOGETHER_API_KEY) return;
  sweeping = true;
  try {
    if (Date.now() >= nextDiscovery) {
      nextDiscovery = Date.now() + 60_000;
      const project = await projectId();
      const endpoints = await list(`/projects/${encodeURIComponent(project)}/endpoints`);
      for (const ep of endpoints) {
        if (ep.name?.split("/").pop()?.startsWith(PREFIX)
          && ep.deployments?.some((d: any) => !["DEPLOYMENT_STATE_STOPPED", "DEPLOYMENT_STATE_FAILED"].includes(d.state))) {
          active.set(ep.id, ep);
        }
      }
    }
    await Promise.allSettled([...active.values()].map(ep => reconcile(ep)));
  } catch {
    logger.warn("Sample lifecycle check will be retried.");
  } finally {
    sweeping = false;
  }
}

export function createModelSampleRouter(getOwnedJob: OwnedJob) {
  const router = Router();
  const worker = setInterval(() => void sweep(), 10_000);
  worker.unref();

  async function context(req: AuthRequest) {
    if (!req.user?.uid) throw Object.assign(new Error("Please sign in."), { status: 401 });
    const id = String(req.params.id || "");
    const job = await getOwnedJob(req.user.uid, id);
    if (String(job?.status).toLowerCase() !== "completed") {
      throw Object.assign(new Error("Your model must finish training first."), { status: 409 });
    }
    if (!job.model_object_id) return null;
    const project = await projectId();
    const name = sampleName(job.model_object_id);
    return { project, name, job, endpoint: await findEndpoint(project, name) };
  }

  const fail = (res: any, error: any) => {
    logger.warn({ status: error?.status }, "Model sample request could not finish.");
    return res.status([401, 404, 409, 410, 429].includes(error?.status) ? error.status : 503)
      .json({ success: false, error: error?.status === 401 ? "Please sign in." : "Your model sample is not available right now." });
  };

  router.get("/finetune/jobs/:id/sample", async (req: AuthRequest, res) => {
    try {
      const ctx = await context(req);
      return res.json({ success: true, sample: !ctx ? view("unavailable")
        : ctx.endpoint ? await reconcile(ctx.endpoint) : view("available") });
    } catch (error) { return fail(res, error); }
  });

  router.post("/finetune/jobs/:id/sample", async (req: AuthRequest, res) => {
    if (req.body?.confirmStart !== true) {
      return res.status(400).json({ success: false, error: "Choose the sample button to begin." });
    }
    let endpoint: Endpoint | undefined;
    try {
      const ctx = await context(req);
      if (!ctx) return res.json({ success: true, sample: view("unavailable") });
      if (ctx.endpoint) return res.json({ success: true, sample: await reconcile(ctx.endpoint) });
      const model = `projects/${ctx.project}/models/${ctx.job.model_object_id}`;
      const registeredModel = await api(`/projects/${encodeURIComponent(ctx.project)}/models/${encodeURIComponent(ctx.job.model_object_id)}`);
      const referenceModel = registeredModel.referenceModel || registeredModel.baseModel || model;
      const configs = await list(`/projects/${encodeURIComponent(ctx.project)}/configs?referenceModel=${encodeURIComponent(referenceModel)}`);
      const config = configs.find(c => typeof c.id === "string" && c.id.startsWith("cr_"));
      if (!config) return res.json({ success: true, sample: view("unavailable") });
      try {
        // Unique provider-side name is the cross-process once-per-model claim.
        endpoint = await api(`/projects/${encodeURIComponent(ctx.project)}/endpoints`, {
          method: "POST", body: JSON.stringify({ name: ctx.name, visibility: "VISIBILITY_PRIVATE" }),
        });
      } catch (error: any) {
        if (error.status !== 409) throw error;
        const existing = await findEndpoint(ctx.project, ctx.name);
        if (!existing) throw error;
        return res.json({ success: true, sample: await reconcile(existing) });
      }
      if (!endpoint?.id) throw new Error("Missing sample endpoint.");
      active.set(endpoint.id, endpoint);
      const startupDeadline = Date.now() + STARTUP_MS;
      const deployment = await api(`${endpointPath(endpoint)}/deployments`, {
        method: "POST",
        body: JSON.stringify({
          name: `sample-pending-${startupDeadline}`,
          model,
          config: `projects/${config.projectId || ctx.project}/configs/${config.id}`,
          ...(ctx.job.model_object_revision_id ? { modelRevisionId: ctx.job.model_object_revision_id } : {}),
          autoscaling: { minReplicas: 1, maxReplicas: 1 },
          maxConcurrentRequestsPerReplica: "1",
          inactiveTimeout: 30,
        }),
      });
      await patch(endpointPath(endpoint), { trafficSplit: [{ deploymentId: deployment.id, weight: 1 }] });
      watch(endpoint, startupDeadline);
      return res.json({ success: true, sample: await reconcile(endpoint) });
    } catch (error) {
      if (endpoint?.id) {
        stopping.add(endpoint.id);
        // A failed or ambiguous launch is never retried. Discover and stop any
        // deployment accepted before the failure, retaining the one-use marker.
        try {
          const current = await api(endpointPath(endpoint));
          await Promise.all((current.deployments || []).map((d: any) => stop(endpoint!, d)));
        } catch { logger.warn("Incomplete sample launch cleanup will be retried."); }
      }
      return fail(res, error);
    }
  });

  router.post("/finetune/jobs/:id/sample/messages", async (req: AuthRequest, res) => {
    let endpointId: string | undefined;
    try {
      const messages = req.body?.messages;
      if (!Array.isArray(messages) || !messages.length || messages.length > 100
        || messages.at(-1)?.role !== "user"
        || messages.some((m: any) => !["user", "assistant"].includes(m?.role)
          || typeof m?.content !== "string" || !m.content.trim() || m.content.length > 16_000)
        || JSON.stringify(messages).length > 100_000) {
        return res.status(400).json({ success: false, error: "Please send a shorter message." });
      }
      const ctx = await context(req);
      if (!ctx?.endpoint) throw Object.assign(new Error("Sample unavailable."), { status: 409 });
      const sample = await reconcile(ctx.endpoint);
      const remaining = sample.expiresAt ? Date.parse(sample.expiresAt) - Date.now() : 0;
      if (sample.state !== "ready" || remaining <= 0) {
        return res.status(410).json({ success: false, error: "Your sample is not active." });
      }
      if (sending.has(ctx.endpoint.id)) throw Object.assign(new Error("A reply is already in progress."), { status: 429 });
      endpointId = ctx.endpoint.id;
      sending.add(endpointId);
      const result = await request("https://api-inference.together.ai/v1/chat/completions", {
        method: "POST",
        signal: AbortSignal.timeout(Math.max(1, Math.min(60_000, remaining))),
        body: JSON.stringify({
          model: ctx.endpoint.name,
          messages: messages.map(({ role, content }: { role: string; content: string }) => ({ role, content })),
          max_tokens: 1024,
          stream: false,
        }),
      });
      const reply = result?.choices?.[0]?.message?.content;
      if (typeof reply !== "string" || !reply.trim()) throw new Error("Empty model response.");
      return res.json({ success: true, reply });
    } catch (error) { return fail(res, error); }
    finally { if (endpointId) sending.delete(endpointId); }
  });
  return router;
}
