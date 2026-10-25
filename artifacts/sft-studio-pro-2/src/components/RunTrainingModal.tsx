import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X, Cpu, Upload, CheckCircle, AlertCircle, RefreshCw, Download,
  ShieldAlert, Cloud, ExternalLink
} from "lucide-react";
import { validateRegistryOutput } from "../lib/registry-validation";
import { PaymentGate, trainingPlan } from "./PaymentGate";

const TRAINING_MODELS: Record<string, { model: string; base: string; evaluations: number }> = {
  "Qwen3.5 9 Base": { model: "Qwen/Qwen3.5-9B", base: "Qwen/Qwen3.5-9B-Base", evaluations: 1 },
  "Qwen3.5 4B Base": { model: "Qwen/Qwen3.5-4B", base: "Qwen/Qwen3.5-4B", evaluations: 1 },
  "Llama 3.1 70B": { model: "meta-llama/Llama-3.3-70B-Instruct-Reference", base: "meta-llama/Llama-3.1-70B", evaluations: 1 },
};
const ADDITIONAL_TRAINING_MODELS: Record<string, { model: string; base: string; evaluations: number }> = {
  "Qwen/Qwen3-14B-Base": { model: "Qwen/Qwen3-14B-Base", base: "Qwen/Qwen3-14B-Base", evaluations: 1 },
  "Qwen/Qwen2.5-72B": { model: "Qwen/Qwen2.5-72B", base: "Qwen/Qwen2.5-72B", evaluations: 1 },
  "Qwen/Qwen2.5-32B": { model: "Qwen/Qwen2.5-32B", base: "Qwen/Qwen2.5-32B", evaluations: 1 },
};
const ALL_TRAINING_MODELS = { ...TRAINING_MODELS, ...ADDITIONAL_TRAINING_MODELS };
const OWNER_ONLY_MODEL = "Qwen/Qwen2.5-32B";

type SavedModelChoice = {
  togetherModelName: string;
  hfRepoName: string;
  baseTrainingModel: string;
};

type Step = "configure" | "upload" | "submit" | "progress";
const terminalStatuses = new Set(["completed", "succeeded", "error", "user_error", "failed", "cancelled"]);
const successfulStatuses = new Set(["completed", "succeeded"]);
const clearedTrainingJobId = "ftjob-1d4ffb6113644e249a8dcc57bcee0a26";

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

function toNebiusChatMl(records: unknown[]): Array<{ messages: Array<{ role: string; content: string }> }> {
  return records.map((record, index) => {
    const row = record as any;
    if (Array.isArray(row?.messages)) {
      return {
        messages: row.messages.map((message: any) => ({
          role: message.role,
          content: message.content,
        })),
      };
    }
    if (typeof row?.text === "string") {
      const pattern = /<\|im_start\|>(system|user|assistant)\n([\s\S]*?)\n<\|im_end\|>/g;
      const matches = [...row.text.matchAll(pattern)];
      if (matches.length && !row.text.replace(pattern, "").trim()) {
        return {
          messages: matches.map(match => ({ role: match[1], content: match[2] })),
        };
      }
    }
    throw new Error(`Example ${index + 1} is not valid ChatML conversation data.`);
  });
}

