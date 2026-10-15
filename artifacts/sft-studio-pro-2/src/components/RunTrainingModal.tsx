import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X, Cpu, Upload, CheckCircle, AlertCircle, RefreshCw, Download,
  ShieldAlert, Cloud, ExternalLink
} from "lucide-react";
import { validateRegistryOutput } from "../lib/registry-validation";

const TRAINING_MODELS: Record<string, { model: string; base: string; evaluations?: number; batchSize?: number }> = {
  "Qwen3.5 9 Base": { model: "Qwen/Qwen3.5-9B", base: "Qwen/Qwen3.5-9B-Base", evaluations: 1 },
  "Qwen3.5 4B Base": { model: "Qwen/Qwen3.5-4B", base: "Qwen/Qwen3.5-4B-Base", evaluations: 1 },
  "Llama 3.1 70B": { model: "meta-llama/Llama-3.3-70B-Instruct-Reference", base: "meta-llama/Llama-3.1-70B", evaluations: 1, batchSize: 32 },
};

type Step = "configure" | "upload" | "submit" | "progress";

interface RunTrainingModalProps {
  open: boolean;
  onClose: () => void;
  exportFormat: string;
  trainingModel: string;
  onTrainingModelChange: (model: string) => void;
  // Serialized + ready-to-validate records for each split (compiled from selected, approved batches)
  getSerializedSplits: () => { training: unknown[]; validation: unknown[] };
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  notify: (text: string, type: "success" | "error" | "info") => void;
}

async function readApi(res: Response): Promise<any> {
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `Request failed (HTTP ${res.status}).`);
  }
  return data;
}

