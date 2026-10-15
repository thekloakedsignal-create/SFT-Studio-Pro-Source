import { Router, type IRouter } from "express";
import path from "path";
import fs from "fs";
import { optionalAuth, type AuthRequest } from "../middleware/auth.ts";
import { logger } from "../lib/logger.ts";

// Together AI full fine-tuning automation for the SFT Studio Data Registry.
// All provider (Together AI) and Hugging Face credentials live exclusively in
// server-side environment secrets and are never returned, logged, or persisted.
//
// Required secrets (add via Replit Secrets):
//   TOGETHER_API_KEY      - Together AI API key
//   HF_TOKEN              - Hugging Face access token (write access for export)
// Optional:
//   HF_OUTPUT_REPO_NAME   - default Hugging Face output repository placeholder
//
// Security model: every endpoint requires a verified signed-in account (Firebase
// ID token). Billable actions are additionally gated server-side: uploads require
// a recent successful preflight, and job submission requires the caller's own
// validated uploaded files plus a cost estimate retrieved for exactly those files.
// Uploaded files, estimates, and jobs are tracked per owner; status and download
// are only available to the account that created the job.

const TOGETHER_API_BASE = "https://api.together.ai/v1";

// Together catalog templates paired with the selected Hugging Face checkpoint.
const TRAINING_CONFIGS: Record<string, {
  model: string;
  from_hf_model: string;
  n_evals: number;
  batch_size?: number;
  max_seq_length?: number;
  gradient_accumulation_steps?: number;
  max_grad_norm?: number;
  weight_decay?: number;
  packing?: boolean;
  n_checkpoints?: number;
  learning_rate?: number;
  lr_scheduler?: { lr_scheduler_type: string };
}> = {
  "Qwen3.5 9 Base": {
    model: "Qwen/Qwen3.5-9B",
    from_hf_model: "Qwen/Qwen3.5-9B-Base",
    n_evals: 1,
    batch_size: 8,
    gradient_accumulation_steps: 1,
    max_grad_norm: 1,
    weight_decay: 0,
    packing: true,
    max_seq_length: 65536,
    n_checkpoints: 1,
    learning_rate: 0.00001,
    lr_scheduler: { lr_scheduler_type: "cosine" },
  },
  "Qwen3.5 4B Base": {
    model: "Qwen/Qwen3.5-4B",
    from_hf_model: "Qwen/Qwen3.5-4B-Base",
    n_evals: 1,
    batch_size: 8,
    gradient_accumulation_steps: 1,
    max_grad_norm: 1,
    weight_decay: 0,
    packing: true,
    max_seq_length: 131072,
    n_checkpoints: 1,
    learning_rate: 0.00001,
    lr_scheduler: { lr_scheduler_type: "cosine" },
  },
  "Llama 3.1 70B": {
    model: "meta-llama/Llama-3.3-70B-Instruct-Reference",
    from_hf_model: "meta-llama/Llama-3.1-70B",
    n_evals: 1,
    batch_size: 32,
    gradient_accumulation_steps: 1,
    max_grad_norm: 1,
    weight_decay: 0,
    packing: true,
    max_seq_length: 24576,
    n_checkpoints: 1,
    learning_rate: 0.00001,
    lr_scheduler: { lr_scheduler_type: "cosine" },
  },
};
function getTrainingConfig(selection: unknown) {
  const key = selection === undefined ? "Qwen3.5 9 Base" : selection;
  return typeof key === "string" && Object.prototype.hasOwnProperty.call(TRAINING_CONFIGS, key)
    ? TRAINING_CONFIGS[key] : undefined;
}
const N_EPOCHS = 2;
const PREFLIGHT_TTL_MS = 60 * 60 * 1000; // upload allowed within 1h of preflight

const TERMINAL_JOB_STATUSES = new Set(["completed", "error", "cancelled"]);

// Per-owner consent/flow state and job ownership, persisted across restarts.
interface OwnerSession {
  preflightAt?: string;
  preflightModel?: string;
  upload?: {
    trainingFileId: string;
    validationFileId: string;
    trainingCount: number;
    validationCount: number;
    at: string;
  };
  estimate?: {
    trainingFileId: string;
    validationFileId: string;
    model?: string;
    estimate: unknown;
    at: string;
  };
}
interface FinetuneStore {
  sessions: Record<string, OwnerSession>;
  jobOwners: Record<string, string>;
}

