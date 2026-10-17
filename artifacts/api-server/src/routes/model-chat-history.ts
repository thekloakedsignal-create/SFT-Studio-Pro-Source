import { Router, type IRouter } from "express";
import { optionalAuth, type AuthRequest } from "../middleware/auth.ts";
import { getRecord, setRecord } from "../lib/training-records.mjs";

type ChatMessage = { role: "user" | "assistant"; content: string };
const router: IRouter = Router();
router.use(optionalAuth);

function userId(req: AuthRequest, res: any) {
  const id = req.user?.uid;
  if (!id) {
    res.status(401).json({ success: false, error: "Sign in to access saved chat history." });
    return null;
  }
  return id;
}

router.get("/finetune/model-chat/history", async (req: AuthRequest, res) => {
  const id = userId(req, res);
  if (!id) return;
  try {
    const record = await getRecord("model_chat_history", id);
    const messages = Array.isArray(record?.messages) ? record.messages : [];
    return res.json({ success: true, messages });
  } catch {
    return res.status(502).json({ success: false, error: "Could not load saved chat history." });
  }
});

router.put("/finetune/model-chat/history", async (req: AuthRequest, res) => {
  const id = userId(req, res);
  if (!id) return;
  const messages = req.body?.messages;
  if (!Array.isArray(messages) || messages.length > 500
    || messages.some((message: any) =>
      !message || !["user", "assistant"].includes(message.role)
      || typeof message.content !== "string" || message.content.length > 12000)) {
    return res.status(400).json({ success: false, error: "Invalid chat history." });
  }
  const clean: ChatMessage[] = messages.map((message: ChatMessage) => ({
    role: message.role,
    content: message.content,
  }));
  if (Buffer.byteLength(JSON.stringify(clean), "utf8") > 1_000_000) {
    return res.status(413).json({ success: false, error: "Chat history is too large to save." });
  }
  try {
    await setRecord("model_chat_history", id, { messages: clean, updatedAt: new Date().toISOString() });
    return res.json({ success: true });
  } catch {
    return res.status(502).json({ success: false, error: "Could not save chat history." });
  }
});

export default router;
