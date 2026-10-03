import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { transform } from "esbuild";
import {
  ChatCompletionsHttpError, isProviderOverload, normalizeText,
  parseGeneratedExamples, parseReasoningExamples, sanitizeExample
} from "../src/lib/generation-response.ts";

// Actual legacy dispatch/provider adapter, with a fixture-only fetch and immediate
// recorded timers. No listener, secrets, live inference, or production files.
const source = await readFile(new URL("../legacy-server.ts", import.meta.url), "utf8");
const dispatchSource = source.slice(
  source.indexOf("// Helper to safely extract text from a DigitalOcean"),
  source.indexOf("// Helper to split document into exactly count")
);
assert.ok(dispatchSource.includes('app.post("/api/generate"'));
const compiled = await transform(dispatchSource, { loader: "ts", format: "cjs", target: "node24" });

const firstModel = "glm-5.3";
const models = [
  firstModel, "qwen3.5-397b-a17b", "gemma-4-31B-it", "deepseek-v4-pro", "nemotron-3-ultra-550b",
  "llama-4-maverick", "mimo-v2.5-pro", "qwen3.8-max", "deepseek-4-flash", "nemotron-3-nano-omni"
];

function hasRenderableMessages(example: any): boolean {
  return Array.isArray(example?.messages)
    && ["user", "assistant"].every(role => example.messages.some((message: any) =>
      message?.role === role && typeof message.content === "string" && message.content.trim().length > 0
    ));
}

