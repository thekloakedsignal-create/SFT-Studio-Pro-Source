import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { LoaderCircle, MessageSquare, Send } from "lucide-react";
import { loadModelChatHistory, saveModelChatHistory, type ChatHistoryMessage, type ModelChatApiFetch } from "./modelChatHistory";

type TrialStatus = {
  trial: null | { state: string; modelName: string; remainingMs: number | null };
};
type PaidSession = {
  state: "starting" | "ready" | "stopping" | "stopped" | "expired" | "failed";
  modelName: string;
  rateCentsPerMinute: number;
  expiresAt: string | null;
  remainingMs: number | null;
  billingBypass: boolean;
};

export function ModelChatDeploymentOptions({ apiFetch }: { apiFetch: ModelChatApiFetch }) {
  const apiRef = useRef(apiFetch);
  apiRef.current = apiFetch;
  const [trialStatus, setTrialStatus] = useState<TrialStatus | null>(null);
  const [session, setSession] = useState<PaidSession | null>(null);
  const [messages, setMessages] = useState<ChatHistoryMessage[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historySaveEnabled, setHistorySaveEnabled] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [ownerBypass, setOwnerBypass] = useState(false);
  const [amount, setAmount] = useState("5.00");
  const [input, setInput] = useState("");
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const trialResponse = await apiRef.current("/api/finetune/model-trial/status", { cache: "no-store" });
      const trialResult = await trialResponse.json();
      if (!trialResponse.ok || !trialResult.success) throw new Error(trialResult.error || "Could not load model chat status.");
      setTrialStatus(trialResult);
      const trial = trialResult.trial;
      const trialFinished = Boolean(trial && (
        trial.state === "failed" || trial.state === "expired"
        || (trial.state === "ready" && trial.remainingMs === 0)
      ));
      if (!trialFinished) {
        setSession(null);
        setRemainingMs(null);
        setError("");
        return;
      }
      const paidResponse = await apiRef.current("/api/finetune/model-chat/prepaid/status", { cache: "no-store" });
      const paidResult = await paidResponse.json();
      if (!paidResponse.ok || !paidResult.success) throw new Error(paidResult.error || "Could not load prepaid chat status.");
      setSession(paidResult.session || null);
      if (typeof paidResult.balance === "number") setBalance(paidResult.balance);
      if (paidResult.session?.remainingMs !== null && paidResult.session?.remainingMs !== undefined) {
        setRemainingMs(paidResult.session.remainingMs);
      } else if (paidResult.session?.state !== "ready") {
        setRemainingMs(0);
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load deployment options.");
    }
  }, []);

  const refreshBalance = useCallback(async () => {
    try {
      const response = await apiRef.current("/api/whop/verify", { method: "POST" });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Could not check model chat balance.");
      setOwnerBypass(result.bypass === true);
      setBalance(typeof result.modelChatBalance === "number" ? result.modelChatBalance : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check model chat balance.");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!session?.expiresAt || remainingMs === null) return;
    const expires = Date.parse(session.expiresAt);
    const timer = window.setInterval(() => setRemainingMs(Math.max(0, expires - Date.now())), 1000);
    return () => window.clearInterval(timer);
  }, [remainingMs === null, session?.expiresAt]);

  const trial = trialStatus?.trial;
  const trialFinished = Boolean(trial && (
    trial.state === "failed" || trial.state === "expired"
    || (trial.state === "ready" && trial.remainingMs === 0)
  ));
  useEffect(() => {
    if (!trialFinished) return;
    void refreshBalance();
    window.addEventListener("focus", refreshBalance);
    return () => window.removeEventListener("focus", refreshBalance);
  }, [trialFinished, refreshBalance]);

  useEffect(() => {
    if (!trialFinished) return;
    let active = true;
    setHistoryLoaded(false);
    void loadModelChatHistory(apiRef.current)
      .then(saved => {
        if (active) {
          setMessages(saved);
          setHistorySaveEnabled(true);
        }
      })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : "Could not load saved chat history."); })
      .finally(() => { if (active) setHistoryLoaded(true); });
    return () => { active = false; };
  }, [trialFinished]);
  const paidReady = session?.state === "ready" && (session.billingBypass || remainingMs !== 0);
  const modelName = session?.modelName || trial?.modelName || "Trained model";
  const rateCentsPerMinute = session?.rateCentsPerMinute || (/llama/i.test(modelName) ? 50 : 25);
  const estimatedMinutes = balance === null ? null : balance * 100 / rateCentsPerMinute;
  const countdown = useMemo(() => {
    if (remainingMs === null) return "";
    const seconds = Math.ceil(remainingMs / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }, [remainingMs]);
  const amountCents = Math.round(Number(amount) * 100);

  const startEndpoint = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await apiRef.current("/api/finetune/model-chat/prepaid/start", { method: "POST" });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Could not start prepaid chat.");
      await refresh();
      await refreshBalance();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start prepaid chat.");
    } finally {
      setBusy(false);
    }
  };

  const stopEndpoint = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await apiRef.current("/api/finetune/model-chat/prepaid/stop", { method: "POST" });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Could not stop the endpoint.");
      await refresh();
      await refreshBalance();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not stop the endpoint.");
    } finally {
      setBusy(false);
    }
  };

  const loadBalance = async () => {
    if (!Number.isSafeInteger(amountCents) || amountCents < 500) {
      setError("Enter an amount of at least $5.00.");
      return;
    }
    const checkoutTab = window.open("about:blank", "_blank");
    if (checkoutTab) checkoutTab.opener = null;
    setBusy(true);
    setError("");
    try {
      const response = await apiRef.current("/api/whop/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planKey: "model_chat",
          amountCents,
          returnUrl: `${window.location.origin}${window.location.pathname}`,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Could not open checkout.");
      if (result.bypass) {
        checkoutTab?.close();
        setOwnerBypass(true);
        return;
      }
      if (checkoutTab) checkoutTab.location.href = result.purchaseUrl;
      else window.location.assign(result.purchaseUrl);
    } catch (err) {
      checkoutTab?.close();
      setError(err instanceof Error ? err.message : "Could not open checkout.");
    } finally {
      setBusy(false);
    }
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const content = input.trim();
    if (!content || busy || !paidReady || !historySaveEnabled) return;
    const nextMessages = [...messages, { role: "user" as const, content }];
    setMessages(nextMessages);
    setInput("");
    setBusy(true);
    setError("");
    try {
      const response = await apiRef.current("/api/finetune/model-chat/prepaid/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages.slice(-30) }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "The model could not respond.");
      const savedMessages = [...nextMessages, { role: "assistant" as const, content: result.content }];
      setMessages(savedMessages);
      try {
        await saveModelChatHistory(apiRef.current, savedMessages);
      } catch {
        setError("The response arrived, but chat history could not be saved.");
      }
      await refreshBalance();
    } catch (err) {
      setMessages(messages);
      setInput(content);
      setError(err instanceof Error ? err.message : "The model could not respond.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-5xl space-y-5 rounded-xl border border-slate-800/60 bg-slate-950/30 p-6">
      <div>
        <h2 className="text-lg font-bold text-slate-100">Model deployment options</h2>
        <p className="mt-1 text-sm text-slate-400">Explore hosting and local deployment guides anytime. Prepaid chat becomes available after your free trial.</p>
      </div>

      {trialFinished && <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/70">
        <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-100">
          <MessageSquare className="h-4 w-4 text-blue-400" /> Saved conversation
        </div>
        <div className="flex max-h-[45vh] min-h-36 flex-col gap-3 overflow-y-auto p-4" aria-live="polite">
          {!historyLoaded && <div className="m-auto text-sm text-slate-500">Loading saved conversation…</div>}
          {historyLoaded && messages.length === 0 && <div className="m-auto text-sm text-slate-500">Start a prepaid session to continue chatting.</div>}
          {messages.map((message, index) => (
            <div key={`${index}-${message.role}`} className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-4 py-3 text-sm ${
              message.role === "user" ? "ml-auto bg-blue-500/15 text-blue-50" : "mr-auto bg-slate-800/80 text-slate-100"
            }`}>{message.content}</div>
          ))}
          {busy && paidReady && <div className="mr-auto rounded-xl bg-slate-800/80 px-4 py-3 text-xs text-slate-400">Thinking…</div>}
        </div>
        {paidReady && (
          <form onSubmit={send} className="flex gap-2 border-t border-slate-800 p-3">
            <input value={input} onChange={event => setInput(event.target.value)} maxLength={12000}
              placeholder="Message your model" aria-label="Message your model"
              className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-blue-400" />
              <button type="submit" disabled={!input.trim() || busy || !historyLoaded || !historySaveEnabled} aria-label="Send message"
              className="inline-flex items-center justify-center rounded-lg bg-blue-500 px-4 text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50">
              <Send className="h-4 w-4" />
            </button>
          </form>
        )}
      </div>}

      <section className="space-y-4 rounded-xl border border-blue-500/25 bg-blue-500/5 p-5">
        <div>
          <h3 className="font-bold text-slate-100">Keep chatting here with prepaid balance</h3>
          <p className="mt-1 text-sm text-slate-300">Qwen models: $0.25/minute. Llama: $0.50/minute. Billing starts when the endpoint is ready. Stop it whenever you want; leftover balance stays in your account.</p>
          <p className="mt-1 text-sm text-slate-400">
            {!trialFinished
              ? "Prepaid chat and balance loading are available after your free trial."
              : ownerBypass
                ? "Owner access is enabled."
                : `Balance: ${balance === null ? "checking…" : `$${balance.toFixed(2)}`}${estimatedMinutes === null ? "" : ` · about ${estimatedMinutes.toFixed(1)} minutes at this model's rate`}`}
          </p>
        </div>

        {trialFinished && !ownerBypass && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm text-slate-300">
              Load amount (minimum $5)
              <input type="number" min="5" step="0.01" value={amount} onChange={event => setAmount(event.target.value)}
                className="mt-1 block w-36 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
            </label>
            <button type="button" onClick={() => void loadBalance()} disabled={busy || !Number.isSafeInteger(amountCents) || amountCents < 500}
              className="rounded-lg bg-blue-500 px-3 py-2 text-sm font-bold text-white hover:bg-blue-400 disabled:opacity-50">
              Load balance
            </button>
          </div>
        )}

        {session?.state === "starting" && (
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <LoaderCircle className="h-4 w-4 animate-spin text-blue-400" /> Waiting for the endpoint to become ready; billing has not started.
          </div>
        )}
        {session?.state === "ready" && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
            <p className="text-sm text-slate-200">Endpoint running{session.billingBypass ? "" : ` · ${countdown} remaining`}</p>
            <button type="button" onClick={() => void stopEndpoint()} disabled={busy}
              className="rounded-lg border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800 disabled:opacity-50">Stop endpoint</button>
          </div>
        )}
        {session?.state === "expired" && (
          <p className="text-sm text-slate-300">The balance reached zero and the endpoint stopped. Load more balance to start another session.</p>
        )}
        {session?.state === "failed" && <p className="text-sm text-rose-200">The endpoint could not be started. Your balance was not charged.</p>}
        {trialFinished && !paidReady && session?.state !== "starting" && !ownerBypass && (
          <button type="button" onClick={() => void startEndpoint()} disabled={busy || (balance ?? 0) <= 0}
            className="rounded-lg border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800 disabled:opacity-50">
            Start prepaid chat
          </button>
        )}
        {trialFinished && !paidReady && session?.state !== "starting" && ownerBypass && (
          <button type="button" onClick={() => void startEndpoint()} disabled={busy}
            className="rounded-lg border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800 disabled:opacity-50">
            Start chat
          </button>
        )}
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <article className="rounded-lg border border-slate-700 p-4">
          <h3 className="font-semibold text-slate-100">Featherless AI</h3>
          <p className="mt-1 text-sm text-slate-300">$50/month for hosting up to 10 Hugging Face models. Copy the model repository to your own Hugging Face account, then connect it to Featherless.</p>
          <a href="https://huggingface.co/docs/hub/en/repositories-next-steps" target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm text-blue-300 underline">Copy a model repository</a>
          <a href="https://featherless.ai/docs/plans" target="_blank" rel="noopener noreferrer" className="ml-4 inline-block text-sm text-blue-300 underline">Featherless plans</a>
        </article>
        <article className="rounded-lg border border-slate-700 p-4">
          <h3 className="font-semibold text-slate-100">Kaggle notebook</h3>
          <p className="mt-1 text-sm text-slate-300">Create a notebook, enable a GPU, and load your Hugging Face model. Kaggle notebooks are session-based, not always-on hosting.</p>
          <a href="https://www.kaggle.com/docs/Notebooks" target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm text-blue-300 underline">Kaggle notebook guide</a>
        </article>
        <article className="rounded-lg border border-slate-700 p-4">
          <h3 className="font-semibold text-slate-100">RunPod</h3>
          <p className="mt-1 text-sm text-slate-300">Create a serverless endpoint, load the model from Hugging Face, and expose it for inference.</p>
          <a href="https://docs.runpod.io/serverless/development/huggingface-models" target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm text-blue-300 underline">RunPod deployment guide</a>
        </article>
        <article className="rounded-lg border border-slate-700 p-4">
          <h3 className="font-semibold text-slate-100">Download and run locally</h3>
          <p className="mt-1 text-sm text-slate-300">Download the notebook, enter your Hugging Face repository ID, and run it in Jupyter with a compatible GPU and enough memory.</p>
          <a href={`${import.meta.env.BASE_URL}model-chat-notebook.ipynb`} download className="mt-2 inline-block text-sm text-blue-300 underline">Download the inference notebook</a>
        </article>
      </div>
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    </section>
  );
}
