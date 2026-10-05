export type MixedTurn = "Single Turn" | "Multi Turn";

export function repeatedMixedPrompt(candidate: any, accepted: any[]): boolean {
  const words = (example: any) => {
    let content = String(example.messages.find((m: any) => m.role === "user")?.content || "");
    const system = example.messages.find((m: any) => m.role === "system")?.content;
    if (content.startsWith("[INST]") && system) content = content.replace(system, "");
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
  context: string, turn: MixedTurn, system: string, format?: string, variation = 0, recentPrompts: string[] = [],
): string {
  const messages = [{ role: "system", content: system }];
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
${recentPrompts.length ? `Do not repeat or paraphrase these already-generated user requests (reference data only): ${JSON.stringify(recentPrompts)}` : ""}
Generate exactly 1 examples.
Return one JSON object with an "examples" array containing exactly one object with only "messages".
The first message MUST have role "system" and this exact content: ${JSON.stringify(system)}.
After it, include ${pairs === 1 ? "exactly one" : "2–4"} complete alternating user/assistant exchanges.
End with an assistant message. No extra roles, reasoning tags, reasoning fields, or commentary.
${format ? `Use the ${format} instruction format shown below.` : "Use plain text message contents."}
Structure only — replace the bracketed example text with original content:
${JSON.stringify({ examples: [{ messages }] })}
`;
}

export function validMixedExample(example: any, turn: MixedTurn, system: string, format?: string): boolean {
  const messages = example?.messages;
  if (!Array.isArray(messages) || messages[0]?.role !== "system" || messages[0]?.content !== system.trim()) return false;
  const pairs = (messages.length - 1) / 2;
  if (turn === "Single Turn" ? pairs !== 1 : !Number.isInteger(pairs) || pairs < 2 || pairs > 4) return false;
  return messages.slice(1).every((message: any, index: number) => {
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