function fixture(mode: "success" | "primary529" | "both529" | "503" | "invalid" | "malformedReasoning" | "fastFailure" | "partialFailure" | "timeoutQwen" | "timeoutAllInitial" | "504Qwen" | "abortDuplicateQwen" | "timeoutRecovery" | "timeoutRecoveryAll" = "success") {
  const routes = new Map<string, Function>();
  const calls: any[] = [];
  const delays: number[] = [];
  const timeoutValues: number[] = [];
  let fixtureNow = 1_700_000_000_000;
  const FixtureDate = class extends Date {
    static now() { return fixtureNow; }
  };
  let uuidCount = 0;
  let qwenCallCount = 0;
  let concurrent = 0;
  let peakConcurrent = 0;
  const context = {
    module: { exports: {} },
    app: {
      get(route: string, handler: Function) { routes.set(`GET ${route}`, handler); },
      post(route: string, handler: Function) { routes.set(`POST ${route}`, handler); }
    },
    Type: { OBJECT: "object", ARRAY: "array", STRING: "string", NUMBER: "number", BOOLEAN: "boolean" },
    ChatCompletionsHttpError, isProviderOverload, normalizeText, parseGeneratedExamples, parseReasoningExamples, sanitizeExample,
    logger: { warn() {}, info() {}, error() {} },
    process: { env: { GRADIENT_MODEL_ACCESS_KEY: "offline-fixture-only-not-a-secret" } },
    console: { log() {}, warn() {}, error() {} },
    AbortSignal: {
      timeout(timeoutMs: number) {
        timeoutValues.push(timeoutMs);
        return { aborted: false };
      },
      any(signals: AbortSignal[]) {
        return signals.find(signal => "addEventListener" in signal) || signals[0];
      }
    },
    AbortController,
    Date: FixtureDate,
    randomUUID: () => `fixture-uuid-${++uuidCount}`,
    setTimeout(callback: Function, delay: number) {
      delays.push(delay);
      fixtureNow += delay;
      callback();
    },
    async fetch(url: string, options: any) {
      assert.equal(url, "https://inference.do-ai.run/v1/chat/completions");
      const request = JSON.parse(options.body);
      const requestNumber = calls.length + 1;
      calls.push(request);
      concurrent++;
      peakConcurrent = Math.max(peakConcurrent, concurrent);
      if (mode === "fastFailure" && request.model !== firstModel) {
        return await new Promise(() => {});
      }
      if (mode === "timeoutQwen" && request.model === "qwen3.5-397b-a17b") {
        concurrent--;
        const timeoutError = new Error("fixture request timeout");
        timeoutError.name = "TimeoutError";
        throw timeoutError;
      }
      if (
        mode === "timeoutRecoveryAll"
        || (mode === "timeoutRecovery"
          && ((request.model === "qwen3.5-397b-a17b" && requestNumber === 2)
            || (request.model === firstModel && requestNumber > 5)))
      ) {
        concurrent--;
        const timeoutError = new Error("fixture request timeout");
        timeoutError.name = "TimeoutError";
        throw timeoutError;
      }
      if (mode === "abortDuplicateQwen" && request.model === "qwen3.5-397b-a17b") {
        qwenCallCount++;
        if (qwenCallCount === 1) {
          concurrent--;
          const timeoutError = new Error("fixture request timeout");
          timeoutError.name = "TimeoutError";
          throw timeoutError;
        }
        if (qwenCallCount === 2) {
          return await new Promise((resolve, reject) => {
            const signal = options.signal as AbortSignal;
            if (signal.aborted) {
              concurrent--;
              const abortError = new Error("fixture sibling request aborted");
              abortError.name = "AbortError";
              reject(abortError);
              return;
            }
            signal.addEventListener("abort", () => {
              concurrent--;
              const abortError = new Error("fixture sibling request aborted");
              abortError.name = "AbortError";
              reject(abortError);
            }, { once: true });
          });
        }
      }
      if (mode === "timeoutAllInitial" && requestNumber <= 20) {
        concurrent--;
        const timeoutError = new Error("fixture request timeout");
        timeoutError.name = "TimeoutError";
        throw timeoutError;
      }
      await Promise.resolve();
      concurrent--;
      const isPrimary = request.model === firstModel;
      const isBackup = !models.slice(0, 5).includes(request.model);
      const status = (mode === "fastFailure" && isPrimary) ? 503
        : ((mode === "primary529" || mode === "both529") && isPrimary)
        || (mode === "both529" && isBackup) ? 529
        : mode === "503" && isPrimary ? 503
        : mode === "504Qwen" && request.model === "qwen3.5-397b-a17b" ? 504
        : mode === "partialFailure" && requestNumber === 11 ? 503
        : 200;
      const userPrompt = request.messages.find((message: any) => message.role === "user")?.content || "";
      const requestedCount = Number(userPrompt.match(/Generate exactly (\d+) examples\./)?.[1]) || 1;
      const isMultiTurn = userPrompt.includes('selected TEMPLATE TYPE: "Multi Turn"');
      const isReasoning = userPrompt.includes('selected TEMPLATE TYPE: "Reasoning"');
      const requestedExamples = Array.from({ length: requestedCount }, (_, index) => ({
        messages: isMultiTurn
          ? [
              { role: "system", content: "You are helpful." },
              { role: "user", content: `Question ${index + 1} for ${request.model}` },
              { role: "assistant", content: `Answer ${index + 1} from ${request.model}.` },
              { role: "user", content: `Follow-up ${index + 1} for ${request.model}` },
              { role: "assistant", content: `Follow-up answer ${index + 1} from ${request.model}.` }
            ]
          : [
              { role: "user", content: `Question ${index + 1} for ${request.model}` },
              {
                role: "assistant",
                content: isReasoning && mode !== "malformedReasoning"
                  ? `<think>Check the answer format for ${request.model}.</think>\nAnswer ${index + 1} from ${request.model}.`
                  : `Answer ${index + 1} from ${request.model}.`
              }
            ]
      }));
      const content = mode === "invalid" && isPrimary
        ? "This is prose, not a JSON training example."
        : JSON.stringify({
            examples: isReasoning
              ? requestedExamples
              : [{ messages: [] }, ...requestedExamples]
          });
      const response = status === 200
        ? { choices: [{ message: { content: [
          { type: "text", text: content.slice(0, 30) }, { type: "text", text: content.slice(30) }
        ] } }] }
        : { error: { message: "fixture provider unavailable" } };
      return { ok: status === 200, status, statusText: "Fixture", async text() { return JSON.stringify(response); } };
    }
  };
  vm.runInNewContext(compiled.code, context);
  return {
    calls, delays, timeoutValues,
    peak: () => peakConcurrent,
    async generate(count = 5, jobMode = false, templateType = "Single Turn") {
      const response: any = {
        statusCode: 200, body: undefined,
        status(value: number) { this.statusCode = value; return this; },
        json(value: any) { this.body = value; return this; }
      };
      await routes.get("POST /api/generate")!({
          body: { count, jobMode, templateType, targetTask: "Offline fixture" }
      }, response);
      return response;
    },
    async job(jobId: string) {
      const response: any = {
        statusCode: 200, body: undefined,
        status(value: number) { this.statusCode = value; return this; },
        json(value: any) { this.body = value; return this; }
      };
      await routes.get("GET /api/generate/jobs/:jobId")!({ params: { jobId } }, response);
      return response;
    }
  };
}

