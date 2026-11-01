// Validate the serialized final records without changing their content.
export function validateRegistryOutput(records: unknown[], format: string): string | null {
  const text = (value: unknown) => typeof value === "string" && value.trim().length > 0;
  const conversation = (messages: any[], allowSystem = true): boolean => {
    if (!Array.isArray(messages) || !messages.length) return false;
    const turns = messages[0]?.role === "system" && allowSystem ? messages.slice(1) : messages;
    return messages.every(m => m && text(m.content)
      && (m.reasoning_content === undefined || text(m.reasoning_content)))
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
      } else if (format === "alpaca") {
        valid = text(row.instruction) && text(row.input) && text(row.output)
          && row.system === undefined && row.response === undefined;
      } else if (format === "maestro") {
        valid = text(row.instruction) && typeof row.input === "string"
          && text(row.response) && typeof row.system === "string";
      } else if (format === "prompt_response") {
        valid = text(row.prompt) && text(row.response);
      } else if (format === "text_completion") {
        valid = text(row.prompt) && text(row.completion);
      }
    } catch {
      valid = false;
    }
    if (!valid) return `Final format check failed at example ${index + 1}. Please correct it in QA before exporting.`;
  }
  return null;
}

// Exclude incomplete examples only from finalized copies; never trim their turns.
export function excludeUnansweredExamples(records: unknown[], format: string): unknown[] {
  return records.filter(record => {
    const row = record as any;
    if (["chatml", "openai", "openai_o1_o3", "deepseek"].includes(format)) {
      return !Array.isArray(row?.messages) || row.messages.at(-1)?.role !== "user";
    }
    if (format === "sharegpt") {
      return !Array.isArray(row?.conversations) || row.conversations.at(-1)?.from !== "human";
    }
    if (["chatml_token", "chatml_tokens", "chatml_raw", "chatml_instruction"].includes(format)
      && typeof row?.text === "string") {
      const pattern = /<\|im_start\|>(system|user|assistant)\n([\s\S]*?)\n<\|im_end\|>/g;
      const turns = [...row.text.matchAll(pattern)];
      // Leave malformed framing for the validator to reject.
      return !!row.text.replace(pattern, "").trim() || turns.at(-1)?.[1] !== "user";
    }
    return true;
  });
}

export interface FinalizedRegistryOutput {
  records: unknown[];
  jsonl: string;
  corrections: number;
  error: string | null;
}

const normalizeLineEndings = (value: unknown, onCorrection: () => void, preserveThink = false): unknown => {
  if (typeof value !== "string") return value;
  const normalized = value
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(preserveThink ? /<(?!\/?think\b)[^>]*>/gi : /<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized !== value) onCorrection();
  return normalized;
};

/**
 * Canonicalize deterministic template issues, serialize to JSONL, reparse it,
 * and validate the exact records that Registry export or training will use.
 */
export function finalizeRegistryOutput(records: unknown[], format: string): FinalizedRegistryOutput {
  const completeRecords = excludeUnansweredExamples(records, format);
  let corrections = records.length - completeRecords.length;
  const corrected = completeRecords.map(record => {
    if (!record || typeof record !== "object" || Array.isArray(record)) return record;
    const row = { ...(record as Record<string, any>) };

    if (format === "alpaca") {
      if (typeof row.system === "string") {
        const previousInstruction = row.instruction;
        if ((row.input === undefined || row.input === null || row.input === "")
          && typeof previousInstruction === "string" && previousInstruction !== row.system) {
          row.input = previousInstruction;
          corrections++;
        }
        row.instruction = row.system;
        delete row.system;
        corrections++;
      }
      if (row.output === undefined && typeof row.response === "string") {
        row.output = row.response;
        delete row.response;
        corrections++;
      } else if (row.response !== undefined) {
        delete row.response;
        corrections++;
      }
      for (const key of ["instruction", "input", "output"]) {
        row[key] = normalizeLineEndings(row[key], () => corrections++);
      }
      return row;
    }

    if (["chatml", "openai", "openai_o1_o3", "deepseek"].includes(format)
      && Array.isArray(row.messages)) {
      row.messages = row.messages.map((message: any) => {
        if (!message || typeof message !== "object" || Array.isArray(message)) return message;
        const normalized: Record<string, unknown> = { ...message };
        for (const key of ["reasoning", "reasoning_content"]) {
          if (message[key] !== undefined) {
            normalized[key] = normalizeLineEndings(message[key], () => corrections++);
          }
        }
        normalized.content = normalizeLineEndings(message.content, () => corrections++, format === "deepseek");
        return normalized;
      });
      return row;
    }

    if (format === "chatml_token" || format === "chatml_tokens"
      || format === "chatml_raw" || format === "chatml_instruction") {
      if (typeof row.text === "string") {
        // Clean message bodies without removing the selected template's framing.
        row.text = row.text.replace(
          /<\|im_start\|>(system|user|assistant)\n([\s\S]*?)\n<\|im_end\|>/g,
          (_: string, role: string, content: string) =>
            `<|im_start|>${role}\n${normalizeLineEndings(content, () => corrections++, true)}\n<|im_end|>`
        );
      }
    } else if (format === "sharegpt" && Array.isArray(row.conversations)) {
      row.conversations = row.conversations.map((message: any) => ({
        ...message,
        value: normalizeLineEndings(message?.value, () => corrections++, true),
      }));
    } else {
      const fields = format === "maestro" ? ["system", "instruction", "input", "response"]
        : format === "prompt_response" ? ["prompt", "response"]
        : format === "text_completion" ? ["prompt", "completion"]
        : [];
      for (const key of fields) {
        row[key] = normalizeLineEndings(row[key], () => corrections++);
      }
    }
    return row;
  });

  let jsonl = "";
  let serializedRecords: unknown[] = [];
  let error: string | null = null;
  try {
    jsonl = corrected.map(record => JSON.stringify(record)).join("\n");
    serializedRecords = jsonl ? jsonl.split("\n").map(line => JSON.parse(line)) : [];
    if (records.length > 0 && completeRecords.length === 0) {
      error = "No complete examples remain; every example ends with an unanswered user message.";
    } else if (serializedRecords.length !== completeRecords.length) {
      error = "Final serialization changed the dataset record count.";
    } else {
      error = validateRegistryOutput(serializedRecords, format);
    }
  } catch {
    error = "Final serialization failed; the dataset contains a non-JSON value.";
  }

  return { records: serializedRecords, jsonl, corrections, error };
}