export function RunTrainingModal({
  open, onClose, exportFormat, trainingModel, onTrainingModelChange, getSerializedSplits, apiFetch, notify
}: RunTrainingModalProps) {
  const selectedModel = TRAINING_MODELS[trainingModel];
  const MODEL_DISPLAY = selectedModel?.model || trainingModel;
  const BASE_DISPLAY = selectedModel?.base || "";
  const [step, setStep] = useState<Step>("configure");
  const [suffix, setSuffix] = useState(trainingModel === "Qwen3.5 9 Base" ? "sft-studio" : "custom-v1");
  const [hfRepoName, setHfRepoName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<any>(null);
  const [files, setFiles] = useState<{ trainingFileId: string; validationFileId: string; trainingCount: number; validationCount: number } | null>(null);
  const [estimate, setEstimate] = useState<any>(null);
  const [job, setJob] = useState<any>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const splits = open ? getSerializedSplits() : { training: [], validation: [] };
  const trainingValid = splits.training.length > 0 && !validateRegistryOutput(splits.training, exportFormat);
  const validationValid = splits.validation.length > 0 && !validateRegistryOutput(splits.validation, exportFormat);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  useEffect(() => () => stopPolling(), []);

  useEffect(() => {
    if (open) {
      if (job?.id) {
        setStep("progress");
        return;
      }
      setSuffix(current => ["sft-studio", "custom-v1"].includes(current)
        ? (trainingModel === "Qwen3.5 9 Base" ? "sft-studio" : "custom-v1") : current);
      setStep("configure");
      setError(null);
      setPreflight(null);
      setFiles(null);
      setEstimate(null);
      setJob(null);
      setBusy(false);
    }
  }, [open]);

  const pollJob = (jobId: string) => {
    stopPolling();
    let checking = false;
    pollRef.current = setInterval(async () => {
      if (checking) return;
      checking = true;
      try {
        const data = await readApi(await apiFetch(`/api/finetune/jobs/${encodeURIComponent(jobId)}`));
        setJob((current: any) => ({ ...current, ...data.job }));
        if (["completed", "error", "cancelled"].includes(String(data.job?.status || "").toLowerCase())) {
          stopPolling();
          if (String(data.job?.status || "").toLowerCase() === "completed") {
            notify(`Training complete. Open the automated trainer for your model's Hugging Face repository link.`, "success");
          }
        }
      } catch {
        // Keep polling; transient status failures should not lose the run.
      } finally {
        checking = false;
      }
    }, 10000);
  };

  const runPreflight = async () => {
    if (!hfRepoName.trim()) {
      setError("Choose a name for your model before continuing.");
      return;
    }
    if (!trainingValid || !validationValid) {
      setError("Both the training and validator splits must be non-empty and pass the final format check before continuing.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await readApi(await apiFetch("/api/finetune/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suffix, hfRepoName, trainingModel }),
      }));
      setPreflight(data);
      if (!data.credentials?.together || !data.credentials?.huggingFace) {
        setError("Server credentials are not configured yet. Add TOGETHER_API_KEY and HF_TOKEN to the app secrets, then run the preflight again.");
      } else if (!data.modelAvailable) {
        setError(data.error || `${MODEL_DISPLAY} is not currently available for fine-tuning.`);
      } else {
        setStep("upload");
      }
    } catch (e: any) {
      setError(e?.message || "Preflight check failed.");
    } finally {
      setBusy(false);
    }
  };

  const uploadDatasets = async () => {
    setBusy(true);
    setError(null);
    try {
      const current = getSerializedSplits();
      const trainErr = validateRegistryOutput(current.training, exportFormat);
      const valErr = validateRegistryOutput(current.validation, exportFormat);
      if (current.training.length === 0 || current.validation.length === 0 || trainErr || valErr) {
        throw new Error(trainErr || valErr || "Both splits must be non-empty before upload.");
      }
      const toJsonl = (records: unknown[]) => records.map(r => JSON.stringify(r)).join("\n");
      const data = await readApi(await apiFetch("/api/finetune/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trainingJsonl: toJsonl(current.training),
          validationJsonl: toJsonl(current.validation),
          suffix,
          trainingModel,
          confirmUpload: true,
        }),
      }));
      setFiles(data);
      const est = await readApi(await apiFetch("/api/finetune/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trainingFileId: data.trainingFileId, validationFileId: data.validationFileId, trainingModel }),
      }));
      setEstimate(est.estimate);
      setStep("submit");
      notify("Datasets uploaded and validated by Together AI. Review the cost estimate before submitting.", "success");
    } catch (e: any) {
      setError(e?.message || "Dataset upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const submitJob = async () => {
    if (!files) return;
    setBusy(true);
    setError(null);
    try {
      const data = await readApi(await apiFetch("/api/finetune/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trainingFileId: files.trainingFileId,
          validationFileId: files.validationFileId,
          suffix,
          hfRepoName,
          trainingModel,
          confirmSubmit: true,
        }),
      }));
      setJob({ ...data.job, hfRepoName: `RoseG/${hfRepoName.trim()}` });
      setStep("progress");
      pollJob(data.job.id);
      notify(`Fine-tune job ${data.job.id} submitted.`, "success");
    } catch (e: any) {
      setError(e?.message || "Job submission failed. The job was not resubmitted.");
    } finally {
      setBusy(false);
    }
  };

  const downloadCheckpoint = async () => {
    if (!job?.id) return;
    setBusy(true);
    setError(null);
    try {
      const data = await readApi(await apiFetch(`/api/finetune/jobs/${encodeURIComponent(job.id)}/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmDownload: true }),
      }));
      window.open(data.url, "_blank", "noopener");
      notify("Checkpoint download started.", "success");
    } catch (e: any) {
      setError(e?.message || "Checkpoint download failed.");
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = String(job?.status || "").toLowerCase();
  const estimatePrice = estimate?.estimated_total_price ?? estimate?.total_price ?? estimate?.price ?? null;
  const outputModelName = job?.hfRepoName || `RoseG/${hfRepoName.trim()}`;
  const outputRepoUrl = `https://huggingface.co/${outputModelName.split("/").map(encodeURIComponent).join("/")}`;
  const closeTrainer = () => {
    if (busy) return;
    if (["completed", "error", "cancelled"].includes(statusLabel)) setJob(null);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
          onClick={closeTrainer}
        >
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-xl max-h-[85vh] overflow-y-auto bg-slate-950 border border-slate-800 rounded-2xl p-6 space-y-4 custom-scrollbar"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Cpu className="h-5 w-5 text-emerald-400" />
                  Automated Full Fine-Tune
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Uploads your approved Registry dataset to Together AI and runs a full fine-tune. Nothing is sent or billed without your explicit approval at each step.
                </p>
                <p className="text-[11px] text-slate-300 mt-2">
                  Training typically takes 1–3 hours. When it completes, you will receive the public Hugging Face repository link for your model.
                </p>
              </div>
              <button type="button" onClick={closeTrainer} className="p-1.5 rounded-lg hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Fixed configuration summary */}
            <div className="p-3.5 rounded-xl bg-slate-900/50 border border-slate-800 text-[11px] font-mono text-slate-400 space-y-1.5">
              <div className="flex justify-between"><span>Training model</span><span className="text-slate-200">{MODEL_DISPLAY}</span></div>
              <div className="flex justify-between"><span>From HF base (BYOM)</span><span className="text-slate-200">{BASE_DISPLAY}</span></div>
              <div className="flex justify-between"><span>Training type</span><span className="text-slate-200">Full (LoRA disabled)</span></div>
              <div className="flex justify-between"><span>Epochs / Checkpoints</span><span className="text-slate-200">2 / 1</span></div>
              {selectedModel?.evaluations && <div className="flex justify-between"><span>Evaluations</span><span className="text-slate-200">{selectedModel.evaluations}</span></div>}
              {selectedModel?.batchSize && <div className="flex justify-between"><span>Training batch size</span><span className="text-slate-200">{selectedModel.batchSize}</span></div>}
              <div className="flex justify-between"><span>Export format</span><span className="text-emerald-400 uppercase">{exportFormat}</span></div>
              <div className="flex justify-between border-t border-slate-800 pt-1.5"><span>Training split</span><span className="text-green-400 font-bold">{splits.training.length} examples</span></div>
              <div className="flex justify-between"><span>Validator split</span><span className="text-yellow-400 font-bold">{splits.validation.length} examples</span></div>
            </div>

            {(!trainingValid || !validationValid) && step === "configure" && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/5 border border-red-500/20 text-[11px] text-red-300">
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                <span>Both splits must be non-empty and pass the final format check for [{exportFormat.toUpperCase()}] before preflight. Adjust the selection or format above.</span>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/5 border border-red-500/20 text-[11px] text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {step === "configure" && (
              <div className="space-y-3">
                <div>
                  <label htmlFor="training-model" className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Model to train</label>
                  <select
                    id="training-model"
                    value={trainingModel}
                    disabled={busy}
                    onChange={e => {
                      onTrainingModelChange(e.target.value);
                      setSuffix(current => ["sft-studio", "custom-v1"].includes(current)
                        ? (e.target.value === "Qwen3.5 9 Base" ? "sft-studio" : "custom-v1") : current);
                      setPreflight(null);
                      setError(null);
                    }}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                  >
                    {Object.entries(TRAINING_MODELS).map(([key, model]) => <option key={key} value={key}>{model.base}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="output-model-name" className="block text-xs font-bold text-slate-300 mb-1">What would you like to name your model?</label>
                  <div className="flex items-center rounded-lg border border-slate-800 bg-slate-900 focus-within:border-emerald-500/50">
                    <span className="pl-3 text-xs font-mono text-emerald-400">RoseG/</span>
                    <input
                      id="output-model-name"
                      type="text"
                      required
                      value={hfRepoName}
                      onChange={e => setHfRepoName(e.target.value.replace(/^\/+/, "").replace(/[/?#\s]/g, "-"))}
                      placeholder="your-chosen-name"
                      className="min-w-0 flex-1 bg-transparent px-1 py-2 text-xs text-slate-200 outline-none font-mono"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">Your public output model will be named RoseG/{hfRepoName.trim() || "your-chosen-name"}.</p>
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Model Name Suffix</label>
                  <input
                    type="text"
                    value={suffix}
                    onChange={e => setSuffix(e.target.value)}
                    placeholder="sft-studio"
                    maxLength={64}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-emerald-500/50 font-mono"
                  />
                </div>
                <button
                  type="button"
                  onClick={runPreflight}
                  disabled={busy || !trainingValid || !validationValid || !hfRepoName.trim()}
                  className="w-full py-2.5 px-4 rounded-xl kk-primary text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
                >
                  {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                  <span>{busy ? "Running Preflight…" : "Run Preflight Check"}</span>
                </button>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Preflight verifies the live model availability and server credentials. No data is uploaded and nothing is billed at this step.
                </p>
              </div>
            )}

            {step === "upload" && (
              <div className="space-y-3">
                <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-[11px] text-emerald-300">
                  <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>Preflight passed: credentials configured and {MODEL_DISPLAY} is available for fine-tuning.</span>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-900/50 border border-slate-800 text-[11px] font-mono text-slate-400 space-y-1.5">
                  <div className="flex justify-between"><span>Destination HF repo</span><span className="text-slate-200">RoseG/{hfRepoName || "(required)"}</span></div>
                  <div className="flex justify-between"><span>Suffix</span><span className="text-slate-200">{suffix}</span></div>
                  <div className="flex justify-between"><span>Training upload</span><span className="text-green-400">{splits.training.length} examples (JSONL)</span></div>
                  <div className="flex justify-between"><span>Validator upload</span><span className="text-yellow-400">{splits.validation.length} examples (JSONL)</span></div>
                </div>
                <button
                  type="button"
                  onClick={uploadDatasets}
                  disabled={busy || !hfRepoName.trim()}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500/20 to-green-600/20 hover:from-emerald-500/30 hover:to-green-600/30 border border-emerald-500/40 text-slate-200 text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
                >
                  {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 text-emerald-400" />}
                  <span>{busy ? "Uploading & Validating…" : "Approve & Upload Datasets"}</span>
                </button>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  This sends both JSONL datasets to Together AI. The job itself is still a separate approval with its cost estimate.
                </p>
              </div>
            )}

            {step === "submit" && (
              <div className="space-y-3">
                <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-[11px] text-emerald-300">
                  <Cloud className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>Datasets uploaded and validated server-side (training: {files?.trainingFileId}, validation: {files?.validationFileId}).</span>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-900/50 border border-slate-800 text-[11px] font-mono text-slate-400 space-y-1.5">
                  <div className="flex justify-between"><span>Training examples</span><span className="text-green-400 font-bold">{files?.trainingCount}</span></div>
                  <div className="flex justify-between"><span>Validation examples</span><span className="text-yellow-400 font-bold">{files?.validationCount}</span></div>
                  <div className="flex justify-between"><span>Model</span><span className="text-slate-200">{MODEL_DISPLAY}</span></div>
                  <div className="flex justify-between"><span>From HF base</span><span className="text-slate-200">{BASE_DISPLAY}</span></div>
                  <div className="flex justify-between"><span>Output repo</span><span className="text-slate-200">RoseG/{hfRepoName}</span></div>
                  <div className="flex justify-between border-t border-slate-800 pt-1.5 text-base">
                    <span className="text-slate-300 font-bold text-[11px]">Estimated cost</span>
                    <span className="text-emerald-400 font-bold text-sm">
                      {estimatePrice !== null ? `$${Number(estimatePrice).toFixed(2)}` : "See Together response"}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={submitJob}
                  disabled={busy}
                  className="w-full py-2.5 px-4 rounded-xl kk-primary text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
                >
                  {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Cpu className="h-4 w-4" />}
                  <span>{busy ? "Submitting…" : "Approve & Submit Fine-Tune Job"}</span>
                </button>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Submitting starts billable training for the exact configuration shown above. If submission fails, it is not retried automatically.
                </p>
              </div>
            )}

            {step === "progress" && job && (
              <div className="space-y-3">
                <div className={`flex items-start gap-2 p-3 rounded-xl border text-[11px] ${
                  statusLabel === "completed" ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-300"
                  : statusLabel === "error" || statusLabel === "cancelled" ? "bg-red-500/5 border-red-500/20 text-red-300"
                  : "bg-blue-500/5 border-blue-500/20 text-blue-300"
                }`}>
                  {statusLabel === "completed" ? <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    : statusLabel === "error" || statusLabel === "cancelled" ? <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    : <RefreshCw className="h-4 w-4 shrink-0 mt-0.5 animate-spin" />}
                  <span>
                    Job <span className="font-mono font-bold">{job.id}</span> — status: <span className="font-bold uppercase">{job.status || "unknown"}</span>
                    {statusLabel !== "completed" && statusLabel !== "error" && statusLabel !== "cancelled" && " (updates automatically every 10 seconds)"}
                  </span>
                </div>
                {!["completed", "error", "cancelled"].includes(statusLabel) && (
                  <p className="text-[11px] text-slate-300">You can close this window and return to the trainer. Keep the app open for automatic completion updates.</p>
                )}
                {Array.isArray(job.events) && job.events.length > 0 && (
                  <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-[10px] font-mono text-slate-400 space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
                    {job.events.map((e: string, i: number) => <div key={i}>• {e}</div>)}
                  </div>
                )}
                {statusLabel === "completed" && (
                  <div className="space-y-2">
                    <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800 text-[11px] font-mono text-slate-300">
                      <p>Output model: {outputModelName}</p>
                      <a href={outputRepoUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-2 break-all text-emerald-400 underline">
                        {outputRepoUrl}<ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      </a>
                    </div>
                    {job.modelOutputPath && (
                      <button
                        type="button"
                        onClick={downloadCheckpoint}
                        disabled={busy}
                        className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-green-500/20 to-emerald-600/20 hover:from-green-500/30 hover:to-emerald-600/30 border border-green-500/40 text-slate-200 text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
                      >
                        {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 text-green-400" />}
                        <span>{busy ? "Preparing Download…" : "Download Full Checkpoint"}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