test("real dispatcher launches the preserved initial models concurrently and counts only valid examples", async () => {
  const f = fixture();
  const response = await f.generate();
  assert.equal(response.body.success, true);
  assert.equal(response.body.examples.length, 5);
  assert.ok(response.body.examples.every(hasRenderableMessages));
  assert.equal(response.body.batchId, "fixture-uuid-1");
  assert.deepEqual(f.calls.map(call => call.model), models.slice(0, 5));
  assert.equal(f.peak(), 5);
  assert.deepEqual(f.delays, []);
  assert.ok(f.timeoutValues.every(timeoutMs => timeoutMs === 20000));
  assert.equal(f.calls.every(call => call.max_tokens === 4096 && call.response_format.type === "json_object"), true);
});

test("Multi Turn prompt requests the JSON-object envelope required by the provider", async () => {
  const f = fixture();
  const response = await f.generate(5, false, "Multi Turn");
  assert.equal(response.body.success, true);
  assert.equal(response.body.examples.length, 5);
  assert.ok(response.body.examples.every((example: any) => example.messages.length === 5));
  const prompt = f.calls[0].messages.find((message: any) => message.role === "user").content;
  assert.match(prompt, /Return them as one JSON object with an "examples" array/);
  assert.match(prompt, /Do not return a top-level JSON array/);
  assert.ok(f.calls.every(call => JSON.stringify(call.response_format) === JSON.stringify({ type: "json_object" })));
  assert.ok(f.calls.every(call => call.reasoning_effort === "none"));
  assert.doesNotMatch(f.calls[0].messages.find((message: any) => message.role === "system").content, /Return valid JSON that matches this schema/);
});

