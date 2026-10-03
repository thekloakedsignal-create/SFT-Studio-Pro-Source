import test from "node:test";
import assert from "node:assert/strict";
import {
  ChatCompletionsHttpError, isProviderOverload, normalizeText, parseGeneratedExamples, parseReasoningExamples,
  sanitizeExample, sanitizeMessage
} from "../src/lib/generation-response.ts";

const single = {
  messages: [
    { role: "system", content: "Explain clearly." },
    { role: "user", content: "What is JSON?" },
    { role: "assistant", content: "JSON is a structured data format." }
  ]
};
const multi = {
  conversations: [
    { from: "system", value: "Help with debugging." },
    { from: "human", value: 'What does this mean: "{[escaped]}"?' },
    { from: "gpt", value: "It is a quoted string." },
    { from: "human", value: "Can it contain a backslash?" },
    { from: "gpt", value: 'Yes, escape it as "\\\\".' }
  ]
};

test("normalizes Chat Completions string/text blocks without coercing arbitrary objects", () => {
  const json = JSON.stringify({ examples: [single] });
  const blocks = [{ type: "text", text: json.slice(0, 30) }, { type: "text", text: json.slice(30) }];
  assert.equal(normalizeText(blocks), json);
  assert.equal(parseGeneratedExamples(blocks, "Single Turn").length, 1);
  assert.equal(normalizeText([{ type: "text", text: "Hello " }, { type: "text", text: "world" }]), "Hello world");
  assert.equal(normalizeText({ response: "answer" }), "answer");
  assert.equal(normalizeText({ random: "not content" }), "");
  assert.equal(normalizeText(42), "");
  assert.equal(normalizeText([{ type: "image_url", image_url: { url: "not text" } }]), "");
  assert.equal(normalizeText("a\r\nb\rc"), "a\nb\nc");
  assert.equal(normalizeText("https://example.com/news"), "https://example.com/news");
  const artifacts = parseGeneratedExamples(JSON.stringify({ prompt: "Q", response: "First /n Second" }))[0];
  assert.equal(artifacts.messages[1].content, "First \n Second");
});

test("direct JSON and all supported envelopes preserve full examples", () => {
  for (const value of [single, [single], ...["examples", "data", "items", "batch"].map(key => ({ [key]: [single] }))]) {
    const examples = parseGeneratedExamples(JSON.stringify(value), "Single Turn");
    assert.equal(examples.length, 1);
    assert.deepEqual(examples[0].messages, single.messages);
  }
  const examples = parseGeneratedExamples(JSON.stringify(multi), "Multi Turn");
  assert.equal(examples.length, 1);
  assert.equal(examples[0].messages.length, 5);
  assert.deepEqual(examples[0].messages.map((message: any) => message.role), ["system", "user", "assistant", "user", "assistant"]);
});

test("fenced/prose JSON and NDJSON keep nested messages and conversations intact", () => {
  const encoded = JSON.stringify({ examples: [single, multi] }, null, 2);
  for (const text of [`Here is the batch:\n${encoded}\nDone.`, `Here it is:\n\`\`\`json\n${encoded}\n\`\`\`\nDone.`]) {
    const examples = parseGeneratedExamples(text, "Multi Turn");
    assert.equal(examples.length, 2);
    assert.equal(examples[0].messages.length, 3);
    assert.equal(examples[1].messages.length, 5);
  }
  const ndjson = `${JSON.stringify({ examples: [single] })}\n${JSON.stringify(multi)}`;
  assert.equal(parseGeneratedExamples(`\`\`\`ndjson\n${ndjson}\n\`\`\``, "Multi Turn").length, 2);
  const separateFences = `\`\`\`json\n${JSON.stringify(single)}\n\`\`\`\n\`\`\`json\n${JSON.stringify(multi)}\n\`\`\``;
  assert.equal(parseGeneratedExamples(separateFences, "Multi Turn").length, 2);
  assert.equal(parseGeneratedExamples(JSON.stringify(single.messages), "Single Turn").length, 1);
});

