import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";

type ApiFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export const trainingPlan: Record<string, string> = {
  "Qwen3.5 4B Base": "train_4b", "Qwen3.5 9 Base": "train_9b", "Llama 3.1 70B": "train_70b",
};
const labels: Record<string, string> = {
  train_4b: "4B training — $14.99",
  train_9b: "9B training — $24.99",
  train_70b: "70B training — $34.99",
  usage_10k: "10,000 examples — $9.99",
};

export function PaymentGate({ apiFetch, planKey, onReady }: {
  apiFetch: ApiFetch; planKey: string; onReady?: (ready: boolean) => void;
}) {
  const callbacks = useRef({ apiFetch, onReady });
  callbacks.current = { apiFetch, onReady };
  const [balance, setBalance] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [checkoutUrl, setCheckoutUrl] = useState("");
  const refreshRef = useRef<() => void>(() => {});
  const usage = planKey === "usage_10k";
  const ready = !usage && Number(balance?.training?.[planKey] || 0) > 0;

  useEffect(() => {
    let disposed = false;
    let refreshing = false;
    setBalance(null);
    setError("");
    setCheckoutUrl("");
    callbacks.current.onReady?.(false);
    const refresh = async () => {
      if (refreshing) return;
      if (!auth.currentUser) {
        setChecking(false);
        setBalance(null);
        setError("Sign in to continue.");
        callbacks.current.onReady?.(false);
        return;
      }
      refreshing = true;
      setChecking(true);
      const uid = auth.currentUser.uid;
      try {
        const res = await callbacks.current.apiFetch("/api/whop/verify", { method: "POST" });
        const data = await res.json();
        if (disposed || auth.currentUser?.uid !== uid) return;
        if (!res.ok || !data.success) throw new Error(data.error || "Unable to check payment.");
        setBalance(data);
        setError("");
        callbacks.current.onReady?.(Number(data.training?.[planKey] || 0) > 0);
      } catch (e: any) {
        if (!disposed) { setError(e.message); callbacks.current.onReady?.(false); }
      } finally {
        refreshing = false;
        if (!disposed) setChecking(false);
      }
    };
    refreshRef.current = refresh;
    const unsubscribe = onAuthStateChanged(auth, () => {
      setBalance(null);
      callbacks.current.onReady?.(false);
      void refresh();
    });
    window.addEventListener("focus", refresh);
    return () => { disposed = true; unsubscribe(); window.removeEventListener("focus", refresh); };
  }, [planKey]);

  const checkout = async () => {
    if (!auth.currentUser) { setError("Sign in to continue."); return; }
    // Keep this tab and its unsaved dataset intact while hosted checkout opens.
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch("/api/whop/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey, returnUrl: `${window.location.origin}${window.location.pathname}` }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Unable to open checkout.");
      setCheckoutUrl(data.purchaseUrl);
      if (tab) tab.location.href = data.purchaseUrl;
    } catch (e: any) {
      tab?.close();
      setError(e.message);
    } finally { setBusy(false); }
  };

  return <div className="rounded-xl border border-emerald-500/30 bg-slate-900 p-3 space-y-2 text-xs text-slate-200">
    <p className="font-semibold">{usage ? "Example allowance" : "Training payment"}</p>
    <p>{usage
      ? `${balance ? Number(balance.remaining).toLocaleString() : "5,000 free"} examples remaining. Batch and document examples share one allowance. QA regenerations and TRiAD are always free.`
      : ready ? "Payment confirmed. One training run is available for this model." : "One-time payment for this training run."}</p>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {!ready && <button type="button" onClick={checkout} disabled={busy || checking}
      className="rounded-lg kk-primary px-3 py-2 font-semibold disabled:opacity-50">
      {busy ? "Opening checkout…" : checking ? "Checking payment…" : `Pay ${labels[planKey] || ""}`}
    </button>}
    {checkoutUrl && <a className="block underline text-emerald-300" href={checkoutUrl} target="_blank" rel="noopener noreferrer">Open secure checkout</a>}
    <button type="button" onClick={() => refreshRef.current()} disabled={checking}
      className="block text-emerald-300 underline disabled:opacity-50">Check payment / refresh balance</button>
    <p className="text-slate-400">After payment, return to this tab. Payments are verified before access is granted.</p>
  </div>;
}