const DATA_DIR = path.join(process.cwd(), ".data");
const STORE_FILE = path.join(DATA_DIR, "finetune-sessions.json");

function loadStore(): FinetuneStore {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(STORE_FILE, "utf-8"));
      return {
        sessions: parsed?.sessions && typeof parsed.sessions === "object" ? parsed.sessions : {},
        jobOwners: parsed?.jobOwners && typeof parsed.jobOwners === "object" ? parsed.jobOwners : {},
      };
    }
  } catch (error) {
    logger.warn({ error: String(error) }, "Fine-tune session store could not be read; starting fresh");
  }
  return { sessions: {}, jobOwners: {} };
}

function saveStore(store: FinetuneStore) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${STORE_FILE}.${Math.random().toString(36).slice(2)}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(store), "utf-8");
    fs.renameSync(tmp, STORE_FILE);
  } catch (error) {
    logger.warn({ error: String(error) }, "Fine-tune session store could not be saved");
  }
}

const store = loadStore();

const router: IRouter = Router();
router.use(optionalAuth);

// Require a verified signed-in account. A self-asserted device ID is not
// sufficient to spend money against the server's shared provider credentials.
function requireUser(req: AuthRequest, res: any): string | null {
  const uid = req.user?.uid;
  if (typeof uid !== "string" || !uid.trim()) {
    res.status(401).json({ success: false, error: "Training automation requires a signed-in account." });
    return null;
  }
  return uid;
}

function togetherHeaders(): Record<string, string> {
  const key = process.env.TOGETHER_API_KEY;
  if (!key) throw new Error("Together AI is not configured on the server.");
  return { Authorization: `Bearer ${key}` };
}

async function togetherRequest(apiPath: string, init: RequestInit = {}): Promise<any> {
  const response = await fetch(`${TOGETHER_API_BASE}${apiPath}`, {
    ...init,
    headers: { ...togetherHeaders(), ...(init.headers || {}) },
  });
  const text = await response.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (!response.ok) {
    const message = body?.error?.message || body?.message || `Together AI request failed (HTTP ${response.status}).`;
    const err: any = new Error(message);
    err.status = response.status;
    throw err;
  }
  return body;
}

function validateJsonl(content: unknown, label: string): { lines: string[]; error?: string } {
  if (typeof content !== "string" || !content.trim()) {
    return { lines: [], error: `The ${label} dataset is empty.` };
  }
  const lines = content.split("\n").filter(l => l.trim().length > 0);
  if (lines.length === 0) return { lines: [], error: `The ${label} dataset is empty.` };
  for (let i = 0; i < lines.length; i++) {
    try {
      const row = JSON.parse(lines[i]);
      if (!row || Array.isArray(row) || typeof row !== "object") {
        return { lines: [], error: `The ${label} dataset line ${i + 1} is not a JSON object.` };
      }
    } catch {
      return { lines: [], error: `The ${label} dataset line ${i + 1} is not valid JSON.` };
    }
  }
  return { lines };
}

async function uploadFineTuneFile(content: string, fileName: string): Promise<{ id: string }> {
  const form = new FormData();
  form.append("file", new Blob([content], { type: "application/jsonl" }), fileName);
  form.append("file_name", fileName);
  form.append("purpose", "fine-tune");
  const uploaded = await togetherRequest("/files/upload", { method: "POST", body: form });
  if (!uploaded?.id) throw new Error(`Together AI did not return a file ID for ${fileName}.`);
  return { id: uploaded.id };
}