test("rejects malformed JSON, prose, empty examples, and missing/unknown/empty turns", () => {
  const invalid: any[] = [
    null, 3, "prose", {}, { messages: [] }, { messages: [{ role: "assistant", content: "Only an answer" }] },
    { messages: [{ role: "user", content: "Only a question" }] },
    { messages: [{ role: "user", content: "Q" }, { role: "assistant", content: " " }] },
    { messages: [{ role: "user", content: "Q" }, { content: "Missing role" }] },
    { messages: [{ role: "alien", content: "Q" }, { role: "assistant", content: "A" }] },
    { messages: [{ role: "user", content: "Q" }, { role: "assistant", content: { reasoning: "no answer" } }] },
    { messages: [{ role: "user", content: "Q" }, { role: "assistant", content: "<think>no final answer</think>" }] },
    { messages: [...single.messages, { role: "user", content: "" }] }
  ];
  for (const value of invalid) assert.deepEqual(parseGeneratedExamples(JSON.stringify(value), "Single Turn"), []);
  assert.deepEqual(parseGeneratedExamples("Here is a long response, but not a generated JSON dataset."), []);
  assert.deepEqual(parseGeneratedExamples('{"examples":[{"messages":[{"role":"user","content":"Q"},{"role":"assistant","content":"A"}]}]'), []);
  assert.deepEqual(parseGeneratedExamples('{"broken": [{"messages":[{"role":"user","content":"Q"},{"role":"assistant","content":"A"}]}],}'), []);
  // NDJSON containing individual turns is not repaired into fake examples.
  assert.deepEqual(parseGeneratedExamples(single.messages.map(message => JSON.stringify(message)).join("\n")), []);
});

test("invalid entries are removed before truncation and counting, never repaired", () => {
  const examples = parseGeneratedExamples(JSON.stringify([
    {}, { messages: [] }, single, { prompt: "Second?", response: "Second answer." }, { prompt: "Missing answer" }
  ]), "Single Turn");
  assert.equal(examples.length, 2);
  assert.equal(examples.slice(0, 1)[0].messages[1].content, "What is JSON?");
  assert.equal(sanitizeExample({ messages: [{ role: "user", content: "Q" }] }).messages.length, 1);
});

test("reasoning is retained only in supported templates; user/system text is preserved", () => {
  const messages = [
    { role: "user", content: "Analysis: explain the field named response." },
    { role: "assistant", content: "<think>Check the format.</think>\nA complete final answer." }
  ];
  for (const template of ["Reasoning", "Mixed"]) {
    const example = parseGeneratedExamples(JSON.stringify({ messages }), template)[0];
    assert.equal(example.messages[1].reasoning, "Check the format.");
    assert.equal(example.messages[1].content, "A complete final answer.");
  }
  const example = parseGeneratedExamples(JSON.stringify({ messages }), "Single Turn")[0];
  assert.equal(example.messages[0].content, messages[0].content);
  assert.equal(example.messages[1].reasoning, undefined);
  assert.equal(sanitizeMessage({ role: "assistant", content: { response: "Answer.", reasoning: "Check." } }, "Reasoning").reasoning, "Check.");
});

