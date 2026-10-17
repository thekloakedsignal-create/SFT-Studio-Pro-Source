export type ChatHistoryMessage = { role: "user" | "assistant"; content: string };
export type ModelChatApiFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function loadModelChatHistory(apiFetch: ModelChatApiFetch): Promise<ChatHistoryMessage[]> {
  const response = await apiFetch("/api/finetune/model-chat/history", { cache: "no-store" });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.error || "Could not load saved chat history.");
  return Array.isArray(result.messages) ? result.messages : [];
}

export async function saveModelChatHistory(apiFetch: ModelChatApiFetch, messages: ChatHistoryMessage[]) {
  const response = await apiFetch("/api/finetune/model-chat/history", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.error || "Could not save chat history.");
}