async function waitForFileProcessing(fileId: string): Promise<void> {
  // Poll ingestion/validation status; never resubmit on ambiguous responses.
  const maxAttempts = 30;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const info = await togetherRequest(`/files/${encodeURIComponent(fileId)}`);
    const status = String(info?.processing_status || info?.status || "").toLowerCase();
    if (status === "completed" || (!info?.processing_status && (info?.Processed === true || status === "processed"))) return;
    if (status === "invalid_format" || status.includes("error") || status.includes("fail")) {
      throw new Error(info?.error || `Together AI could not process uploaded file ${fileId}.`);
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error("Timed out waiting for Together AI to validate an uploaded dataset.");
}

// Preflight checks only that the server credentials are configured.
router.post("/finetune/preflight", async (req: AuthRequest, res) => {
  const uid = requireUser(req, res);
  if (!uid) return;
  const config = getTrainingConfig(req.body?.trainingModel);
  if (!config) return res.status(400).json({ success: false, error: "Unsupported training model." });
  const togetherConfigured = Boolean(process.env.TOGETHER_API_KEY);
  const huggingFaceConfigured = Boolean(process.env.HF_TOKEN);
  if (!togetherConfigured || !huggingFaceConfigured) {
    return res.json({
      success: true,
      credentials: { together: togetherConfigured, huggingFace: huggingFaceConfigured },
      model: config.model,
      fromHfModel: config.from_hf_model,
      defaultHfRepoName: (process.env.HF_OUTPUT_REPO_NAME || "").replace(/^RoseG\//i, ""),
      error: "Server API credentials are not fully configured yet.",
    });
  }
  store.sessions[uid] = { ...store.sessions[uid], preflightAt: new Date().toISOString(), preflightModel: config.model };
  saveStore(store);
  return res.json({
    success: true,
    credentials: { together: true, huggingFace: true },
    model: config.model,
    fromHfModel: config.from_hf_model,
    defaultHfRepoName: (process.env.HF_OUTPUT_REPO_NAME || "").replace(/^RoseG\//i, ""),
    settings: { trainingType: "Full (LoRA disabled)", epochs: N_EPOCHS, evaluations: config.n_evals },
  });
});

// Upload both splits (requires a recent successful preflight and explicit approval).
router.post("/finetune/upload", async (req: AuthRequest, res) => {
  const uid = requireUser(req, res);
  if (!uid) return;
  const config = getTrainingConfig(req.body?.trainingModel);
  if (!config) return res.status(400).json({ success: false, error: "Unsupported training model." });
  const { trainingJsonl, validationJsonl, suffix, confirmUpload } = req.body || {};
  if (confirmUpload !== true) {
    return res.status(400).json({ success: false, error: "Dataset upload requires explicit approval." });
  }
  const preflightAt = store.sessions[uid]?.preflightAt;
  if (!preflightAt || Date.now() - Date.parse(preflightAt) > PREFLIGHT_TTL_MS
    || (store.sessions[uid]?.preflightModel || TRAINING_CONFIGS["Qwen3.5 9 Base"].model) !== config.model) {
    return res.status(409).json({ success: false, error: "Run the preflight check before uploading datasets." });
  }
  const training = validateJsonl(trainingJsonl, "training");
  if (training.error) return res.status(400).json({ success: false, error: training.error });
  const validation = validateJsonl(validationJsonl, "validation");
  if (validation.error) return res.status(400).json({ success: false, error: validation.error });

  const safeSuffix = (typeof suffix === "string" && suffix.trim() ? suffix.trim() : "sft-studio").replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 40);
  try {
    const trainFile = await uploadFineTuneFile(training.lines.join("\n"), `${safeSuffix}-training.jsonl`);
    const valFile = await uploadFineTuneFile(validation.lines.join("\n"), `${safeSuffix}-validation.jsonl`);
    await waitForFileProcessing(trainFile.id);
    await waitForFileProcessing(valFile.id);
    store.sessions[uid] = {
      ...store.sessions[uid],
      upload: {
        trainingFileId: trainFile.id,
        validationFileId: valFile.id,
        trainingCount: training.lines.length,
        validationCount: validation.lines.length,
        at: new Date().toISOString(),
      },
      estimate: undefined,
    };
    saveStore(store);
    return res.json({
      success: true,
      trainingFileId: trainFile.id,
      validationFileId: valFile.id,
      trainingCount: training.lines.length,
      validationCount: validation.lines.length,
    });
  } catch (error: any) {
    logger.warn({ error: error?.message }, "Fine-tune dataset upload failed");
    return res.status(error?.status || 502).json({ success: false, error: error?.message || "Dataset upload failed." });
  }
});

// Cost estimate for the exact approved configuration; file IDs must match the
// caller's own uploaded datasets.
router.post("/finetune/estimate", async (req: AuthRequest, res) => {
  const uid = requireUser(req, res);
  if (!uid) return;
  const config = getTrainingConfig(req.body?.trainingModel);
  if (!config) return res.status(400).json({ success: false, error: "Unsupported training model." });
  const { trainingFileId, validationFileId } = req.body || {};
  const upload = store.sessions[uid]?.upload;
  if (!upload || upload.trainingFileId !== trainingFileId || upload.validationFileId !== validationFileId) {
    return res.status(403).json({ success: false, error: "Cost estimates are only available for your own uploaded datasets." });
  }
  try {
    const estimate = await togetherRequest("/fine-tunes/estimate-price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        training_file: trainingFileId,
        validation_file: validationFileId,
        ...config,
        training_method: { method: "sft", train_on_inputs: "auto" },
        training_type: { type: "Full" },
        n_epochs: N_EPOCHS,
        n_evals: config.n_evals,
      }),
    });
    if (!estimate || estimate.estimation_available === false) {
      return res.status(422).json({ success: false, error: "Together AI could not produce a price estimate for this configuration." });
    }
    store.sessions[uid] = {
      ...store.sessions[uid],
      estimate: { trainingFileId, validationFileId, model: config.model, estimate, at: new Date().toISOString() },
    };
    saveStore(store);
    return res.json({ success: true, estimate });
  } catch (error: any) {
    logger.warn({ error: error?.message }, "Fine-tune price estimate failed");
    return res.status(error?.status || 502).json({ success: false, error: error?.message || "Cost estimate failed." });
  }
});

