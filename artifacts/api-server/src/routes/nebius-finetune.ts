import { Router, type IRouter } from "express";
import { optionalAuth, type AuthRequest } from "../middleware/auth.ts";
import { createRecord, getRecord, listRecords, setRecord } from "../lib/training-records.mjs";
import { makeHuggingFaceModelPublic } from "../lib/huggingface.ts";
import { consumeTraining, isOwner, restoreTraining } from "./whop.ts";

const NEBIUS_API_BASE = "https://api.tokenfactory.nebius.com/v1";
const PREFLIGHT_TTL_MS = 60 * 60 * 1000;
const OWNER_ONLY_MODEL = "Qwen/Qwen2.5-32B";
const MODELS = new Set(["Qwen/Qwen3-14B-Base", "Qwen/Qwen2.5-72B", OWNER_ONLY_MODEL]);
const TRAINING_HYPERPARAMETERS = {
  batch_size: 8,
  learning_rate: 0.00001,
  n_epochs: 2,
  warmup_ratio: 0,
  weight_decay: 0,
  packing: true,
  max_grad_norm: 1,
  context_length: 65536,
  lora: false,
};
const SAFE_ID = /^[A-Za-z0-9_-]{1,160}$/;

interface NebiusSession {
  ownerId: string;
  preflightAt?: string;
  model?: string;
  upload?: {
    model: string;
    trainingFileId: string;
    validationFileId?: string;
    trainingCount: number;
    validationCount: number;
    uploadedAt: string;
  } | null;
}

function requireUser(req: AuthRequest, res: any): string | null {
  const uid = req.user?.uid;
  if (typeof uid !== "string" || !uid.trim()) {
    res.status(401).json({ success: false, error: "Sign in to start fine-tuning." });
    return null;
  }
  return uid;
}

function validateModel(value: unknown, user: AuthRequest["user"]): string | null {
  if (typeof value !== "string" || !MODELS.has(value)) return null;
  if (value === OWNER_ONLY_MODEL && !isOwner(user)) return null;
  return value;
}

function requestsLoRA(body: any): boolean {
  return body?.lora === true
    || body?.hyperparameters?.lora === true
    || (typeof body?.trainingType === "string" && body.trainingType.toLowerCase() === "lora");
}

function validateJsonl(content: unknown, label: string): { lines: string[]; error?: string } {
  if (typeof content !== "string" || !content.trim()) {
    return { lines: [], error: `The ${label} dataset is empty.` };
  }

  const lines = content.split(/\r?\n/).filter(line => line.trim());
  for (let index = 0; index < lines.length; index++) {
    let row: any;
    try {
      row = JSON.parse(lines[index]);
    } catch {
      return { lines: [], error: `The ${label} dataset line ${index + 1} is not valid JSON.` };
    }

    if (!row || Array.isArray(row) || typeof row !== "object") {
      return { lines: [], error: `The ${label} dataset line ${index + 1} must be a JSON object.` };
    }

    const messagesValid = Array.isArray(row.messages)
      && row.messages.length > 0
      && row.messages.every((message: any) => message && typeof message === "object"
        && typeof message.role === "string"
        && (typeof message.content === "string" || Array.isArray(message.tool_calls)))
      && row.messages.at(-1)?.role === "assistant";
    const instructionValid = typeof row.prompt === "string" && row.prompt.trim()
      && typeof row.completion === "string" && row.completion.trim();
    const textValid = typeof row.text === "string" && row.text.trim();
    const tokenizedValid = Array.isArray(row.input_ids) && row.input_ids.length > 0
      && row.input_ids.every((id: unknown) => Number.isInteger(id) && (id as number) >= 0);

    if (!messagesValid && !instructionValid && !textValid && !tokenizedValid) {
      return {
        lines: [],
        error: `The ${label} dataset line ${index + 1} must use a supported JSONL format.`,
      };
    }
  }

  return { lines };
}

function providerCredentials(): { nebius: string; huggingFace: string } {
  return {
    nebius: process.env.NEBIUS_API_KEY || "",
    huggingFace: process.env.HF_TOKEN || "",
  };
}

function credentialsConfigured(): { nebius: boolean; huggingFace: boolean } {
  const credentials = providerCredentials();
  return { nebius: Boolean(credentials.nebius), huggingFace: Boolean(credentials.huggingFace) };
}

function hasCredential(value: string): boolean {
  return Object.values(providerCredentials()).some(secret => secret && value.includes(secret));
}

function safeProviderId(value: unknown): string | null {
  if (typeof value !== "string" || !SAFE_ID.test(value) || hasCredential(value)) return null;
  return value;
}