test("Reasoning batch jobs extract tagged thinking into the UI reasoning field", async () => {
  const f = fixture();
  const started = await f.generate(5, true, "Reasoning");
  const job = await f.job(started.body.jobId);

  assert.equal(job.body.status, "complete");
  assert.equal(job.body.result.examples.length, 5);
  for (const example of job.body.result.examples) {
    const assistant = example.messages.find((message: any) => message.role === "assistant");
    const answerMatch = assistant.content.match(/^Answer 1 from (.+)\.$/);
    assert.ok(answerMatch);
    assert.equal(assistant.reasoning, `Check the answer format for ${answerMatch[1]}.`);
    assert.equal(assistant.content.includes("<think>"), false);
  }
  const prompt = f.calls[0].messages.find((message: any) => message.role === "user").content;
  assert.match(prompt, /selected TEMPLATE TYPE: "Reasoning"/);
  assert.match(prompt, /Each example must contain exactly two messages, in order: one user message, then one assistant message/);
  assert.match(prompt, /Assistant content must start with exactly one non-empty <think>\.\.\.<\/think> block, followed by a non-empty final answer/);
  assert.match(prompt, /Return them as one JSON object with an "examples" array/);
  assert.doesNotMatch(prompt, /Return them as a JSON array of examples/);
  assert.doesNotMatch(prompt, /Alpaca|Mistral|### Response:|\[INST\]/i);
  assert.ok(f.calls.every(call =>
    JSON.stringify(call.response_format) === JSON.stringify({ type: "json_object" })
    && call.reasoning_effort === "none"
    && !Object.hasOwn(call, "json_schema")
  ));

  const systemPrompt = f.calls[0].messages.find((message: any) => message.role === "system").content;
  const schemaPrefix = "Return valid JSON that matches this schema: ";
  const schemaOffset = systemPrompt.indexOf(schemaPrefix);
  assert.notEqual(schemaOffset, -1);
  const responseSchema = JSON.parse(systemPrompt.slice(schemaOffset + schemaPrefix.length));
  assert.equal(String(responseSchema.type).toLowerCase(), "object");
  assert.equal(responseSchema.additionalProperties, false);
  assert.equal(String(responseSchema.properties.examples.type).toLowerCase(), "array");
  assert.equal(responseSchema.properties.examples.minItems, 1);
  assert.equal(responseSchema.properties.examples.maxItems, 1);
  const messagesSchema = responseSchema.properties.examples.items.properties.messages;
  assert.equal(messagesSchema.minItems, 2);
  assert.equal(messagesSchema.maxItems, 2);
  assert.deepEqual(Array.from(messagesSchema.prefixItems, (item: any) => item.properties.role.enum[0]), ["user", "assistant"]);
  const contentPattern = new RegExp(messagesSchema.prefixItems[1].properties.content.pattern);
  for (const content of [
    "<think>Trace.</think>\nAnswer.",
    "<THINK>Trace.</THINK>\nAnswer.",
    " \n<think>Trace.</think>\nAnswer."
  ]) assert.equal(contentPattern.test(content), true);
  for (const content of [
    "### Response:\n<think>Trace.</think>\nAnswer.",
    "<think> </think>\nAnswer.",
    "<think>Trace.</think>",
    "<think>Trace.</think>\nAnswer.<think>Second.</think>",
    "<think>Trace.</think>\n<|im_end|>"
  ]) assert.equal(contentPattern.test(content), false);
});

test("Reasoning timeout recovery updates the schema to the requested fill count", async () => {
  const f = fixture("timeoutQwen");
  const started = await f.generate(25, true, "Reasoning");
  const job = await f.job(started.body.jobId);

  assert.equal(job.body.status, "complete");
  assert.equal(job.body.result.examples.length, 25);
  const recoveryCall = f.calls.at(-1);
  const recoveryPrompt = recoveryCall.messages.find((message: any) => message.role === "user").content;
  assert.match(recoveryPrompt, /Generate exactly 3 examples\./);

  const systemPrompt = recoveryCall.messages.find((message: any) => message.role === "system").content;
  const schemaPrefix = "Return valid JSON that matches this schema: ";
  const schemaOffset = systemPrompt.indexOf(schemaPrefix);
  assert.notEqual(schemaOffset, -1);
  const responseSchema = JSON.parse(systemPrompt.slice(schemaOffset + schemaPrefix.length));
  assert.equal(responseSchema.properties.examples.minItems, 3);
  assert.equal(responseSchema.properties.examples.maxItems, 3);
});

test("Reasoning batch jobs reject responses that omit the required think block", async () => {
  const f = fixture("malformedReasoning");
  const started = await f.generate(5, true, "Reasoning");
  const job = await f.job(started.body.jobId);

  assert.equal(job.body.status, "error");
  assert.equal(job.body.result, undefined);
  assert.equal(Object.hasOwn(job.body, "failureCategory"), false);
  assert.equal(f.calls.length, 5);
});

test("Reasoning timeout failure categories remain internal to job status", async () => {
  for (const [mode, expectedStatus] of [
    ["timeoutRecovery", "partial"],
    ["timeoutRecoveryAll", "error"]
  ] as const) {
    const f = fixture(mode);
    const started = await f.generate(5, true, "Reasoning");
    const job = await f.job(started.body.jobId);

    assert.equal(job.body.status, expectedStatus);
    assert.equal(Object.hasOwn(job.body, "failureCategory"), false);
    if (expectedStatus === "partial") {
      assert.ok(job.body.result.examples.length > 0);
      assert.ok(job.body.result.examples.length < 5);
    } else {
      assert.equal(job.body.result, undefined);
    }
    assert.equal(f.calls.length, 6);
  }
});

test("a stalled model is skipped in later stacks and GLM fills all missing examples in one request", async () => {
  for (const mode of ["timeoutQwen", "504Qwen"] as const) {
    const f = fixture(mode);
    const response = await f.generate(25);
    assert.equal(response.body.success, true);
    assert.equal(response.body.examples.length, 25);
    assert.ok(response.body.examples.every(hasRenderableMessages));
    assert.equal(response.body.partial, undefined);
    assert.equal(f.calls.filter(call => call.model === "qwen3.5-397b-a17b").length, 1);
    assert.equal(f.calls.at(-1).model, firstModel);
    const recoveryPrompt = f.calls.at(-1).messages.find((message: any) => message.role === "user").content;
    assert.match(recoveryPrompt, /Generate exactly 3 examples\./);
    assert.equal(f.timeoutValues.at(-1), 60000);
    assert.ok(f.timeoutValues.slice(0, -1).every(timeoutMs => timeoutMs === 20000));
  }
});

test("batches over 50 examples receive a proportionally longer total timeout", async () => {
  const f = fixture("timeoutAllInitial");
  const response = await f.generate(250);
  assert.equal(response.body.success, true);
  assert.equal(response.body.examples.length, 250);
  assert.equal(f.calls.length, 21);
  assert.equal(f.calls.at(-1).model, firstModel);
  const fallbackTimeout = f.timeoutValues.at(-1) ?? 0;
  assert.equal(fallbackTimeout, 576000);
  assert.ok(fallbackTimeout > 120000);
});

test("stopping a stalled model aborts its duplicate in-flight request", async () => {
  const f = fixture("abortDuplicateQwen");
  const response = await f.generate(200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.examples.length, 200);
  assert.equal(f.calls.filter(call => call.model === "qwen3.5-397b-a17b").length, 2);
  assert.equal(f.calls.at(-1).model, firstModel);
  const recoveryPrompt = f.calls.at(-1).messages.find((message: any) => message.role === "user").content;
  assert.match(recoveryPrompt, /Generate exactly 20 examples\./);
});

test("HTTP 529 triggers exactly one distinct configured backup request", async () => {
  const f = fixture("primary529");
  const response = await f.generate();
  assert.equal(response.body.success, true);
  assert.equal(f.calls.length, 6);
  assert.deepEqual(f.calls.slice(0, 5).map(call => call.model), models.slice(0, 5));
  assert.ok(models.includes(f.calls[5].model));
  assert.notEqual(f.calls[5].model, firstModel);
});

test("a failed 529 backup is not retried again and completed examples return as a partial batch", async () => {
  const f = fixture("both529");
  const response = await f.generate();
  assert.equal(f.calls.length, 6);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.partial, true);
  assert.ok(response.body.examples.length > 0);
  assert.ok(response.body.examples.length < 5);
  assert.equal(response.body.batchId, "fixture-uuid-1");
  assert.match(response.body.partialReason, /backup model/i);
});

