// Pure response handling: no provider calls, persistence, or invented training text.
type RecordValue = Record<string, any>;

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Chat Completions strings and text blocks; unsupported values are not stringified. */
export function normalizeText(value: unknown): string {
  if (typeof value === "string") {
    return value.replace(/\r\n?/g, "\n").trim();
  }
  if (Array.isArray(value)) {
    // Do not trim each fragment: providers can split a JSON token across text blocks.
    return normalizeText(value.map(textFragment).join(""));
  }
  return normalizeText(textFragment(value));
}

function normalizeMessageText(value: unknown): string {
  // Decode artifacts only after JSON parsing, not inside the serialized JSON string.
  return normalizeText(value).replace(/\\\/n/g, "\n").replace(/(^|\s)\/n(?=\s|$)/g, "$1\n").trim();
}

function textFragment(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textFragment).join("");
  if (!isRecord(value)) return "";
  if (value.type && !["text", "output_text"].includes(value.type)) return "";
  for (const key of ["response", "content", "text", "answer", "output", "value"]) {
    if (value[key] !== undefined) {
      const text = textFragment(value[key]);
      if (text) return text;
    }
  }
  return "";
}

export function stripCoTFromSingleTurn(text: string): string {
  if (!text || typeof text !== "string") return text || "";
  let s = text.trim();
  const tags = [
    "think", "thinking", "thought", "thoughts", "reasoning", "reflection",
    "scratchpad", "internal", "plan", "cot", "analysis", "inner_thought", "mind"
  ];
  for (const tag of tags) {
    s = s.replace(new RegExp("<" + tag + "(?:\\s+[^>]*)?>[\\s\\S]*?<\\/" + tag + ">", "gi"), "");
    s = s.replace(new RegExp("<" + tag + "(?:\\s+[^>]*)?>[\\s\\S]*$", "gi"), "");
    s = s.replace(new RegExp("\\[" + tag + "\\][\\s\\S]*?\\[\\/" + tag + "\\]", "gi"), "");
    s = s.replace(new RegExp("\\[" + tag + "\\][\\s\\S]*$", "gi"), "");
  }
  const answerDelimiterRegex = /(?:^|\n)\s*(?:[\*\#\_]{0,4})\s*(?:Final\s+Answer|Final\s+Response|Direct\s+Answer|Response|Answer|Output|Conclusion|Solution)\s*(?:[\*\#\_]{0,4}):?\s*(?:[\*\#\_]{0,4})\s*\n?/i;
  const thoughtHeaderRegex = /^(?:[\*\#\_\s]*)(?:Thinking\s+Process|Thought\s+Process|Chain\s+of\s+Thought|Reasoning\s+Trace|Reasoning\s+Process|Reasoning|Thoughts|Internal\s+Thoughts|Internal\s+Monologue|Scratchpad|Analysis|Draft|Planning|Step-by-step\s+reasoning|Here\s+is\s+my\s+reasoning|Here\x27s\s+my\s+thought\s+process|Let(?:\x27s|\s+me)\s+think)/i;
  if (thoughtHeaderRegex.test(s)) {
    const matches = Array.from(s.matchAll(new RegExp(answerDelimiterRegex.source, "gi")));
    const lastMatch = matches[matches.length - 1];
    if (lastMatch && lastMatch.index !== undefined) {
      const remainder = s.substring(lastMatch.index + lastMatch[0].length).trim();
      if (remainder.length > 0) s = remainder;
    }
  } else {
    const match = s.match(answerDelimiterRegex);
    if (match && match.index !== undefined && match.index > 0) {
      const preamble = s.substring(0, match.index).trim();
      if (/(?:think|reason|analyz|consider|step|plan|approach|user\s+is|goal|draft|scratch)/i.test(preamble)) {
        s = s.substring(match.index + match[0].length).trim();
      }
    }
  }
  s = s.replace(
    /(?:^|\n)\s*(?:[\*\#\_]{0,4})\s*(?:Thinking\s+Process|Thought\s+Process|Chain\s+of\s+Thought|Reasoning\s+Trace|Reasoning\s+Process|Reasoning|Thoughts|Internal\s+Thoughts|Internal\s+Monologue|Scratchpad|Analysis|Draft)\s*(?:[\*\#\_]{0,4}):?[\s\S]*?(?=(?:\n\s*(?:[\*\#\_]{0,4})\s*(?:Final\s+Answer|Response|Answer|Output|Conclusion):?|\n\s*\n[A-Z]|\n#{1,4}\s+[A-Z]|$))/gi,
    ""
  );
  s = s.replace(/^(?:[\*\#\_\s]*)(?:Response|Instruction|Answer|Assistant|Output|Solution)(?:[\*\#\_\s]*):?\s*/i, "");
  const paragraphs = s.split(/\n\s*\n/);
  while (paragraphs.length > 1) {
    const isMeta = /^(?:(?:I\s+(?:am\s+(?:analyzing|reviewing|tracing|considering|thinking)|need\s+to|will\s+(?:explain|describe|state|construct|outline|note)|must\s+first|should\s+also)|Let(?:\x27s|\s+me)\s+(?:first|analyze|think|examine|consider|break)|To\s+answer\s+this|First,\s+I\s+will|The\s+user\s+(?:wants|is\s+asking)|Here\s+is\s+(?:my\s+)?(?:step-by-step\s+)?(?:reasoning|thought|analysis))\b)/i.test(paragraphs[0].trim());
    if (!isMeta) break;
    paragraphs.shift();
    s = paragraphs.join("\n\n").trim();
  }
  const metaRegex = /^(?:(?:I\s+(?:am\s+(?:analyzing|reviewing|tracing|considering|thinking)|need\s+to\s+(?:first|analyze|explain|note)|will\s+(?:explain|describe|outline|state)|should\s+first)|Let(?:\x27s|\s+me)\s+(?:first\s+)?(?:analyze|think|examine|consider|break\s+down)|To\s+answer\s+this\s+(?:question|request|prompt)?|The\s+user\s+(?:wants|is\s+asking\s+(?:for|to)?)|Here\s+is\s+my\s+(?:step-by-step\s+)?(?:thought|reasoning|analysis))\b[^.!?]*[.!?]+\s*)+/i;
  const cleanedLeading = s.replace(metaRegex, "").trim();
  if (cleanedLeading.length > 15) s = cleanedLeading;
  return s.replace(/^\[INST\]\s*/i, "").replace(/\s*\[\/INST\]$/i, "")
    .replace(/^<s>\s*/i, "").replace(/\s*<\/s>$/i, "")
    .replace(/^<\|im_start\|>\s*(?:assistant\s*)?/i, "")
    .replace(/\s*<\|im_end\|>$/i, "").trim();
}

function allowsReasoning(templateType?: string): boolean {
  return Boolean(templateType && /reason|mix/i.test(templateType));
}

const roleAliases: Record<string, string> = {
  human: "user", user: "user", gpt: "assistant", bot: "assistant",
  model: "assistant", assistant: "assistant", system: "system",
  developer: "developer", tool: "tool"
};

export type ReasoningParseFailureCategory =
  | "empty_response"
  | "invalid_json"
  | "invalid_envelope"
  | "wrong_example_count"
  | "invalid_example_structure"
  | "invalid_reasoning_content";

export type ReasoningParseResult = {
  examples: any[];
  failureCategory?: ReasoningParseFailureCategory;
};

function getThinkTaggedExampleFailure(example: unknown): "invalid_example_structure" | "invalid_reasoning_content" | undefined {
  if (!isRecord(example)) return "invalid_example_structure";
  if (Object.keys(example).some(key => key !== "messages")) return "invalid_example_structure";
  if (!Array.isArray(example.messages) || example.messages.length !== 2) return "invalid_example_structure";

  const [userMessage, assistantMessage] = example.messages;
  if (!isRecord(userMessage) || !isRecord(assistantMessage)) return "invalid_example_structure";
  if (
    Object.keys(userMessage).some(key => key !== "role" && key !== "content")
    || Object.keys(assistantMessage).some(key => key !== "role" && key !== "content")
    || userMessage.role !== "user"
    || assistantMessage.role !== "assistant"
    || typeof userMessage.content !== "string"
    || !userMessage.content.trim()
    || typeof assistantMessage.content !== "string"
  ) return "invalid_example_structure";

  const content = assistantMessage.content;
  const thinkBlocks = Array.from(content.matchAll(/<think>([\s\S]*?)<\/think>/gi));
  const openTags = Array.from(content.matchAll(/<think>/gi)).length;
  const closeTags = Array.from(content.matchAll(/<\/think>/gi)).length;
  if (thinkBlocks.length !== 1 || openTags !== 1 || closeTags !== 1) return "invalid_reasoning_content";

  const [thinkBlock] = thinkBlocks;
  const thinkStart = thinkBlock.index;
  if (thinkStart === undefined || !thinkBlock[1].trim()) return "invalid_reasoning_content";

  const prefix = content.slice(0, thinkStart).trim();
  if (prefix) return "invalid_reasoning_content";

  const answer = content
    .slice(thinkStart + thinkBlock[0].length)
    .replace(/(?:<\/s>|<\|im_end\|>)+\s*$/gi, "")
    .trim();
  return answer.length > 0 ? undefined : "invalid_reasoning_content";
}

/** Strict Reasoning-only parser; failures expose categories, never generated text. */
export function parseReasoningExamples(rawContent: unknown, expectedCount?: number): ReasoningParseResult {
  const text = normalizeText(rawContent);
  if (!text) return { examples: [], failureCategory: "empty_response" };

  if (/```(?:jsonl|ndjson|json)?[ \t]*\r?\n?[\s\S]*?```/i.test(text)) {
    return { examples: [], failureCategory: "invalid_envelope" };
  }

  let batch: unknown;
  try {
    batch = JSON.parse(text);
  } catch {
    return { examples: [], failureCategory: "invalid_json" };
  }

  if (
    !isRecord(batch)
    || Object.keys(batch).length !== 1
    || !Array.isArray(batch.examples)
    || batch.examples.length === 0
  ) return { examples: [], failureCategory: "invalid_envelope" };

  if (expectedCount !== undefined && batch.examples.length !== expectedCount) {
    return { examples: [], failureCategory: "wrong_example_count" };
  }

  for (const example of batch.examples) {
    const failureCategory = getThinkTaggedExampleFailure(example);
    if (failureCategory) return { examples: [], failureCategory };
  }

  const examples = batch.examples.map(example => sanitizeExample(example, "Reasoning"));
  if (!examples.every(isValidExample)) {
    return { examples: [], failureCategory: "invalid_example_structure" };
  }
  return { examples };
}

export function sanitizeMessage(msg: any, templateType?: string): { role: string; content: string; reasoning?: string } {
  const rawRole = isRecord(msg) ? msg.role ?? msg.from : undefined;
  const role = typeof rawRole === "string" ? roleAliases[rawRole.toLowerCase()] || rawRole : "";
  const rawContent = isRecord(msg) ? msg.content ?? msg.value : msg;
  let content = normalizeMessageText(rawContent);
  let reasoning = isRecord(msg)
    ? normalizeMessageText(msg.reasoning ?? msg.reasoning_content ?? msg.thought ?? msg.thoughts)
    : "";
  if (!reasoning && isRecord(rawContent)) {
    reasoning = normalizeMessageText(rawContent.reasoning ?? rawContent.reasoning_content ?? rawContent.thought ?? rawContent.thoughts);
  }
  if (role === "assistant") {
    const thinkMatch = content.match(/<(?:think|thinking)>([\s\S]*?)<\/(?:think|thinking)>/i);
    if (thinkMatch) {
      if (!reasoning) reasoning = thinkMatch[1].trim();
      content = content.replace(/<(?:think|thinking)>[\s\S]*?<\/(?:think|thinking)>/gi, "").trim();
    }
    if (templateType && !allowsReasoning(templateType)) content = stripCoTFromSingleTurn(content);
  }
  // Never clean user/system instructions as though they were assistant deliberation.
  return {
    role, content,
    ...(reasoning && role === "assistant" && (!templateType || allowsReasoning(templateType)) ? { reasoning } : {})
  };
}

export function sanitizeExample(example: any, templateType?: string): any {
  if (!isRecord(example)) return example;
  const effectiveTemplate = templateType || example.templateType || "Single Turn";
  let rawMessages = example.messages;
  if (!Array.isArray(rawMessages)) {
    if (Array.isArray(example.conversations)) {
      rawMessages = example.conversations;
    } else {
      rawMessages = [];
      const system = example.system ?? example.systemPrompt;
      const user = example.instruction ?? example.prompt ?? example.input ?? example.user ?? example.query;
      const assistant = example.response ?? example.output ?? example.assistant ?? example.completion ?? example.answer;
      if (system !== undefined) rawMessages.push({ role: "system", content: system });
      if (user !== undefined) rawMessages.push({ role: "user", content: user });
      if (assistant !== undefined) rawMessages.push({ role: "assistant", content: assistant });
    }
  }
  const result: RecordValue = {
    ...example, templateType: effectiveTemplate,
    // Keep every turn. Invalid/empty turns invalidate the whole generated example.
    messages: rawMessages.map((message: any) => sanitizeMessage(message, effectiveTemplate))
  };
  if (!allowsReasoning(effectiveTemplate)) {
    for (const key of ["reasoning", "reasoning_content", "thought", "thoughts"]) delete result[key];
  }
  return result;
}

export function isValidExample(example: any): boolean {
  if (!isRecord(example) || !Array.isArray(example.messages) || example.messages.length < 2) return false;
  const messages = example.messages;
  if (!messages.every((message: any) => isRecord(message)
    && ["system", "developer", "user", "assistant", "tool"].includes(message.role)
    && typeof message.content === "string" && message.content.trim().length > 0)) return false;
  const userIndex = messages.findIndex((message: any) => message.role === "user");
  return userIndex >= 0 && messages.some((message: any, index: number) => message.role === "assistant" && index > userIndex);
}

function unwrapExamples(value: unknown): any[] {
  if (Array.isArray(value)) {
    // A bare array of turns is one conversation, not many examples.
    if (value.length > 0 && value.every(item => isRecord(item) && ("role" in item || "from" in item))) {
      return [{ messages: value }];
    }
    return value.flatMap(unwrapExamples);
  }
  if (!isRecord(value)) return [];
  if (Array.isArray(value.messages) || Array.isArray(value.conversations)) return [value];
  for (const key of ["examples", "data", "items", "batch"]) {
    if (Array.isArray(value[key]) || isRecord(value[key])) return unwrapExamples(value[key]);
  }
  return [value];
}

/** Scan complete top-level JSON values, respecting braces inside quoted/escaped text.
 * A malformed outer value is never mined for nested message objects.
 */
function parseJsonValues(text: string): any[] {
  try {
    return [JSON.parse(text)];
  } catch {
    const values: any[] = [];
    let start = -1;
    let quoted = false;
    let escaped = false;
    const stack: string[] = [];
    for (let index = 0; index < text.length; index++) {
      const character = text[index];
      if (start < 0) {
        if (character !== "[" && character !== "{") continue;
        start = index;
        stack.push(character);
        continue;
      }
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') quoted = false;
        continue;
      }
      if (character === '"') quoted = true;
      else if (character === "[" || character === "{") stack.push(character);
      else if (character === "]" || character === "}") {
        const opening = stack.pop();
        if ((character === "]" && opening !== "[") || (character === "}" && opening !== "{")) {
          // Reject the remainder rather than extracting orphaned inner turns.
          break;
        }
        if (stack.length === 0) {
          try { values.push(JSON.parse(text.slice(start, index + 1))); } catch { /* Invalid value is rejected. */ }
          start = -1;
        }
      }
    }
    return values;
  }
}

/** Validate and normalize before the caller counts or truncates anything. */
export function parseGeneratedExamples(
  rawContent: unknown,
  templateType?: string,
  options: { requireThinkTaggedReasoning?: boolean } = {}
): any[] {
  const text = normalizeText(rawContent);
  if (!text) return [];
  const fenced = Array.from(text.matchAll(/```(?:jsonl|ndjson|json)?[ \t]*\r?\n?([\s\S]*?)```/gi));
  const regions = fenced.length > 0 ? fenced.map(match => match[1].trim()) : [text];
  const requireThinkTaggedReasoning = options.requireThinkTaggedReasoning === true
    && templateType === "Reasoning";

  if (requireThinkTaggedReasoning) {
    return parseReasoningExamples(text).examples;
  }

  return regions.flatMap(parseJsonValues).flatMap(unwrapExamples)
    .map(example => sanitizeExample(example, templateType)).filter(isValidExample);
}

export class ChatCompletionsHttpError extends Error {
  readonly status: number;

  constructor(status: number, detail: string) {
    super(`DigitalOcean Chat Completions request failed (${status}): ${detail}`);
    this.name = "ChatCompletionsHttpError";
    this.status = status;
  }
}

export function isProviderOverload(error: unknown): boolean {
  return error instanceof ChatCompletionsHttpError && error.status === 529;
}