class ProviderError extends Error {
  constructor(readonly status: number, readonly detail?: string) {
    super("Nebius request failed.");
  }
}

function safeProviderDetail(body: any): string | undefined {
  const issues = Array.isArray(body?.detail) ? body.detail : null;
  const detail = issues
    ? issues.map((issue: any) => {
      const location = Array.isArray(issue?.loc)
        ? issue.loc.filter((part: unknown) => typeof part === "string" || typeof part === "number").join(".")
        : "";
      const message = typeof issue?.msg === "string" ? issue.msg : "";
      return [location, message].filter(Boolean).join(": ");
    }).filter(Boolean).join("; ")
    : typeof body?.detail === "string"
      ? body.detail
      : typeof body?.error?.message === "string"
        ? body.error.message
        : typeof body?.message === "string"
          ? body.message
          : "";
  if (!detail) return undefined;
  const safe = detail
    .replace(/https?:\/\/\S+/gi, "[service URL]")
    .replace(/\b(?:Nebius|Token Factory|Hugging Face)\b/gi, "training service")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\bhf_[A-Za-z0-9]{10,}\b/g, "[redacted]")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .slice(0, 500);
  return hasCredential(safe) ? undefined : safe;
}

async function nebiusRequest(apiPath: string, init: RequestInit = {}): Promise<any> {
  const apiKey = process.env.NEBIUS_API_KEY;
  if (!apiKey) throw new ProviderError(503);

  const response = await fetch(`${NEBIUS_API_BASE}${apiPath}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(init.headers || {}),
    },
    signal: init.signal || AbortSignal.timeout(30000),
  });
  const text = await response.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* discard provider response */ }

  if (!response.ok) throw new ProviderError(response.status, safeProviderDetail(body));
  return body;
}

function providerFailure(res: any, error: unknown, fallback: string) {
  const status = error instanceof ProviderError ? error.status : 502;
  const safeStatus = status >= 400 && status < 600 ? status : 502;
  const detail = error instanceof ProviderError ? error.detail : undefined;
  return res.status(safeStatus).json({
    success: false,
    error: detail ? `${fallback} ${detail}` : fallback,
  });
}

function validateRepoName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const repo = value.trim();
  return !hasCredential(repo)
    && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/.test(repo)
    ? repo
    : null;
}

async function uploadDataset(content: string, fileName: string): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([content], { type: "application/jsonl" }), fileName);
  form.append("purpose", "fine-tune");
  const file = await nebiusRequest("/files", { method: "POST", body: form });
  const fileId = safeProviderId(file?.id);
  if (!fileId) throw new ProviderError(502);
  return fileId;
}

function publicJob(job: any, saved: any) {
  const status = typeof job?.status === "string" ? job.status.slice(0, 64) : "unknown";
  return {
    id: saved.id,
    status: hasCredential(status) ? "[redacted]" : status,
    model: saved.model,
    hfRepoName: saved.hfRepoPublic === true ? saved.hfRepoName : null,
    modelReady: saved.hfRepoPublic === true,
    createdAt: typeof job?.created_at === "number" ? job.created_at : null,
    finishedAt: typeof job?.finished_at === "number" ? job.finished_at : null,
    estimatedFinish: typeof job?.estimated_finish === "number" ? job.estimated_finish : null,
    trainedTokens: typeof job?.trained_tokens === "number" ? job.trained_tokens : null,
    trainingFileId: saved.trainingFileId,
    validationFileId: saved.validationFileId || null,
  };
}

const router: IRouter = Router();
router.use(optionalAuth);
router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

router.post("/nebius/finetune/preflight", async (req: AuthRequest, res) => {
  const uid = requireUser(req, res);
  if (!uid) return;
  if (requestsLoRA(req.body)) {
    return res.status(400).json({ success: false, error: "This model supports full-parameter training only." });
  }
  const model = validateModel(req.body?.model, req.user);
  if (!model) {
    return res.status(400).json({ success: false, error: "Choose a supported base model." });
  }

  const credentials = credentialsConfigured();
  if (!credentials.nebius || !credentials.huggingFace) {
    return res.status(503).json({
      success: false,
      credentials,
      error: "Required training credentials are not configured.",
    });
  }

  try {
    const existing = await getRecord("nebius-session", uid) as NebiusSession | null;
    await setRecord("nebius-session", uid, {
      ownerId: uid,
      preflightAt: new Date().toISOString(),
      model,
      upload: existing?.upload?.model === model ? existing.upload : null,
    });
    return res.json({
      success: true,
      model,
      trainingType: "full",
      credentials: { nebius: true, huggingFace: true },
    });
  } catch {
    return res.status(503).json({ success: false, error: "Training storage is unavailable. Please retry." });
  }
});

router.post("/nebius/finetune/validate", (req: AuthRequest, res) => {
  const uid = requireUser(req, res);
  if (!uid) return;
  if (requestsLoRA(req.body)) {
    return res.status(400).json({ success: false, error: "This model supports full-parameter training only." });
  }
  const model = validateModel(req.body?.model, req.user);
  if (!model) {
    return res.status(400).json({ success: false, error: "Choose a supported base model." });
  }

  const training = validateJsonl(req.body?.trainingJsonl, "training");
  if (training.error) return res.status(400).json({ success: false, error: training.error });
  const validationProvided = req.body?.validationJsonl !== undefined && req.body?.validationJsonl !== null;
  const validation: { lines: string[]; error?: string } = validationProvided
    ? validateJsonl(req.body.validationJsonl, "validation")
    : { lines: [] };
  if (validation.error) return res.status(400).json({ success: false, error: validation.error });

  return res.json({
    success: true,
    model,
    trainingType: "full",
    trainingCount: training.lines.length,
    validationCount: validation.lines.length,
  });
});

router.post("/nebius/finetune/upload", async (req: AuthRequest, res) => {
  const uid = requireUser(req, res);
  if (!uid) return;
  if (requestsLoRA(req.body)) {
    return res.status(400).json({ success: false, error: "This model supports full-parameter training only." });
  }
  const model = validateModel(req.body?.model, req.user);
  if (!model) {
    return res.status(400).json({ success: false, error: "Choose a supported base model." });
  }
  if (req.body?.confirmUpload !== true) {
    return res.status(400).json({ success: false, error: "Dataset upload requires explicit approval." });
  }

  const training = validateJsonl(req.body?.trainingJsonl, "training");
  if (training.error) return res.status(400).json({ success: false, error: training.error });
  const validationProvided = req.body?.validationJsonl !== undefined && req.body?.validationJsonl !== null;
  const validation: { lines: string[]; error?: string } = validationProvided
    ? validateJsonl(req.body.validationJsonl, "validation")
    : { lines: [] };
  if (validation.error) return res.status(400).json({ success: false, error: validation.error });

  try {
    const session = await getRecord("nebius-session", uid) as NebiusSession | null;
    const preflightAt = session?.preflightAt ? Date.parse(session.preflightAt) : Number.NaN;
    if (!Number.isFinite(preflightAt) || Date.now() - preflightAt > PREFLIGHT_TTL_MS
      || session.model !== model) {
      return res.status(409).json({ success: false, error: "Run preflight for this model before uploading datasets." });
    }
    const credentials = credentialsConfigured();
    if (!credentials.nebius || !credentials.huggingFace) {
      return res.status(503).json({ success: false, error: "Required training credentials are not configured." });
    }

    const suffix = typeof req.body?.suffix === "string" && req.body.suffix.trim()
      ? req.body.suffix.trim().replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 40)
      : "sft-studio";
    const trainingFileId = await uploadDataset(training.lines.join("\n"), `${suffix}-training.jsonl`);
    const validationFileId = validationProvided
      ? await uploadDataset(validation.lines.join("\n"), `${suffix}-validation.jsonl`)
      : undefined;
    const upload = {
      model,
      trainingFileId,
      ...(validationFileId ? { validationFileId } : {}),
      trainingCount: training.lines.length,
      validationCount: validation.lines.length,
      uploadedAt: new Date().toISOString(),
    };
    await setRecord("nebius-session", uid, { ownerId: uid, model, upload });
    return res.json({
      success: true,
      model,
      trainingFileId,
      validationFileId: validationFileId || null,
      trainingCount: upload.trainingCount,
      validationCount: upload.validationCount,
    });
  } catch (error) {
    return providerFailure(res, error, "Dataset upload failed. Check the dataset and try again.");
  }
});

router.post("/nebius/finetune/jobs", async (req: AuthRequest, res) => {
  const uid = requireUser(req, res);
  if (!uid) return;
  if (requestsLoRA(req.body)) {
    return res.status(400).json({ success: false, error: "This model supports full-parameter training only." });
  }
  const model = validateModel(req.body?.model, req.user);
  if (!model) {
    return res.status(400).json({ success: false, error: "Choose a supported base model." });
  }
  if (req.body?.confirmSubmit !== true) {
    return res.status(400).json({ success: false, error: "Job submission requires separate explicit approval." });
  }

  const repoName = validateRepoName(req.body?.hfRepoName);
  if (!repoName) {
    return res.status(400).json({ success: false, error: "Provide a valid Hugging Face repository in owner/repository format." });
  }
  const trainingFileId = safeProviderId(req.body?.trainingFileId);
  const validationFileId = req.body?.validationFileId == null ? undefined : safeProviderId(req.body.validationFileId);
  if (!trainingFileId || (req.body?.validationFileId != null && !validationFileId)) {
    return res.status(400).json({ success: false, error: "Invalid uploaded dataset reference." });
  }

  try {
    const session = await getRecord("nebius-session", uid) as NebiusSession | null;
    const upload = session?.upload;
    if (!upload || upload.model !== model || upload.trainingFileId !== trainingFileId
      || (upload.validationFileId || undefined) !== validationFileId) {
      return res.status(403).json({ success: false, error: "Jobs can only use your own uploaded datasets." });
    }
    const credentials = providerCredentials();
    if (!credentials.nebius || !credentials.huggingFace) {
      return res.status(503).json({ success: false, error: "Required training credentials are not configured." });
    }

    try {
      consumeTraining(req.user, model);
    } catch (error: any) {
      return res.status(error.status || 503).json({ success: false, error: error.message });
    }
    let submitted = false;
    try {
    const requestBody = {
      model,
      training_file: trainingFileId,
      ...(validationFileId ? { validation_file: validationFileId } : {}),
      ...(typeof req.body?.suffix === "string" && req.body.suffix.trim()
        ? { suffix: req.body.suffix.trim().replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 64) }
        : {}),
      method: {
        type: "supervised",
        supervised: { hyperparameters: TRAINING_HYPERPARAMETERS },
      },
      integrations: [{
        type: "hf",
        hf: {
          output_repo_name: repoName,
          api_token: credentials.huggingFace,
        },
      }],
    };
    const job = await nebiusRequest("/fine_tuning/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    const jobId = safeProviderId(job?.id);
    if (!jobId) throw new ProviderError(502);
    submitted = true;

    const saved = {
      ownerId: uid,
      id: jobId,
      model,
      hfRepoName: repoName,
      trainingFileId,
      validationFileId: validationFileId || null,
      hfRepoPublic: false,
      status: typeof job?.status === "string" && !hasCredential(job.status) ? job.status.slice(0, 64) : "unknown",
      createdAt: typeof job?.created_at === "number" ? job.created_at : null,
    };
    if (!await createRecord("nebius-job", jobId, saved)) {
      return res.status(502).json({ success: false, error: "The job could not be safely recorded." });
    }
    return res.json({ success: true, job: publicJob(job, saved) });
    } catch (error) {
      if (!submitted) restoreTraining(uid, model);
      return providerFailure(res, error, "Could not create the fine-tuning job.");
    }
  } catch (error) {
    return providerFailure(res, error, "Could not prepare the fine-tuning job.");
  }
});

router.get("/nebius/finetune/latest", async (req: AuthRequest, res) => {
  const uid = requireUser(req, res);
  if (!uid) return;
  try {
    const records = await listRecords("nebius-job", uid);
    const latest = records.at(-1);
    return res.json({
      success: true,
      jobId: latest?.data?.id || latest?.id || null,
      createdAt: latest?.createdAt?.toISOString?.() || null,
    });
  } catch {
    return res.status(503).json({ success: false, error: "Training storage is unavailable." });
  }
});

router.get("/nebius/finetune/jobs/:id", async (req: AuthRequest, res) => {
  const uid = requireUser(req, res);
  if (!uid) return;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const jobId = safeProviderId(rawId);
  if (!jobId) return res.status(400).json({ success: false, error: "Invalid job ID." });

  try {
    const saved = await getRecord("nebius-job", jobId);
    if (!saved || saved.ownerId !== uid) {
      return res.status(404).json({ success: false, error: "Job not found." });
    }
    const job = await nebiusRequest(`/fine_tuning/jobs/${encodeURIComponent(jobId)}`, {
      signal: AbortSignal.timeout(15000),
    });
    const status = typeof job?.status === "string" && !hasCredential(job.status)
      ? job.status.slice(0, 64)
      : "unknown";
    let hfRepoPublic = saved.hfRepoPublic === true;
    if (["succeeded", "completed"].includes(status.toLowerCase()) && !hfRepoPublic) {
      await makeHuggingFaceModelPublic(saved.hfRepoName);
      hfRepoPublic = true;
    }
    const safeSaved = {
      ...saved,
      status,
      hfRepoPublic,
      createdAt: typeof job?.created_at === "number" ? job.created_at : saved.createdAt,
    };
    await setRecord("nebius-job", jobId, safeSaved);
    return res.json({ success: true, job: publicJob(job, safeSaved) });
  } catch (error) {
    return providerFailure(res, error, "Could not retrieve the job status.");
  }
});

export default router;
