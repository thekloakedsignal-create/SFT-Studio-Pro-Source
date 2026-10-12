import { Router, type IRouter } from "express";
import healthRouter from "./health";
import finetuneRouter from "./finetune";

const router: IRouter = Router();

router.use(healthRouter);
router.use(finetuneRouter);

export default router;