// Create the full fine-tuning job. Requires explicit approval plus a recorded
// upload and cost estimate for exactly these file IDs under this account.
router.post("/finetune/jobs", async (req: AuthRequest, res) => {
  const uid = requireUser(req, res);
  if (!uid) return;
  const config = getTrainingConfig(req.body?.trainingModel);
  if (!config) return res.status(400).json({ success: false, error: "Unsupported training model." });
  const { trainingFileId, validationFileId, suffix, hfRepoName, confirmSubmit } = req.body || {};
  if (confirmSubmit !== true) {
    return res.status(400).json({ success: false, error: "Job submission requires explicit approval." });
  }
  const session = store.sessions[uid];
  if (!session?.upload || session.upload.trainingFileId !== trainingFileId || session.upload.validationFileId !== validationFileId) {
    return res.status(403).json({ success: false, error: "Jobs can only be created from your own uploaded datasets." });
  }
  if (!session.estimate || session.estimate.trainingFileId !== trainingFileId || session.estimate.validationFileId !== validationFileId
    || (session.estimate.model || TRAINING_CONFIGS["Qwen3.5 9 Base"].model) !== config.model) {
    return res.status(409).json({ success: false, error: "Review a cost estimate for these datasets before submitting the job." });
  }
  const hfToken = process.env.HF_TOKEN;
  if (!hfToken) {
    return res.status(503).json({ success: false, error: "Hugging Face export is not configured on the server." });
  }
  const repoSlug = typeof hfRepoName === "string" ? hfRepoName.trim().replace(/^RoseG\//i, "") : "";
  if (!repoSlug || /[/?#\s]/.test(repoSlug)) {
    return res.status(400).json({ success: false, error: "A Hugging Face output repository name is required." });
  }
  const repoName = `RoseG/${repoSlug}`;
  // Spending control: one active (non-terminal) job per account at a time.
  const ownedActive = Object.entries(store.jobOwners).filter(([, owner]) => owner === uid).map(([id]) => id);
  for (const jobId of ownedActive) {
    try {
      const existing = await togetherRequest(`/fine-tunes/${encodeURIComponent(jobId)}`);
      const status = String(existing?.status || "").toLowerCase();
      if (status && !TERMINAL_JOB_STATUSES.has(status)) {
        return res.status(409).json({ success: false, error: `You already have an active fine-tune job (${jobId}). Wait for it to finish before starting another.` });
      }
    } catch {
      // Unknown/unreachable older job: do not block on it.
    }
  }
  try {
    const job = await togetherRequest("/fine-tunes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        training_file: trainingFileId,
        validation_file: validationFileId,
        ...config,
        training_method: { method: "sft", train_on_inputs: "auto" },
        training_type: { type: "Full" },
        n_epochs: N_EPOCHS,
        n_evals: config.n_evals,
        ...(typeof suffix === "string" && suffix.trim() ? { suffix: suffix.trim().slice(0, 64) } : {}),
        hf_api_token: hfToken,
        hf_output_repo_name: repoName,
      }),
    });
    if (!job?.id) throw new Error("Together AI did not return a job ID.");
    store.jobOwners[job.id] = uid;
    saveStore(store);
    return res.json({
      success: true,
      job: {
        id: job.id,
        status: job.status,
        model: job.model,
        outputName: job.output_name || null,
      },
    });
  } catch (error: any) {
    logger.warn({ error: error?.message }, "Fine-tune job creation failed");
    return res.status(error?.status || 502).json({ success: false, error: error?.message || "Job submission failed." });
  }
});

