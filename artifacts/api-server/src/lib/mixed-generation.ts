export type MixedTurn = "Single Turn" | "Multi Turn";

export function isMixedSingleTurn(example: any, format?: string): boolean {
  return Array.isArray(example?.messages) && example.messages.length === (format === "Mistral" ? 2 : 3);
}

export function repeatedMixedPrompt(candidate: any, accepted: any[], system?: string): boolean {
  const words = (example: any) => {
    let content = String(example.messages.find((m: any) => m.role === "user")?.content || "");
    const systemMessage = example.messages.find((m: any) => m.role === "system")?.content;
    if (content.startsWith("[INST]") && systemMessage) content = content.replace(systemMessage, "");
    else if (content.startsWith("[INST]") && system) content = content.replace(`[INST] ${system}\n\n`, "[INST] ");
    return content.replace(/\[\/?INST\]|### Instruction:/g, "").toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, "").trim().split(/\s+/);
  };
  const current = words(candidate);
  return accepted.some(example => {
    const previous = words(example);
    if (current.join(" ") === previous.join(" ")) return true;
    if (Math.min(current.length, previous.length) < 12) return false;
    const a = new Set(current);
    const b = new Set(previous);
    const overlap = [...a].filter(word => b.has(word)).length;
    return overlap / new Set([...a, ...b]).size >= 0.85;
  });
}

export function mixedGenerationPrompt(
  context: string, turn: MixedTurn, system: string, format?: string, variation = 0,
): string {
  const messages: Array<{ role: string; content: string }> = format === "Mistral" ? [] : [{ role: "system", content: system }];
  const pairs = turn === "Single Turn" ? 1 : 2;
  for (let index = 0; index < pairs; index++) {
    const question = index === 0 ? "[Original user request]" : "[Relevant follow-up request]";
    messages.push({
      role: "user",
      content: format === "Alpaca" ? `### Instruction:\n${question}`
        : format === "Mistral" ? `[INST] ${index === 0 ? `${system}\n\n` : ""}${question} [/INST]`
        : question,
    }, {
      role: "assistant",
      content: `${format === "Alpaca" ? "### Response:\n" : ""}[Complete original answer]`,
    });
  }
  return `${context.replace(/For this request, generate [^\n]+/,
    `For this request, generate ${turn}: ${pairs === 1 ? "one" : "2–4"} user/assistant exchanges.`)}

STRICT MIXED SLOT REQUIREMENT:
This slot MUST be ${turn}; do not choose a different turn type.
VARIATION ${variation}: Create a distinct scenario within the project and batch instructions.
Vary the user's goal, situation, constraints, wording, and response content; do not merely change names.
Do not copy the exemplar's scenario or the structural placeholders.
Generate exactly 1 examples.
Return one JSON object with an "examples" array containing exactly one object with only "messages".
${format === "Mistral"
  ? `Do not include a system role. Put the exact project system prompt at the start of the first [INST] user message: ${JSON.stringify(system)}.`
  : `The first message MUST have role "system" and this exact content: ${JSON.stringify(system)}.`}
Then include ${pairs === 1 ? "exactly one" : "2–4"} complete alternating user/assistant exchanges.
End with an assistant message. No extra roles, reasoning tags, reasoning fields, or commentary.
${format ? `Use the ${format} instruction format shown below.` : "Use plain text message contents."}
Structure only — replace the bracketed example text with original content:
${JSON.stringify({ examples: [{ messages }] })}
`;
}

export function validMixedExample(example: any, turn: MixedTurn, system: string, format?: string): boolean {
  const messages = example?.messages;
  const mistral = format === "Mistral";
  if (!Array.isArray(messages)) return false;
  if (mistral) {
    if (messages.some((message: any) => message.role === "system")
      || messages[0]?.role !== "user"
      || !messages[0].content.trim().startsWith(`[INST] ${system.trim()}\n\n`)) return false;
  } else if (messages[0]?.role !== "system" || messages[0]?.content !== system.trim()) return false;
  const exchanges = mistral ? messages : messages.slice(1);
  const pairs = exchanges.length / 2;
  if (turn === "Single Turn" ? pairs !== 1 : !Number.isInteger(pairs) || pairs < 2 || pairs > 4) return false;
  return exchanges.every((message: any, index: number) => {
    const user = index % 2 === 0;
    if (message.role !== (user ? "user" : "assistant")
      || typeof message.content !== "string" || !message.content.trim()) return false;
    if (format === "Alpaca") {
      return message.content.startsWith(user ? "### Instruction:\n" : "### Response:\n");
    }
    if (format === "Mistral" && user) {
      return /^\[INST\][\s\S]+\[\/INST\]$/.test(message.content.trim());
    }
    return true;
  });
}
