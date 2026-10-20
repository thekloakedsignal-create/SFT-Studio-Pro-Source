import { Router, type IRouter } from "express";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { optionalAuth, type AuthRequest } from "../middleware/auth.ts";
import { getWhopClient } from "../lib/whopClient.ts";

const plans: Record<string, string | undefined> = {
  train_4b: process.env.WHOP_PLAN_ID_TRAIN_4B,
  train_9b: process.env.WHOP_PLAN_ID_TRAIN_9B,
  train_70b: process.env.WHOP_PLAN_ID_TRAIN_70B,
  usage_10k: process.env.WHOP_PLAN_ID_USAGE_10K,
};
export const TRAINING_MODEL_PLANS: Record<string, string> = {
  "Qwen3.5 4B Base": "train_4b", "Qwen3.5 9 Base": "train_9b", "Llama 3.1 70B": "train_70b",
};
// Only the verified owner identity can bypass billing; never trust a client profile role.
function isOwner(user: AuthRequest["user"]) {
  return user?.email_verified === true && user.email?.toLowerCase() === "thekloakedsignal@gmail.com";
}
type Account = { used: number; extra: number; training: Record<string, number>; freeTrainingCredits?: Record<string, number> };
type Checkout = { uid: string; planKey: string; checkoutId: string; at: string; paymentId?: string };
type Reservation = { uid: string; count: number };
type Store = { accounts: Record<string, Account>; checkouts: Record<string, Checkout>; reservations: Record<string, Reservation> };
const storeFile = path.join(process.cwd(), ".data", "whop-store.json");
// Match the app's existing server persistence. Never reset billing after a read/write error.
let store: Store = fs.existsSync(storeFile)
  ? JSON.parse(fs.readFileSync(storeFile, "utf8"))
  : { accounts: {}, checkouts: {}, reservations: {} };
