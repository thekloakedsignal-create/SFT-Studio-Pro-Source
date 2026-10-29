import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { LoaderCircle, MessageSquare, Send } from "lucide-react";

type ChatMessage = { role: "user" | "assistant"; content: string };
type TrialStatus = {
  availableModelName: string | null;
  available: boolean;
  trial: null | {
    state: "starting" | "ready" | "expired" | "failed";
    modelName: string;
    expiresAt: string | null;
    remainingMs: number | null;
  };
};
type CompletedModel = {
  jobId: string;
  modelName: string;
  baseModel: string | null;
  hfRepoName: string | null;
  completedAt: string | null;
};
type Props = {
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

export function ModelChatTab({ apiFetch }: Props) {
  const apiFetchRef = useRef(apiFetch);
  apiFetchRef.current = apiFetch;
  const [status, setStatus] = useState<TrialStatus | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [completedModels, setCompletedModels] = useState<CompletedModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await apiFetchRef.current("/api/finetune/model-trial/status", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Could not load model chat.");
      setStatus(result);
      if (result.trial?.remainingMs !== null && result.trial?.remainingMs !== undefined) {
        setRemainingMs(result.trial.remainingMs);
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load model chat.");
    }
  }, []);

  const loadCompletedModels = useCallback(async () => {
    setModelsLoading(true);
    try {
      const response = await apiFetchRef.current("/api/finetune/completed-models", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Could not load completed models.");
      setCompletedModels(Array.isArray(result.models) ? result.models : []);
      setModelsError("");
    } catch (err) {
      setModelsError(err instanceof Error ? err.message : "Could not load completed models.");
    } finally {
      setModelsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    void loadCompletedModels();
  }, [loadCompletedModels]);

  useEffect(() => {
    if (remainingMs === null || !status?.trial?.expiresAt) return;
    const expires = Date.parse(status.trial.expiresAt);
    const timer = window.setInterval(() => setRemainingMs(Math.max(0, expires - Date.now())), 1000);
    return () => window.clearInterval(timer);
  }, [remainingMs === null, status?.trial?.expiresAt]);

  const countdown = useMemo(() => {
    if (remainingMs === null) return "";
    const seconds = Math.ceil(remainingMs / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }, [remainingMs]);

  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch("/api/finetune/model-trial/start", { method: "POST" });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Could not start model chat.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start model chat.");
    } finally {
      setBusy(false);
    }
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const content = input.trim();
    if (!content || busy || remainingMs === 0) return;
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setInput("");
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch("/api/finetune/model-trial/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "The model could not respond.");
      setMessages([...nextMessages, { role: "assistant", content: result.content }]);
    } catch (err) {
      setMessages(messages);
      setInput(content);
      setError(err instanceof Error ? err.message : "The model could not respond.");
    } finally {
      setBusy(false);
    }
  };

  const trial = status?.trial;
  const ready = trial?.state === "ready" && remainingMs !== 0;

  return (
    <section className="mx-auto w-full max-w-5xl space-y-5 rounded-xl border border-slate-800/60 bg-slate-950/30 p-6">
      <header>
        <h2 className="text-lg font-bold text-slate-100">Model Chat</h2>
        <p className="mt-1 text-sm text-slate-400">Try a conversation with your trained model.</p>
      </header>

      <section className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/50 p-4" aria-labelledby="completed-models-title">
        <div className="flex items-center justify-between gap-3">
          <h3 id="completed-models-title" className="text-sm font-bold text-slate-100">Completed Models</h3>
          <button type="button" onClick={() => void loadCompletedModels()} disabled={modelsLoading}
            className="text-xs text-white underline hover:text-white disabled:opacity-50">
            Refresh
          </button>
        </div>
        {modelsLoading && <p className="text-sm text-slate-400">Loading completed models…</p>}
        {!modelsLoading && modelsError && <p role="alert" className="text-sm text-rose-300">{modelsError}</p>}
        {!modelsLoading && !modelsError && completedModels.length === 0 && (
          <p className="text-sm text-slate-400">No completed models found.</p>
        )}
        {!modelsLoading && completedModels.length > 0 && (
          <ul className="space-y-3">
            {completedModels.map(model => {
              const repoUrl = model.hfRepoName
                ? `https://huggingface.co/${model.hfRepoName.split("/").map(encodeURIComponent).join("/")}/tree/main`
                : null;
              const completedDate = model.completedAt && Number.isFinite(Date.parse(model.completedAt))
                ? new Date(model.completedAt).toLocaleString()
                : null;
              return (
                <li key={model.jobId} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-all text-sm font-semibold text-slate-100">{model.hfRepoName || model.modelName}</p>
                      {model.baseModel && <p className="mt-1 break-all text-xs text-slate-400">Base model: {model.baseModel}</p>}
                      {completedDate && <p className="mt-1 text-xs text-slate-500">Completed {completedDate}</p>}
                    </div>
                    <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-300">
                      Completed
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {repoUrl && (
                      <a href={repoUrl} target="_blank" rel="noopener noreferrer"
                        className="kk-model-chat-download-link rounded-md border border-slate-700 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800">
                        Download model files
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {status?.availableModelName && !trial && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Trained model</div>
          <div className="mt-2 break-all text-sm font-semibold text-slate-100">{status.availableModelName}</div>
        </div>
      )}

      {!trial && (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
          <p className="text-sm text-slate-300">Setup takes 10–15 minutes. Your free 15-minute chat session is available once. Start when you’re ready to test.</p>
          <button
            type="button"
            onClick={() => void start()}
            disabled={busy || !status?.available}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && <LoaderCircle className="h-4 w-4 animate-spin" />}
            Start model chat
          </button>
          {status && !status.available && (
            <p className="mt-3 text-xs text-slate-400">Complete a training run before starting model chat.</p>
          )}
        </div>
      )}

      {trial?.state === "starting" && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-500/20 bg-blue-500/5 p-4 text-sm text-slate-300">
          <LoaderCircle className="h-5 w-5 animate-spin text-blue-400" />
          <span>Preparing your model. This usually takes 10–15 minutes; you can leave this page and return later.</span>
        </div>
      )}

      {trial?.state === "failed" && (
        <p className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-200">Model chat could not be prepared. This one-time session is no longer available.</p>
      )}

      {(trial?.state === "expired" || (trial?.state === "ready" && remainingMs === 0)) && (
        <p className="rounded-lg border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-300">Your model chat session has ended.</p>
      )}

      {ready && (
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/70">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <MessageSquare className="h-4 w-4 text-blue-400" />
              {trial?.modelName}
            </div>
            <div className="text-xs font-mono text-slate-400">Time remaining: {countdown}</div>
          </div>
          <div className="flex min-h-72 max-h-[55vh] flex-col gap-3 overflow-y-auto p-4" aria-live="polite">
            {messages.length === 0 && (
              <div className="m-auto text-center text-sm text-slate-500">Send a message to begin.</div>
            )}
            {messages.map((message, index) => (
              <div
                key={`${index}-${message.role}`}
                className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-4 py-3 text-sm ${
                  message.role === "user"
                    ? "ml-auto bg-blue-500/15 text-blue-50"
                    : "mr-auto bg-slate-800/80 text-slate-100"
                }`}
              >
                {message.content}
              </div>
            ))}
            {busy && <div className="mr-auto rounded-xl bg-slate-800/80 px-4 py-3 text-xs text-slate-400">Thinking…</div>}
          </div>
          <form onSubmit={send} className="flex gap-2 border-t border-slate-800 p-3">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              maxLength={12000}
              placeholder="Message your model"
              aria-label="Message your model"
              className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-blue-400"
            />
            <button
              type="submit"
              disabled={!input.trim() || busy || remainingMs === 0}
              aria-label="Send message"
              className="inline-flex items-center justify-center rounded-lg bg-blue-500 px-4 text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}

      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    </section>
  );
}
