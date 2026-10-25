import { Router, type IRouter } from "express";
import healthRouter from "./health";
import finetuneRouter from "./finetune";
import nebiusFinetuneRouter from "./nebius-finetune";
import whopRouter from "./whop";
import modelTrialRouter from "./model-trial";
import accountRouter from "./account";

const router: IRouter = Router();

router.use(healthRouter);
router.use(accountRouter);
router.use(whopRouter);
router.use(finetuneRouter);
router.use(nebiusFinetuneRouter);
router.use(modelTrialRouter);

export default router;