test("strict tagged reasoning validation is optional and applies only to Reasoning", () => {
  const valid = {
    examples: [{
      messages: [
        { role: "user", content: "Q" },
        { role: "assistant", content: "<think>Check the format.</think>\nA complete answer." }
      ]
    }]
  };
  const strictOptions = { requireThinkTaggedReasoning: true };
  const parsed = parseGeneratedExamples(JSON.stringify(valid), "Reasoning", strictOptions);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].messages[1].reasoning, "Check the format.");
  assert.equal(parsed[0].messages[1].content, "A complete answer.");

  const invalidExamples = [
    { messages: [{ role: "user", content: "Q" }, { role: "assistant", content: "A plain answer without a trace." }] },
    { messages: [{ role: "user", content: "Q" }, { role: "assistant", content: "<think> </think>\nAnswer." }] },
    { messages: [{ role: "user", content: "Q" }, { role: "assistant", content: "<think>Trace without a final answer.</think>" }] },
    { messages: [{ role: "user", content: "Q" }, { role: "assistant", content: "Unrequested preamble.\n<think>Trace.</think>\nAnswer." }] },
    { messages: [{ role: "user", content: "Q" }, { role: "assistant", content: "### Response:\n<think>Trace.</think>\nAnswer." }] },
    { messages: [{ role: "user", content: "Q" }, { role: "assistant", content: "<think>Trace.</think>\nAnswer.\n<think>Second trace.</think>" }] },
    { messages: [{ role: "system", content: "No system message." }, { role: "user", content: "Q" }, { role: "assistant", content: "<think>Trace.</think>\nAnswer." }] },
    { messages: [{ role: "user", content: "Q" }, { role: "assistant", content: "<think>Trace.</think>\nAnswer." }, { role: "assistant", content: "<think>Extra turn.</think>\nAnswer." }] },
    { messages: [{ role: "human", content: "Q" }, { role: "gpt", content: "<think>Trace.</think>\nAnswer." }] },
    { messages: [{ role: "user", content: "Q" }, { role: "assistant", reasoning: "Separate field.", content: "<think>Trace.</think>\nAnswer." }] },
    { messages: [{ role: "user", content: "Q" }, { role: "assistant", content: "<think>Trace.</think>\nAnswer." }], extra: true }
  ];
  for (const example of invalidExamples) {
    assert.deepEqual(parseGeneratedExamples(JSON.stringify({ examples: [example] }), "Reasoning", strictOptions), []);
  }
  for (const nonContractResponse of [
    JSON.stringify(valid.examples),
    JSON.stringify({ data: valid.examples }),
    `\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``,
    `${JSON.stringify(valid)}\n${JSON.stringify(valid)}`
  ]) {
    assert.deepEqual(parseGeneratedExamples(nonContractResponse, "Reasoning", strictOptions), []);
  }

  const untagged = {
    messages: [
      { role: "user", content: "Q" },
      { role: "assistant", content: "A plain answer." }
    ]
  };
  assert.equal(parseGeneratedExamples(JSON.stringify(untagged), "Reasoning").length, 1);
  assert.equal(parseGeneratedExamples(JSON.stringify(untagged), "Single Turn", strictOptions).length, 1);
});

test("strict Reasoning parsing returns safe failure categories and enforces the requested count", () => {
  assert.deepEqual(parseReasoningExamples("", 1), {
    examples: [],
    failureCategory: "empty_response"
  });
  assert.deepEqual(parseReasoningExamples("{broken", 1), {
    examples: [],
    failureCategory: "invalid_json"
  });
  assert.deepEqual(parseReasoningExamples(JSON.stringify({ data: [] }), 1), {
    examples: [],
    failureCategory: "invalid_envelope"
  });
  assert.deepEqual(parseReasoningExamples(JSON.stringify({ examples: [{ messages: [] }] }), 1), {
    examples: [],
    failureCategory: "invalid_example_structure"
  });
  assert.deepEqual(parseReasoningExamples(JSON.stringify({
    examples: [{
      messages: [
        { role: "user", content: "Q" },
        { role: "assistant", content: "<think>Trace.</think>\nAnswer.<think>" }
      ]
    }]
  }), 1), {
    examples: [],
    failureCategory: "invalid_reasoning_content"
  });
  const validBatch = JSON.stringify({
    examples: [{
      messages: [
        { role: "user", content: "Q" },
        { role: "assistant", content: "<think>Trace.</think>\nAnswer." }
      ]
    }]
  });
  assert.deepEqual(parseReasoningExamples(validBatch, 2), {
    examples: [],
    failureCategory: "wrong_example_count"
  });
  assert.equal(parseReasoningExamples(validBatch, 1).examples.length, 1);
  const leadingWhitespaceBatch = JSON.stringify({
    examples: [{
      messages: [
        { role: "user", content: "Q" },
        { role: "assistant", content: " \n<think>Trace.</think>\nAnswer." }
      ]
    }]
  });
  assert.equal(parseReasoningExamples(leadingWhitespaceBatch, 1).examples.length, 1);
});

test("only actual HTTP 529 provider errors qualify for a backup", () => {
  assert.equal(isProviderOverload(new ChatCompletionsHttpError(529, "overloaded")), true);
  for (const status of [400, 401, 429, 500, 503]) {
    assert.equal(isProviderOverload(new ChatCompletionsHttpError(status, "529 in response body")), false);
  }
  assert.equal(isProviderOverload(new Error("DigitalOcean Chat Completions request failed (529)")), false);
  assert.equal(isProviderOverload(new Error("transport error")), false);
});