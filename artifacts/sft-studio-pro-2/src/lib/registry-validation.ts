// Validate the serialized final records without changing their content.
export function validateRegistryOutput(records: unknown[], format: string): string | null {
  const text = (value: unknown) => typeof value === "string" && value.trim().length > 0;
  const conversation = (messages: any[], allowSystem = true): boolean => {
    if (!Array.isArray(messages) || !messages.length) return false;
    const turns = messages[0]?.role === "system" && allowSystem ? messages.slice(1) : messages;
    return messages.every(m => m && text(m.content)
      && (m.reasoning_content === undefined
        || (m.role === "assistant" && text(m.reasoning_content))))
      && turns.length >= 2 && turns.length % 2 === 0
      && turns.every((m, i) => m.role === (i % 2 ? "assistant" : "user"));
  };
  for (const [index, record] of records.entries()) {
    let valid = false;
    try {
      const line = JSON.stringify(record);
      if (!line || /[\r\n]/.test(line)) throw new Error("Invalid JSONL line");
      const row = JSON.parse(line);
      if (!row || Array.isArray(row) || typeof row !== "object") throw new Error("Invalid record");
      if (["chatml", "openai", "deepseek", "openai_o1_o3"].includes(format)) {
        valid = conversation(row.messages, format !== "openai_o1_o3");
      } else if (format === "sharegpt") {
        valid = Array.isArray(row.conversations) && conversation(row.conversations.map((m: any) => ({
          role: ({ system: "system", human: "user", gpt: "assistant" } as Record<string, string>)[m?.from],
          content: m?.value
        })));
      } else if (["chatml_token", "chatml_tokens", "chatml_raw", "chatml_instruction"].includes(format)) {
        if (text(row.text)) {
          const pattern = /<\|im_start\|>(system|user|assistant)\n([\s\S]*?)\n<\|im_end\|>/g;
          const matches = [...row.text.matchAll(pattern)];
          valid = matches.length > 0 && !row.text.replace(pattern, "").trim()
            && matches.every(m => !/<\|im_(?:start|end)\|>/.test(m[2]))
            && conversation(matches.map(m => ({ role: m[1], content: m[2] })));
        }
      } else if (format === "alpaca" || format === "maestro") {
        valid = text(row.instruction) && typeof row.input === "string"
          && text(row[format === "alpaca" ? "output" : "response"])
          && (format === "maestro" ? typeof row.system === "string"
            : row.system === undefined || typeof row.system === "string");
      } else if (format === "prompt_response") {
        valid = text(row.prompt) && text(row.response);
      }
    } catch {
      valid = false;
    }
    if (!valid) return `Final format check failed at example ${index + 1}. Please correct it in QA before exporting.`;
  }
  return null;
}

export interface FinalizedRegistryOutput {
  records: unknown[];
  jsonl: string;
  corrections: number;
  error: string | null;
}

const normalizeLineEndings = (value: unknown, onCorrection: () => void): unknown => {
  if (typeof value !== "string") return value;
  const normalized = value.replace(/\r\n?/g, "\n");
  if (normalized !== value) onCorrection();
  return normalized;
};

/**
 * Canonicalize deterministic template issues, serialize to JSONL, reparse it,
 * and validate the exact records that Registry export or training will use.
 */
export function finalizeRegistryOutput(records: unknown[], format: string): FinalizedRegistryOutput {
  let corrections = 0;
  const corrected = records.map(record => {
    if (!record || typeof record !== "object" || Array.isArray(record)) return record;
    const row = { ...(record as Record<string, any>) };

    if (format === "alpaca") {
      if (row.input === undefined || row.input === null) {
        row.input = "";
        corrections++;
      }
      for (const key of ["system", "instruction", "input", "output"]) {
        row[key] = normalizeLineEndings(row[key], () => corrections++);
      }
      return row;
    }

    if (["chatml", "openai", "openai_o1_o3", "deepseek"].includes(format)
      && Array.isArray(row.messages)) {
      row.messages = row.messages.map((message: any) => {
        if (!message || typeof message !== "object" || Array.isArray(message)) return message;
        let role = message.role;
        if (role === "human") {
          role = "user";
          corrections++;
        } else if (role === "gpt") {
          role = "assistant";
          corrections++;
        }
        const reasoning = message.reasoning_content ?? message.reasoning;
        if (message.reasoning !== undefined && message.reasoning_content === undefined) corrections++;
        const normalized: Record<string, unknown> = { role };
        if (role === "assistant" && reasoning !== undefined) {
          normalized.reasoning_content = normalizeLineEndings(reasoning, () => corrections++);
        }
        normalized.content = normalizeLineEndings(message.content, () => corrections++);
        return normalized;
      });
      return row;
    }

    if (format === "chatml_token" || format === "chatml_tokens"
      || format === "chatml_raw" || format === "chatml_instruction") {
      row.text = normalizeLineEndings(row.text, () => corrections++);
    }
    return row;
  });

  let jsonl = "";
  let serializedRecords: unknown[] = [];
  let error: string | null = null;
  try {
    jsonl = corrected.map(record => JSON.stringify(record)).join("\n");
    serializedRecords = jsonl ? jsonl.split("\n").map(line => JSON.parse(line)) : [];
    if (serializedRecords.length !== records.length) {
      error = "Final serialization changed the dataset record count.";
    } else {
      error = validateRegistryOutput(serializedRecords, format);
    }
  } catch {
    error = "Final serialization failed; the dataset contains a non-JSON value.";
  }

  return { records: serializedRecords, jsonl, corrections, error };
}
