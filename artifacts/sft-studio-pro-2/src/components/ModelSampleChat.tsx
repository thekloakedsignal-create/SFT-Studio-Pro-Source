import React, { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, Send, RefreshCw, AlertCircle, Clock } from "lucide-react";

type SampleState = "available" | "starting" | "ready" | "ended" | "unavailable";
interface Sample { state: SampleState; expiresAt: string | null; serverNow: string }
interface ChatMessage { role: "user" | "assistant"; content: string }

export interface ModelSampleChatProps {
  jobId: string;
  apiFetch: (url: string, init?: RequestInit) => Promise<Response>;
  onActiveChange?: (active: boolean) => void;
}

async function readApi(res: Response): Promise<any> {
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) throw new Error(data?.error || "Request failed.");
  return data;
}

function renderInline(text: string, keyBase: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4)
      return <strong key={`${keyBase}-${i}`} className="font-bold text-white">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
      return <code key={`${keyBase}-${i}`} className="px-1 rounded bg-slate-800 font-mono text-[10px]">{part.slice(1, -1)}</code>;
    return <React.Fragment key={`${keyBase}-${i}`}>{part}</React.Fragment>;
  });
}

function SimpleMarkdown({ text }: { text: string }) {
  const blocks = text.split(/```/g);
  return (
    <div className="space-y-1.5">
      {blocks.map((block, i) =>
        i % 2 === 1 ? (
          <pre key={i} className="p-2 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[10px] overflow-x-auto whitespace-pre">
            {block.replace(/^[a-zA-Z0-9_-]*\n/, "")}
          </pre>
        ) : (
          block.split(/\n{2,}/).filter(p => p.trim()).map((p, j) => (
            <p key={`${i}-${j}`} className="whitespace-pre-wrap">{renderInline(p, `${i}-${j}`)}</p>
          ))
        )
      )}
    </div>
  );
}

const fmt = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function ModelSampleChat({ jobId, apiFetch, onActiveChange }: ModelSampleChatProps) {
  const [sample, setSample] = useState<Sample | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [now, setNow] = useState(Date.now());
  const offsetRef = useRef(0);
  const inFlight = useRef(false);
  const apiRef = useRef(apiFetch); apiRef.current = apiFetch;
  const activeRef = useRef(onActiveChange); activeRef.current = onActiveChange;
  const base = `/api/finetune/jobs/${encodeURIComponent(jobId)}/sample`;

  const apply = useCallback((s: Sample) => {
    const sn = Date.parse(s.serverNow);
    if (!Number.isNaN(sn)) offsetRef.current = sn - Date.now();
    setNow(Date.now());
    setSample(s);
  }, []);

  const fetchStatus = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const data = await readApi(await apiRef.current(base));
      apply(data.sample);
      setLoadError(null);
    } catch {
      setLoadError("Unable to check sample chat status.");
    } finally {
      inFlight.current = false;
    }
  }, [base, apply]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const state = sample?.state;
  const expiresMs = sample?.expiresAt ? Date.parse(sample.expiresAt) : NaN;
  const remaining = Number.isNaN(expiresMs) ? null : expiresMs - (now + offsetRef.current);
  const expired = state === "ready" && remaining !== null && remaining <= 0;
  const effective: SampleState | undefined = expired ? "ended" : state;

  useEffect(() => {
    if (state !== "starting" && state !== "ready") return;
    const poll = setInterval(fetchStatus, 5000);
    return () => clearInterval(poll);
  }, [state, fetchStatus]);

  useEffect(() => {
    if (state !== "ready") return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [state]);

  useEffect(() => {
    if (effective === "starting" || effective === "ready") activeRef.current?.(true);
    else if (effective) activeRef.current?.(false);
  }, [effective]);

  const start = async () => {
    if (starting || inFlight.current) return;
    setStarting(true);
    setError(null);
    inFlight.current = true;
    try {
      const data = await readApi(await apiRef.current(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmStart: true }),
      }));
      apply(data.sample);
    } catch {
      setError("Unable to start the sample chat. You can try again.");
    } finally {
      inFlight.current = false;
      setStarting(false);
    }
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending || effective !== "ready") return;
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setSending(true);
    setError(null);
    try {
      const data = await readApi(await apiRef.current(`${base}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      }));
      setMessages([...next, { role: "assistant", content: String(data.reply ?? "") }]);
      setDraft("");
    } catch {
      setError("Unable to get a reply. Your draft is kept — try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-3.5 rounded-xl bg-slate-900/50 border border-slate-800 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold text-slate-200 flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-emerald-400" /> Talk to your model
        </h3>
        {effective === "ready" && remaining !== null && (
          <span className="flex items-center gap-1 text-[11px] font-mono font-bold text-emerald-400">
            <Clock className="h-3.5 w-3.5" /> {fmt(remaining)} left
          </span>
        )}
      </div>

      {!sample && !loadError && (
        <div className="space-y-2 animate-pulse">
          <div className="h-3 w-3/4 rounded bg-slate-800" />
          <div className="h-9 rounded-xl bg-slate-800" />
        </div>
      )}

      {!sample && loadError && (
        <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-red-500/5 border border-red-500/20 text-[11px] text-red-300">
          <span>{loadError}</span>
          <button type="button" onClick={fetchStatus} className="font-bold underline cursor-pointer">Retry</button>
        </div>
      )}

      {effective === "available" && (
        <div className="space-y-2">
          <p className="text-[11px] text-slate-400 leading-relaxed">
            You get one 15-minute sample chat per trained model. The timer starts once your model is ready and the chat ends automatically.
          </p>
          <button
            type="button"
            onClick={start}
            disabled={starting}
            className="w-full py-2.5 px-4 rounded-xl kk-primary text-xs font-bold text-black flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
          >
            {starting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
            <span>{starting ? "Starting…" : "15 minute sample to talk to your model"}</span>
          </button>
        </div>
      )}

      {effective === "starting" && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-500/5 border border-blue-500/20 text-[11px] text-blue-300">
          <RefreshCw className="h-4 w-4 shrink-0 mt-0.5 animate-spin" />
          <span>Preparing your model. Your 15 minutes begin once it is ready.</span>
        </div>
      )}

      {(effective === "ready" || (effective === "ended" && messages.length > 0)) && (
        <div className="max-h-64 overflow-y-auto space-y-2 custom-scrollbar">
          {messages.length === 0 && (
            <p className="text-[11px] text-slate-500">Your model is ready. Send a message to begin.</p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`text-[11px] leading-relaxed p-2.5 rounded-lg ${
              m.role === "user" ? "ml-8 bg-slate-800 text-slate-100" : "mr-8 bg-slate-950 border border-slate-800 text-slate-300"
            }`}>
              {m.role === "assistant" ? <SimpleMarkdown text={m.content} /> : <p className="whitespace-pre-wrap">{m.content}</p>}
            </div>
          ))}
          {sending && <div className="mr-8 h-8 rounded-lg bg-slate-800 animate-pulse" />}
        </div>
      )}

      {effective === "ready" && (
        <form onSubmit={send} className="flex gap-2">
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            disabled={sending}
            placeholder="Ask your model something…"
            className="min-w-0 flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-emerald-500/50"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="py-2 px-4 rounded-xl kk-primary text-xs font-bold text-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {sending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span>Send</span>
          </button>
        </form>
      )}

      {effective === "ended" && (
        <p className="text-[11px] text-slate-400">Your 15-minute sample chat has ended. Each trained model includes one sample session.</p>
      )}

      {effective === "unavailable" && (
        <p className="text-[11px] text-slate-400">A sample chat isn't available for this model.</p>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/5 border border-red-500/20 text-[11px] text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

export default ModelSampleChat;