if (!store.accounts || !store.checkouts || !store.reservations) throw new Error("Invalid billing store; restore it before accepting payments.");
function change<T>(fn: (draft: Store) => T): T {
  const draft = structuredClone(store);
  const result = fn(draft);
  fs.mkdirSync(path.dirname(storeFile), { recursive: true });
  const temp = `${storeFile}.${randomUUID()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(draft), { mode: 0o600 });
  fs.renameSync(temp, storeFile);
  store = draft;
  return result;
}
function account(s: Store, uid: string): Account {
  return s.accounts[uid] ??= { used: 0, extra: 0, training: {} };
}
function remaining(s: Store, uid: string) {
  const a = account(s, uid);
  const reserved = Object.values(s.reservations).filter(r => r.uid === uid).reduce((n, r) => n + r.count, 0);
  return Math.max(0, 5000 + a.extra - a.used - reserved);
}
export function reserveExamples(user: AuthRequest["user"], count: number): string {
  if (isOwner(user)) return "";
  const uid = user?.uid;
  if (!uid) throw Object.assign(new Error("Sign in to use your 5,000 free examples."), { status: 401 });
  if (!Number.isInteger(count) || count < 1) throw Object.assign(new Error("Invalid example count."), { status: 400 });
  return change(s => {
    if (remaining(s, uid) < count) throw Object.assign(new Error("Not enough examples remaining. Add 10,000 examples to continue."), { status: 402 });
    const id = randomUUID();
    s.reservations[id] = { uid, count };
    return id;
  });
}
export function settleExamples(id: string, produced: number) {
  if (!id) return;
  change(s => {
    const r = s.reservations[id];
    if (!r) return;
    account(s, r.uid).used += Math.min(r.count, Math.max(0, produced));
    delete s.reservations[id];
  });
}
export function consumeTraining(user: AuthRequest["user"], model: string): boolean {
  if (isOwner(user)) return false;
  const uid = user?.uid;
  if (!uid) throw Object.assign(new Error("Please sign in."), { status: 401 });
  const key = TRAINING_MODEL_PLANS[model];
  return change(s => {
    const a = account(s, uid);
    if (!key || !(a.training[key] > 0)) throw Object.assign(new Error("Payment is required for this training run."), { status: 402 });
    a.training[key]--;
    const freeCredits = a.freeTrainingCredits?.[key] || 0;
    if (freeCredits > 0) {
      a.freeTrainingCredits![key] = freeCredits - 1;
      return true;
    }
    return false;
  });
}
export function restoreTraining(uid: string, model: string, freePromo = false) {
  change(s => {
    const a = account(s, uid);
    const key = TRAINING_MODEL_PLANS[model];
    if (!key) return;
    a.training[key] = (a.training[key] || 0) + 1;
    if (freePromo) {
      a.freeTrainingCredits ??= {};
      a.freeTrainingCredits[key] = (a.freeTrainingCredits[key] || 0) + 1;
    }
  });
}
const router: IRouter = Router();
// Scope auth to billing paths, not unrelated routes.
router.use("/whop", optionalAuth, (req: AuthRequest, res, next) => {
  if (!req.user?.uid) { res.status(401).json({ success: false, error: "Please sign in." }); return; }
  next();
});
function payload(uid: string, user?: AuthRequest["user"]) {
  if (isOwner(user)) return { success: true, bypass: true, usageUsed: 0, allowance: null, remaining: null, training: {} };
  const a = account(store, uid);
  return { success: true, bypass: false, usageUsed: a.used, allowance: 5000 + a.extra, remaining: remaining(store, uid), training: a.training };
}
router.get("/whop/entitlements", (req: AuthRequest, res) => { res.json(payload(req.user!.uid, req.user)); });

// Promo code: one free 9B training run per account. Grants training credit only (no model chat demo).
const FREE_9B_TRAINING_CODE = "TRAIN9B-FREE";
router.post("/whop/redeem-training", (req: AuthRequest, res) => {
  const uid = req.user!.uid;
  const code = String(req.body?.code || "").trim().toUpperCase();
  if (code !== FREE_9B_TRAINING_CODE) { res.status(404).json({ success: false, error: "Invalid code." }); return; }
  try {
    change(s => {
      const a = account(s, uid) as Account & { redeemedTrainingCodes?: string[] };
      a.redeemedTrainingCodes ??= [];
      if (a.redeemedTrainingCodes.includes(code)) throw Object.assign(new Error("This code has already been redeemed on your account."), { status: 409 });
      a.redeemedTrainingCodes.push(code);
      a.training.train_9b = (a.training.train_9b || 0) + 1;
      a.freeTrainingCredits ??= {};
      a.freeTrainingCredits.train_9b = (a.freeTrainingCredits.train_9b || 0) + 1;
    });
    res.json({ ...payload(uid, req.user), granted: "train_9b" });
  } catch (error: any) {
    res.status(error.status || 500).json({ success: false, error: error.message || "Unable to redeem code." });
  }
});

router.post("/whop/checkout", async (req: AuthRequest, res) => {
  if (isOwner(req.user)) { res.json(payload(req.user!.uid, req.user)); return; }
  try {
    const key = req.body?.planKey;
    const planId = typeof key === "string" && Object.hasOwn(plans, key) ? plans[key] : undefined;
    if (!planId) { res.status(400).json({ success: false, error: "Payment plan is not configured." }); return; }
    // Return only to the requesting app origin, never a client-supplied external destination.
    const origin = req.get("origin");
    if (!origin || !/^https?:\/\//.test(origin)) { res.status(400).json({ success: false, error: "Open checkout from the app." }); return; }
    const returnUrl = new URL(req.body?.returnUrl || "/", origin);
    if (returnUrl.origin !== new URL(origin).origin) { res.status(400).json({ success: false, error: "Invalid return URL." }); return; }
    const id = randomUUID();
    returnUrl.searchParams.set("whop_pending", id);
    const client = await getWhopClient();
    const checkout = await client.checkoutConfigurations.create({
      account_id: process.env.WHOP_COMPANY_ID,
      plan_id: planId,
      redirect_url: returnUrl.toString(),
      metadata: { app_checkout: id },
    });
    if (!checkout.id || !checkout.purchase_url) throw new Error("Checkout unavailable.");
    change(s => { s.checkouts[id] = { uid: req.user!.uid, planKey: key, checkoutId: checkout.id, at: new Date().toISOString() }; });
    res.json({ success: true, purchaseUrl: checkout.purchase_url });
  } catch {
    res.status(502).json({ success: false, error: "Unable to open checkout. Please try again." });
  }
});

// Only checkouts created by this server for this authenticated account can grant credit.
router.post("/whop/verify", async (req: AuthRequest, res) => {
  const uid = req.user!.uid;
  if (isOwner(req.user)) { res.json({ ...payload(uid, req.user), credited: 0 }); return; }
  try {
    const pending = Object.entries(store.checkouts).filter(([, c]) => c.uid === uid && !c.paymentId);
    if (!pending.length) { res.json({ ...payload(uid, req.user), credited: 0 }); return; }
    const client = await getWhopClient();
    let credited = 0;
    for (const [id, c] of pending) {
      const payments = await client.payments.list({
        account_id: process.env.WHOP_COMPANY_ID, plan_id: plans[c.planKey], status: "paid",
        created_after: new Date(Date.parse(c.at) - 60000).toISOString(), first: 100,
      });
      for await (const p of payments) {
        if (p.checkout_configuration_id !== c.checkoutId || p.plan_id !== plans[c.planKey]
          || p.account_id !== process.env.WHOP_COMPANY_ID || p.status !== "paid"
          || p.currency !== "usd" || p.auto_refunded || p.refunded_at || p.dispute_alerted_at
          || Number(p.refunded_amount?.amount || 0) > 0) continue;
        change(s => {
          // Recheck AFTER the provider request to prevent concurrent double crediting.
          if (s.checkouts[id].paymentId || Object.values(s.checkouts).some(x => x.paymentId === p.id)) return;
          const a = account(s, uid);
          if (c.planKey === "usage_10k") a.extra += 10000;
          else a.training[c.planKey] = (a.training[c.planKey] || 0) + 1;
          s.checkouts[id].paymentId = p.id;
          credited++;
        });
        break;
      }
    }
    res.json({ ...payload(uid, req.user), credited });
  } catch {
    res.status(502).json({ success: false, error: "Payment verification unavailable. Please try again." });
  }
});

// Protect the existing trainer without changing Together requests or model settings.
router.post(["/finetune/preflight", "/finetune/upload", "/finetune/jobs"], optionalAuth, (req: AuthRequest, res, next) => {
  if (!req.user?.uid) { res.status(401).json({ success: false, error: "Please sign in." }); return; }
  if (isOwner(req.user)) { next(); return; }
  const key = TRAINING_MODEL_PLANS[req.body?.trainingModel ?? "Qwen3.5 9 Base"];
  if (!key || !(account(store, req.user.uid).training[key] > 0)) {
    res.status(402).json({ success: false, error: "Payment is required for this training run." }); return;
  }
  next();
});
export default router;
