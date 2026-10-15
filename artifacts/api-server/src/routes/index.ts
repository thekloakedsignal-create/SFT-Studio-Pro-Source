import { Router, type IRouter } from "express";
import healthRouter from "./health";
import finetuneRouter from "./finetune";
import whopRouter from "./whop";

const router: IRouter = Router();

router.use(healthRouter);
router.use(whopRouter);
router.use(finetuneRouter);

export default router;