export function RunTrainingModal({
  open, onClose, exportFormat, trainingModel, onTrainingModelChange, getSerializedSplits, apiFetch, notify
}: RunTrainingModalProps) {
  const [savedModels, setSavedModels] = useState<SavedModelChoice[]>([]);
  const [continuationModel, setContinuationModel] = useState<SavedModelChoice | null>(null);
  const [ownerOnlyModelAvailable, setOwnerOnlyModelAvailable] = useState(false);
  const [ownerCheckComplete, setOwnerCheckComplete] = useState(false);
  const selectedModel = ALL_TRAINING_MODELS[trainingModel];
  const usesAdditionalModel = Object.prototype.hasOwnProperty.call(ADDITIONAL_TRAINING_MODELS, trainingModel);
  const MODEL_DISPLAY = continuationModel?.hfRepoName || (trainingModel === "Qwen3.5 9 Base"
    ? "Qwen3.5 9B FP8"
    : selectedModel?.model || trainingModel);
  const BASE_DISPLAY = selectedModel?.base || "";
  const [step, setStep] = useState<Step>("configure");
  const [suffix, setSuffix] = useState("");
  const [hfRepoName, setHfRepoName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<any>(null);
  const [files, setFiles] = useState<{ trainingFileId: string; validationFileId: string; trainingCount: number; validationCount: number } | null>(null);
  const [estimate, setEstimate] = useState<any>(null);
  const [job, setJob] = useState<any>(null);
  const [paidModel, setPaidModel] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const splits = open ? getSerializedSplits() : { training: [], validation: [] };
  const is70B = trainingModel === "Llama 3.1 70B";
  const hasReasoning = is70B && [...splits.training, ...splits.validation].some(r => /<think>|sft_reasoning/.test(JSON.stringify(r)));
  const trainingValid = splits.training.length > 0 && !validateRegistryOutput(splits.training, exportFormat);
  const validationValid = splits.validation.length > 0 && !validateRegistryOutput(splits.validation, exportFormat);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  useEffect(() => {
    let cancelled = false;
    if (open) {
      setContinuationModel(null);
      setOwnerOnlyModelAvailable(false);
      setOwnerCheckComplete(false);
      void (async () => {
        try {
          const data = await readApi(await apiFetch("/api/whop/entitlements", { cache: "no-store" }));
          if (!cancelled) setOwnerOnlyModelAvailable(data.bypass === true);
        } catch {
          if (!cancelled) setOwnerOnlyModelAvailable(false);
        } finally {
          if (!cancelled) setOwnerCheckComplete(true);
        }
      })();
      void (async () => {
        try {
          const data = await readApi(await apiFetch("/api/finetune/model-choices", { cache: "no-store" }));
          if (!cancelled) setSavedModels(Array.isArray(data.models) ? data.models : []);
        } catch {
          if (!cancelled) setSavedModels([]);
        }
      })();
      if (job?.id) {
        setStep("progress");
        return;
      }
      setSuffix(current => ["sft-studio", "custom-v1"].includes(current) ? "" : current);
      setStep("configure");
      setError(null);
      setPreflight(null);
      setFiles(null);
      setEstimate(null);
      setJob(null);
      setBusy(false);
      void (async () => {
        try {
          const [together, additional] = await Promise.all([
            apiFetch("/api/finetune/latest", { cache: "no-store", signal: AbortSignal.timeout(25000) }).then(readApi),
            apiFetch("/api/nebius/finetune/latest", { cache: "no-store", signal: AbortSignal.timeout(25000) }).then(readApi),
          ]);
          const togetherCreatedAt = Date.parse(together.createdAt || "");
          const additionalCreatedAt = Date.parse(additional.createdAt || "");
          const useTogether = !!together.jobId
            && (!additional.jobId || togetherCreatedAt >= additionalCreatedAt);
          const restoredJob = useTogether
            ? { id: together.jobId, provider: "together" }
            : additional.jobId ? { id: additional.jobId, provider: "nebius" } : null;
          if (!cancelled && restoredJob && restoredJob.id !== clearedTrainingJobId) {
            setJob({ ...restoredJob, restored: true });
            setStep("progress");
          }
        } catch {
          if (!cancelled) setError("Unable to restore the previous training status. Close and reopen the trainer to retry.");
        }
      })();
    }
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (ownerCheckComplete && !ownerOnlyModelAvailable && trainingModel === OWNER_ONLY_MODEL) {
      onTrainingModelChange("Qwen3.5 9 Base");
      setPaidModel(null);
    }
  }, [ownerCheckComplete, ownerOnlyModelAvailable, trainingModel, onTrainingModelChange]);

  useEffect(() => {
    stopPolling();
    const jobId = job?.id;
    if (!jobId) return;
    if (jobId === clearedTrainingJobId) {
      setJob(null);
      setStep("configure");
      return;
    }
    let cancelled = false;
    let checking = false;
    const refresh = async () => {
      if (checking) return;
      checking = true;
      try {
        const statusPath = job?.provider === "nebius"
          ? `/api/nebius/finetune/jobs/${encodeURIComponent(jobId)}`
          : `/api/finetune/jobs/${encodeURIComponent(jobId)}`;
        const data = await readApi(await apiFetch(statusPath, {
          cache: "no-store", signal: AbortSignal.timeout(25000),
        }));
        if (cancelled) return;
        const status = String(data.job?.status || "").trim().toLowerCase();
        const terminal = terminalStatuses.has(status)
          && (!successfulStatuses.has(status) || data.job?.modelReady === true);
        if (job?.restored && terminal) {
          // A previous run that already finished is not shown again; start from a clean trainer.
          stopPolling();
          setJob(null);
          setStep("configure");
          return;
        }
        setJob((current: any) => ({ ...current, ...data.job, restored: false }));
        setError(null);
        if (terminal) {
          stopPolling();
          if (successfulStatuses.has(status)) {
            try {
              if (job?.provider !== "nebius") {
                const choices = await readApi(await apiFetch("/api/finetune/model-choices", { cache: "no-store" }));
                if (!cancelled) setSavedModels(Array.isArray(choices.models) ? choices.models : []);
              }
            } catch {
              if (!cancelled) setError("Training completed, but saved models could not be refreshed. Reopen the trainer to retry.");
            }
            notify(`Training complete. Open the automated trainer for your model's Hugging Face repository link.`, "success");
          }
        }
      } catch {
        if (!cancelled) setError("Unable to refresh training status. Retrying automatically.");
      } finally {
        checking = false;
      }
    };
    pollRef.current = setInterval(refresh, 10000);
    void refresh();
    window.addEventListener("focus", refresh);
    return () => { cancelled = true; stopPolling(); window.removeEventListener("focus", refresh); };
  }, [job?.id, open]);

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
      const data = await readApi(await apiFetch(usesAdditionalModel ? "/api/nebius/finetune/preflight" : "/api/finetune/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(usesAdditionalModel
          ? { model: selectedModel.model }
          : { suffix, hfRepoName, trainingModel }),
      }));
      setPreflight(data);
      if (Object.values(data.credentials || {}).some(value => value !== true)) {
        setError("Required server credentials are not configured yet. Add them in app settings, then run preflight again.");
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
      if (trainingModel === "Llama 3.1 70B") {
        // Reasoning batches cannot be uploaded for this model.
        const stripReasoning = (records: unknown[]) => records.filter(r => !/<think>|sft_reasoning/.test(JSON.stringify(r)));
        current.training = stripReasoning(current.training);
        current.validation = stripReasoning(current.validation);
      }
      const trainingRecords = usesAdditionalModel ? toNebiusChatMl(current.training) : current.training;
      const validationRecords = usesAdditionalModel ? toNebiusChatMl(current.validation) : current.validation;
      const formatToValidate = usesAdditionalModel ? "chatml" : exportFormat;
      const trainErr = validateRegistryOutput(trainingRecords, formatToValidate);
      const valErr = validateRegistryOutput(validationRecords, formatToValidate);
      if (current.training.length === 0 || current.validation.length === 0 || trainErr || valErr) {
        throw new Error(trainErr || valErr || "Both splits must be non-empty before upload.");
      }
      const toJsonl = (records: unknown[]) => records.map(r => JSON.stringify(r)).join("\n");
      const data = await readApi(await apiFetch(usesAdditionalModel ? "/api/nebius/finetune/upload" : "/api/finetune/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(usesAdditionalModel ? {
          trainingJsonl: toJsonl(trainingRecords),
          validationJsonl: toJsonl(validationRecords),
          suffix,
          model: selectedModel.model,
          confirmUpload: true,
        } : {
          trainingJsonl: toJsonl(current.training),
          validationJsonl: toJsonl(current.validation),
          suffix,
          trainingModel,
          confirmUpload: true,
        }),
      }));
      setFiles({ ...data, validationFileId: data.validationFileId || "" });
      if (!usesAdditionalModel) {
        const est = await readApi(await apiFetch("/api/finetune/estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trainingFileId: data.trainingFileId,
            validationFileId: data.validationFileId,
            trainingModel,
            ...(continuationModel ? { fromCheckpoint: continuationModel.togetherModelName } : {}),
          }),
        }));
        setEstimate(est.estimate);
      }
      setStep("submit");
      notify("Datasets uploaded and validated. Ready to submit.", "success");
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
      const data = await readApi(await apiFetch(usesAdditionalModel ? "/api/nebius/finetune/jobs" : "/api/finetune/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(usesAdditionalModel ? {
          trainingFileId: files.trainingFileId,
          validationFileId: files.validationFileId || null,
          suffix,
          hfRepoName: `RoseG/${hfRepoName.trim()}`,
          model: selectedModel.model,
          confirmSubmit: true,
        } : {
          trainingFileId: files.trainingFileId,
          validationFileId: files.validationFileId,
          suffix,
          hfRepoName,
          trainingModel,
          ...(continuationModel ? { fromCheckpoint: continuationModel.togetherModelName } : {}),
          confirmSubmit: true,
        }),
      }));
      setJob({
        ...data.job,
        provider: usesAdditionalModel ? "nebius" : "together",
        hfRepoName: data.job.hfRepoName || `RoseG/${hfRepoName.trim()}`,
      });
      setStep("progress");
      notify(`Fine-tune job ${data.job.id} submitted.`, "success");
    } catch (e: any) {
      setError(e?.message || "Job submission failed. The job was not resubmitted.");
    } finally {
      setBusy(false);
    }
  };

  const downloadCheckpoint = async () => {
    if (!job?.id) return;
    if (job.provider === "nebius") {
      window.open(`${outputRepoUrl}/tree/main`, "_blank", "noopener");
      return;
    }
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

  const statusLabel = String(job?.status || "").trim().toLowerCase();
  const isSuccessful = successfulStatuses.has(statusLabel) && job?.modelReady === true;
  const isTerminal = terminalStatuses.has(statusLabel) && (!successfulStatuses.has(statusLabel) || isSuccessful);
  const outputModelName = job?.hfRepoName || (hfRepoName.trim() ? `RoseG/${hfRepoName.trim()}` : "");
  const outputRepoUrl = `https://huggingface.co/${outputModelName.split("/").map(encodeURIComponent).join("/")}`;
  const closeTrainer = () => {
    if (busy || (job?.id && !isTerminal)) return;
    if (isTerminal) setJob(null);
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
                  Uploads your approved Registry dataset and runs a full fine-tune. Data is sent only after your explicit approval at each step.
                </p>
                <p className="text-[11px] text-slate-300 mt-2">
                  Training typically takes 1–3 hours. When it completes, you will receive the public Hugging Face repository link for your model.
                </p>
              </div>
              {(!job?.id || isTerminal) && (
                <button type="button" onClick={closeTrainer} className="p-1.5 rounded-lg hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition cursor-pointer">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Fixed configuration summary */}
            <div className="p-3.5 rounded-xl bg-slate-900/50 border border-slate-800 text-[11px] font-mono text-slate-400 space-y-1.5">
              <div className="flex justify-between"><span>Training model</span><span className="text-slate-200">{MODEL_DISPLAY}</span></div>
              <div className="flex justify-between"><span>Base model</span><span className="text-slate-200">{BASE_DISPLAY}</span></div>
              <div className="flex justify-between"><span>Training type</span><span className="text-slate-200">Full (LoRA disabled)</span></div>
              <div className="flex justify-between"><span>Epochs</span><span className="text-slate-200">2</span></div>
              {usesAdditionalModel && <div className="flex justify-between"><span>Sequence packing</span><span className="text-slate-200">8,192 tokens</span></div>}
              <div className="flex justify-between"><span>Evaluations</span><span className="text-slate-200">{selectedModel?.evaluations ?? 1}</span></div>
              <div className="flex justify-between"><span>Training format</span><span className="text-emerald-400">{usesAdditionalModel ? "ChatML Conversation (messages)" : "ChatML Instruction (<|im_start|>)"}</span></div>
              <div className="flex justify-between border-t border-slate-800 pt-1.5"><span>Training split</span><span className="text-green-400 font-bold">{splits.training.length} examples</span></div>
              <div className="flex justify-between"><span>Validator split</span><span className="text-yellow-400 font-bold">{splits.validation.length} examples</span></div>
            </div>

            {(!trainingValid || !validationValid) && step === "configure" && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/5 border border-red-500/20 text-[11px] text-red-300">
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                <span>Both splits must be non-empty and pass the automatic {usesAdditionalModel ? "ChatML conversation" : "ChatML Instruction"} format check before training.</span>
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
                    value={continuationModel ? `checkpoint:${continuationModel.togetherModelName}` : trainingModel}
                    disabled={busy}
                    onChange={e => {
                      const choice = savedModels.find(model => `checkpoint:${model.togetherModelName}` === e.target.value);
                      if (choice) {
                        if (choice.baseTrainingModel !== trainingModel) setPaidModel(null);
                        setContinuationModel(choice);
                        onTrainingModelChange(choice.baseTrainingModel);
                        setSuffix(current => ["sft-studio", "custom-v1"].includes(current) ? "" : current);
                        setPreflight(null);
                        setError(null);
                        return;
                      }
                      if (e.target.value !== trainingModel) setPaidModel(null);
                      setContinuationModel(null);
                      onTrainingModelChange(e.target.value);
                      setSuffix(current => ["sft-studio", "custom-v1"].includes(current) ? "" : current);
                      setPreflight(null);
                      setError(null);
                    }}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                  >
                    {Object.entries(ALL_TRAINING_MODELS)
                      .filter(([key]) => key !== OWNER_ONLY_MODEL || ownerOnlyModelAvailable)
                      .map(([key, model]) => <option key={key} value={key}>{model.base}</option>)}
                    {savedModels.length > 0 && (
                      <optgroup label="Continue from a previous model">
                        {savedModels.map(model => (
                          <option key={model.togetherModelName} value={`checkpoint:${model.togetherModelName}`}>{model.hfRepoName}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  {hasReasoning && (
                    <div className="mt-2 flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>Reasoning batches cannot be uploaded for Llama 3.1 70B. All reasoning examples will be excluded from this training run.</span>
                    </div>
                  )}
                </div>
                <div>
                  <PaymentGate key={trainingModel} apiFetch={apiFetch} planKey={trainingPlan[trainingModel]}
                    onReady={ready => setPaidModel(ready ? trainingModel : null)} />
                  <label htmlFor="output-model-name" className="block text-xs font-bold text-slate-300 mb-1 mt-3">What would you like to name your model?</label>
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
                    placeholder="e.g. ft-123"
                    maxLength={64}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-emerald-500/50 font-mono"
                  />
                </div>
                <button
                  type="button"
                  onClick={runPreflight}
                  disabled={busy || paidModel !== trainingModel || !trainingValid || !validationValid || !hfRepoName.trim()}
                  className="w-full py-2.5 px-4 rounded-xl kk-primary text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
                >
                  {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                  <span>{busy ? "Running Preflight…" : "Run Preflight Check"}</span>
                </button>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Preflight confirms server credentials. No data is uploaded and nothing is billed at this step.
                </p>
              </div>
            )}

            {step === "upload" && (
              <div className="space-y-3">
                <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-[11px] text-emerald-300">
                  <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>Preflight passed: server credentials are configured.</span>
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
                  This sends both automatically formatted {usesAdditionalModel ? "ChatML conversation" : "ChatML Instruction"} datasets after approval. Starting training still requires separate approval.
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
                  isSuccessful ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-300"
                  : isTerminal ? "bg-red-500/5 border-red-500/20 text-red-300"
                  : "bg-blue-500/5 border-blue-500/20 text-blue-300"
                }`}>
                  {isSuccessful ? <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    : isTerminal ? <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    : <RefreshCw className="h-4 w-4 shrink-0 mt-0.5 animate-spin" />}
                  <span>
                    Job <span className="font-mono font-bold">{job.id}</span> — status: <span className="font-bold uppercase">{job.status || "unknown"}</span>
                    {!isTerminal && " (updates automatically every 10 seconds)"}
                  </span>
                </div>
                {!isTerminal && (
                  <p className="text-[11px] text-slate-300">You can close this window and return to the trainer. Keep the app open for automatic completion updates.</p>
                )}
                {Array.isArray(job.events) && job.events.length > 0 && (
                  <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-[10px] font-mono text-slate-400 space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
                    {job.events.map((e: string, i: number) => <div key={i}>• {e}</div>)}
                  </div>
                )}
                {isSuccessful && (
                  <div className="space-y-2">
                    {outputModelName && <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800 text-[11px] font-mono text-slate-300">
                      <p>Output model: {outputModelName}</p>
                      <a href={outputRepoUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-2 break-all text-emerald-400 underline">
                        {outputRepoUrl}<ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      </a>
                    </div>}
                    {(job.modelOutputPath || job.provider === "nebius") && (
                      <button
                        type="button"
                        onClick={downloadCheckpoint}
                        disabled={busy || (job.provider !== "nebius" && !job.modelOutputPath)}
                        className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-green-500/20 to-emerald-600/20 hover:from-green-500/30 hover:to-emerald-600/30 border border-green-500/40 text-slate-200 text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
                      >
                        {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 text-green-400" />}
                        <span>{busy ? "Preparing Download…" : job.provider === "nebius" ? "Open Model Files to Download" : "Download Full Checkpoint"}</span>
                      </button>
                    )}
                  </div>
                )}
                {isTerminal && <button type="button" onClick={() => { setJob(null); setFiles(null); setError(null); setStep("configure"); }}
                  className="w-full rounded-xl kk-primary px-4 py-2.5 text-xs font-bold">Start another training run</button>}
                {job.id === clearedTrainingJobId && <button type="button" onClick={() => {
                  stopPolling();
                  setJob(null);
                  setFiles(null);
                  setError(null);
                  setBusy(false);
                  setStep("configure");
                }} className="w-full rounded-xl kk-primary px-4 py-2.5 text-xs font-bold">Dismiss from workspace</button>}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
