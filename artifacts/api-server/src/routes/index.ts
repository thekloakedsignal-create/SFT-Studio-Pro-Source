import { Router, type IRouter } from "express";
import healthRouter from "./health";
import finetuneRouter from "./finetune";
import whopRouter from "./whop";
import modelChatHistoryRouter from "./model-chat-history";
import modelTrialRouter from "./model-trial";
import modelChatPrepaidRouter from "./model-chat-prepaid";
import accountRouter from "./account";

const router: IRouter = Router();

router.use(healthRouter);
router.use(accountRouter);
router.use(whopRouter);
router.use(finetuneRouter);
router.use(modelChatHistoryRouter);
router.use(modelTrialRouter);
router.use(modelChatPrepaidRouter);

export default router;
