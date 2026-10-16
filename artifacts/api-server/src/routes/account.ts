import { Router, type IRouter } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.ts";
import { reconcileApprovedTraining } from "../lib/reconcile-approved-training.mjs";
import { logger } from "../lib/logger.ts";

const router: IRouter = Router();
router.get("/account", requireAuth, async (req: AuthRequest, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    await reconcileApprovedTraining(req.user!);
    res.json({ user: req.user });
  } catch (error) {
    logger.error({ error: String(error) }, "Approved training reconciliation incomplete");
    res.status(503).json({ error: "Your training records could not be attached. Please retry." });
  }
});
export default router;