// Job status + recent event messages for progress display (owner only).
router.get("/finetune/jobs/:id", async (req: AuthRequest, res) => {
  const uid = requireUser(req, res);
  if (!uid) return;
  const jobId = Array.isArray(req.params.id) ? req.params.id[0] ?? "" : req.params.id;
  if (!jobId) return res.status(400).json({ success: false, error: "Missing job ID." });
  if (store.jobOwners[jobId] !== uid) {
    return res.status(404).json({ success: false, error: "Job not found." });
  }
  try {
    const job = await togetherRequest(`/fine-tunes/${encodeURIComponent(jobId)}`);
    let events: string[] = [];
    try {
      const ev = await togetherRequest(`/fine-tunes/${encodeURIComponent(jobId)}/events`);
      const list = Array.isArray(ev?.data) ? ev.data : [];
      events = list.slice(-5).map((e: any) => String(e?.message || "")).filter(Boolean);
    } catch {
      events = [];
    }
    return res.json({
      success: true,
      job: {
        id: job.id,
        status: job.status,
        model: job.model,
        outputName: job.output_name || null,
        modelOutputPath: job.model_output_path || null,
        trainingFileId: job.training_file || null,
        createdAt: job.created_at || null,
        updatedAt: job.updated_at || null,
        events,
      },
    });
  } catch (error: any) {
    logger.warn({ error: error?.message }, "Fine-tune job status failed");
    return res.status(error?.status || 502).json({ success: false, error: error?.message || "Could not retrieve job status." });
  }
});

// Post-completion checkpoint download via model_output_path only (owner only).
// Returns the pre-signed URL so large checkpoints download directly to the browser.
router.post("/finetune/jobs/:id/download", async (req: AuthRequest, res) => {
  const uid = requireUser(req, res);
  if (!uid) return;
  const jobId = Array.isArray(req.params.id) ? req.params.id[0] ?? "" : req.params.id;
  if (!jobId) return res.status(400).json({ success: false, error: "Missing job ID." });
  if (store.jobOwners[jobId] !== uid) {
    return res.status(404).json({ success: false, error: "Job not found." });
  }
  if (req.body?.confirmDownload !== true) {
    return res.status(400).json({ success: false, error: "Checkpoint download requires explicit approval." });
  }
  try {
    const job = await togetherRequest(`/fine-tunes/${encodeURIComponent(jobId)}`);
    if (job?.status !== "completed") {
      return res.status(409).json({ success: false, error: "The checkpoint is only available after the job completes." });
    }
    if (!job?.model_output_path) {
      return res.status(422).json({ success: false, error: "This job has no full fine-tune checkpoint (model_output_path)." });
    }
    const url = `${TOGETHER_API_BASE}/finetune/download?ft_id=${encodeURIComponent(jobId)}&checkpoint=model_output_path`;
    const response = await fetch(url, { method: "GET", headers: togetherHeaders(), redirect: "manual" });
    const location = response.headers.get("location");
    if (location) return res.json({ success: true, url: location });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      let message = `Checkpoint download failed (HTTP ${response.status}).`;
      try { message = JSON.parse(text)?.error?.message || message; } catch { /* keep default */ }
      return res.status(response.status).json({ success: false, error: message });
    }
    return res.status(502).json({ success: false, error: "Together AI did not return a checkpoint download link." });
  } catch (error: any) {
    logger.warn({ error: error?.message }, "Fine-tune checkpoint download failed");
    return res.status(error?.status || 502).json({ success: false, error: error?.message || "Checkpoint download failed." });
  }
});

export default router;
