export interface QualityFormatContext {
  templateType?: string;
  instructTemplate?: string;
}

export interface FormatIssue {
  exampleIndex: number;
  severity: "High" | "Medium" | "Low";
  type: string;
  message: string;
}

// Inspect stored messages as-is: sanitizing here would hide defects from QA.
export function auditTemplateFormat(examples: any[], context: QualityFormatContext): FormatIssue[] {
  const issues: FormatIssue[] = [];
  examples.forEach((example, exampleIndex) => {
    const flag = (type: string, message: string) =>
      issues.push({ exampleIndex, severity: "High", type, message });
    if (!Array.isArray(example?.messages) || !example.messages.length) return;
    const messages = example.messages;
    const requestedMode = String(context.templateType || "").toLowerCase().replace(/[_-]/g, " ");
    const exampleMode = String(example.templateType || "").toLowerCase().replace(/[_-]/g, " ");
    const mode = /single|multi|mixed|reasoning|cot/.test(requestedMode) ? requestedMode
      : /single|multi|mixed|reasoning|cot/.test(exampleMode) ? exampleMode : "single turn";
    const reasoning = mode.includes("reasoning") || mode.includes("cot");
    const systemTurns = messages.filter((m: any) => m?.role === "system");
    const turns = messages.filter((m: any) => m?.role !== "system");
    if (systemTurns.length > 1 || messages.some((m: any, index: number) => m?.role === "system" && index !== 0)) {
      flag("System Message Placement", "Only one system message is allowed, at the start of an example.");
    }
    if (reasoning && systemTurns.length) flag("Reasoning Template Anomaly", "Reasoning examples must not contain a system message.");
    if (turns.some((m: any, index: number) => m?.role !== (index % 2 === 0 ? "user" : "assistant"))
      || turns.length % 2 !== 0) {
      flag("Invalid Turn Sequence", "Conversation must alternate user and assistant messages and end with an assistant response.");
    }
    if ((mode.includes("single") || reasoning) && turns.length !== 2) {
      flag("Template Turn Count", "This template requires exactly one user prompt and one assistant response.");
    }
    if (mode.includes("multi") && turns.length < 4) {
      flag("Template Turn Count", "Multi Turn requires at least two complete user/assistant exchanges.");
    }
    if (mode.includes("mixed") && turns.length < 2) {
      flag("Template Turn Count", "Mixed examples must contain complete Single Turn or Multi Turn conversations.");
    }
    for (const [index, message] of messages.entries()) {
      const where = `Turn #${index + 1}`;
      if (!message || typeof message !== "object" || Array.isArray(message)) {
        flag("Invalid Message Schema", `${where} must be a message object.`);
        continue;
      }
      if (!["system", "user", "assistant"].includes(message.role)) {
        flag("Invalid Message Role", `${where} must use system, user, or assistant as its role.`);
      }
      if (typeof message.content !== "string") {
        flag("Invalid Content Type", `${where} content must be a string, not a JSON object, array, or number.`);
        continue;
      }
      const text = message.content.trim();
      const explanation = message.reasoning ?? message.reasoning_content;
      const hasField = explanation !== undefined;
      if (hasField && (typeof explanation !== "string" || !explanation.trim())) {
        flag("Invalid Reasoning Field", `${where} reasoning must be a non-empty string.`);
      }
      if (hasField && message.role !== "assistant") flag("Misplaced Reasoning", `${where} reasoning belongs only on an assistant message.`);
      if (message.role === "assistant") {
        const body = text.replace(/^<\|im_start\|>assistant\n/, "").replace(/<\|im_end\|>$/, "").trim();
        const tags = [...body.matchAll(/<(think|reasoning)>([\s\S]*?)<\/\1>/gi)];
        if (!reasoning && (hasField || /<\/?(?:think|reasoning)>/i.test(text))) {
          flag("Unexpected Reasoning", `${where} contains reasoning, which is not allowed in Single Turn, Multi Turn, or Mixed.`);
        }
        if (reasoning) {
          if (!tags.length && !(typeof explanation === "string" && explanation.trim())) {
            flag("Missing Reasoning", `${where} needs a non-empty reasoning field or a complete reasoning block.`);
          }
          const tagCount = (body.match(/<\/?(?:think|reasoning)>/gi) || []).length;
          if ((tagCount > 0 && tagCount !== 2) || tags.length > 1 || tags.some(tag => !tag[2].trim())) {
            flag("Invalid Reasoning Block", `${where} must have one non-empty reasoning block, not empty or repeated blocks.`);
          }
          if (tags[0] && !/^(?:### Response:\s*)?$/i.test(body.slice(0, tags[0].index).trim())) {
            flag("Reasoning Placement", `${where} reasoning must precede the final answer.`);
          }
          const answer = body.replace(/<(think|reasoning)>[\s\S]*?<\/\1>/gi, "")
            .replace(/### Response:|<\|im_end\|>|<\/s>/g, "").trim();
          if (!answer) flag("Missing Final Answer", `${where} has reasoning but no final answer.`);
        }
      }

      // Clean role/content objects are valid for every export format. Validate
      // serialization markers when present; do not require export-only tokens.
      const format = String(context.instructTemplate || "").toLowerCase();
      // Only treat boundary markers as serialization. Quoted markers inside
      // ordinary prose or code can legitimately be the subject of an example.
      const hasMistral = /^\[\/?INST\]|\[\/?INST\]$/.test(text);
      const hasChatML = /^<\|im_(?:start|end)\|>|<\|im_(?:start|end)\|>$/.test(text);
      const hasAlpaca = /^### (?:Instruction|Response):/.test(text);
      if (format && ((hasMistral && format !== "mistral") || (hasChatML && format !== "chatml")
        || (hasAlpaca && format !== "alpaca"))) {
        flag("Conflicting Template Markers", `${where} contains delimiters from a different instruction format than ${context.instructTemplate}.`);
      }
      if (hasMistral && (!/^\[INST\][\s\S]*\[\/INST\]$/.test(text)
        || (text.match(/\[INST\]/g) || []).length !== 1 || message.role !== "user")) {
        flag("Malformed Mistral Delimiters", `${where} must wrap a user prompt once in [INST] ... [/INST].`);
      }
      if (hasChatML && (!text.startsWith(`<|im_start|>${message.role}\n`) || !text.endsWith("<|im_end|>")
        || (text.match(/<\|im_start\|>/g) || []).length !== 1 || (text.match(/<\|im_end\|>/g) || []).length !== 1)) {
        flag("Malformed ChatML Delimiters", `${where} has incomplete, repeated, or role-mismatched ChatML delimiters.`);
      }
      if (hasAlpaca && ((message.role === "user" && (!text.startsWith("### Instruction:") || text.includes("### Response:")))
        || (message.role === "assistant" && (!text.startsWith("### Response:") || text.includes("### Instruction:")))
        || message.role === "system")) {
        flag("Malformed Alpaca Headers", `${where} has a misplaced instruction or response header.`);
      }
    }
  });
  return issues;
}