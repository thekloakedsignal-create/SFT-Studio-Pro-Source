import { Router, type IRouter } from "express";
import healthRouter from "./health";
import finetuneRouter from "./finetune";
import whopRouter from "./whop";
import modelTrialRouter from "./model-trial";

const router: IRouter = Router();

router.use(healthRouter);
router.use(whopRouter);
router.use(finetuneRouter);
router.use(modelTrialRouter);

export default router;