test("a job returns its server-generated batch ID immediately and preserves it in the final result", async () => {
  const f = fixture();
  const started = await f.generate(5, true);
  assert.equal(started.statusCode, 202);
  assert.equal(started.body.batchId, "fixture-uuid-1");
  assert.notEqual(started.body.batchId, started.body.jobId);
  const job = await f.job(started.body.jobId);
  assert.equal(job.body.status, "complete");
  assert.equal(job.body.batchId, started.body.batchId);
  assert.equal(job.body.result.batchId, started.body.batchId);
  assert.equal(job.body.result.examples.length, 5);
  assert.ok(job.body.result.examples.every(hasRenderableMessages));
});

test("timed-out model stacks preserve completed examples and the same batch ID in job results", async () => {
  const f = fixture("partialFailure");
  const started = await f.generate(25, true);
  assert.equal(started.statusCode, 202);
  const job = await f.job(started.body.jobId);
  assert.equal(job.body.status, "partial");
  assert.equal(job.body.result.success, true);
  assert.equal(job.body.result.partial, true);
  assert.equal(job.body.result.batchId, started.body.batchId);
  assert.equal(job.body.batchId, started.body.batchId);
  assert.ok(job.body.result.examples.length >= 10);
  assert.ok(job.body.result.examples.length < 25);
  assert.equal(job.body.result.requestedCount, 25);
  assert.ok(job.body.result.partialReason);
});

test("other HTTP failures and invalid content do not retry or top up", async () => {
  for (const mode of ["503", "invalid"] as const) {
    const f = fixture(mode);
    const response = await f.generate();
    assert.equal(f.calls.length, 5);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.partial, true);
    assert.ok(response.body.examples.length > 0);
    assert.ok(response.body.examples.length < 5);
  }
});

test("an unrecoverable request fails promptly instead of waiting on hanging sibling models", async () => {
  const f = fixture("fastFailure");
  const outcome = await Promise.race([
    f.generate(),
    new Promise(resolve => setTimeout(() => resolve("still waiting"), 500))
  ]);
  assert.notEqual(outcome, "still waiting");
  assert.equal((outcome as any).statusCode, 500);
  assert.match((outcome as any).body.error, /stopped after 0 of 5 examples/);
  assert.equal(f.calls.length, 5);
});

test("preserved schedules and two-second spacing cover every supported batch size", async () => {
  const expected: Record<number, number[]> = {
    5: [5], 10: [10], 25: [10, 10, 5], 50: Array(5).fill(10),
    100: Array(10).fill(10), 200: Array(10).fill(20), 250: [...Array(12).fill(20), 10]
  };
  for (const [count, stackSizes] of Object.entries(expected)) {
    const f = fixture();
    const response = await f.generate(Number(count));
    assert.equal(response.body.success, true);
    assert.equal(response.body.examples.length, Number(count));
    assert.equal(f.calls.length, Number(count));
    assert.equal(f.peak(), Math.max(...stackSizes));
    assert.deepEqual(f.delays, Array(stackSizes.length - 1).fill(2000));
    let offset = 0;
    for (const stackSize of stackSizes) {
      const scheduled = stackSize === 20 ? [...models, ...models] : models.slice(0, stackSize);
      assert.deepEqual(f.calls.slice(offset, offset + stackSize).map(call => call.model), scheduled);
      offset += stackSize;
    }
  }
});