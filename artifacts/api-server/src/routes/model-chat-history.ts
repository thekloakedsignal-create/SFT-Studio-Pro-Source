import { Router, type IRouter } from "express";
import { optionalAuth, type AuthRequest } from "../middleware/auth.ts";
import { getRecord, setRecord } from "../lib/training-records.mjs";
import { logger } from "../lib/logger.ts";

type ChatMessage = { role: "user" | "assistant"; content: string };

const router: IRouter = Router();

router.get("/finetune/model-chat/history", optionalAuth, async (req: AuthRequest, res) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ success: false, error: "Sign in to view model chat history." });
  try {
    const saved = await getRecord("model_chat_history", uid);
    return res.json({ success: true, messages: Array.isArray(saved?.messages) ? saved.messages : [] });
  } catch {
    return res.status(502).json({ success: false, error: "Could not load conversation history." });
  }
});

// Observe successful trial replies without changing the existing trial endpoint.
router.post("/finetune/model-trial/chat", optionalAuth, (req: AuthRequest, res, next) => {
  const uid = req.user?.uid;
  const messages = req.body?.messages;
  if (!uid || !Array.isArray(messages) || messages.length < 1 || messages.length > 30
    || messages.some((message: any) =>
      !message || !["user", "assistant"].includes(message.role)
      || typeof message.content !== "string" || !message.content.trim() || message.content.length > 12000)) {
    next();
    return;
  }

  const sendJson = res.json.bind(res);
  res.json = ((body: any) => {
    if (!body?.success || typeof body.content !== "string") return sendJson(body);
    const history: ChatMessage[] = [
      ...messages.map((message: ChatMessage) => ({ role: message.role, content: message.content })),
      { role: "assistant", content: body.content },
    ];
    void setRecord("model_chat_history", uid, { messages: history })
      .catch(error => logger.warn({ error: String(error) }, "Model chat history could not be saved"))
      .finally(() => sendJson(body));
    return res;
  }) as typeof res.json;
  next();
});

export default router;
