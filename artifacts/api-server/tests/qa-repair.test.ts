import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { transform } from "esbuild";
import { sanitizeMessage, encodeReasoningProviderText, decodeReasoningProviderText } from "../src/lib/generation-response.ts";
import { auditTemplateFormat } from "../src/lib/quality-format.ts";

const source = await readFile(new URL("../legacy-server.ts", import.meta.url), "utf8");
const code = (await transform(
  source.slice(source.indexOf("function createModelGenerationStacks("), source.indexOf("// API Routes"))
  + source.slice(source.indexOf("// 3.1 Regenerate and Fix"), source.indexOf("// Helper to parse CSV")),
  { loader: "ts", format: "cjs" }
)).code;

function fixture(badIndex = -1) {
  const routes = new Map<string, Function>();
  const calls: any[] = [];
  let active = 0, peak = 0;
  const models = Array.from({ length: 10 }, (_, index) => `model-${index}`);
  vm.runInNewContext(code, {
    app: {
      get: (path: string, ...handlers: Function[]) => routes.set(path, handlers.at(-1)!),
      post: (path: string, ...handlers: Function[]) => routes.set(path, handlers.at(-1)!)
    },
    optionalAuth() {}, projectOwnerId: (req: any) => req.deviceId,
    randomUUID: () => "qa-job", console, getDigitalOceanClient: () => ({}),
    getGenerationModels: () => models, sanitizeMessage, auditTemplateFormat,
    encodeReasoningProviderText, decodeReasoningProviderText,
    formatAIErrorMessage: (error: Error) => error.message,
    setTimeout: (fn: Function) => fn(),
    async callDigitalOceanAI(params: any) {
      calls.push(params);
      peak = Math.max(peak, ++active);
      await new Promise(resolve => setImmediate(resolve));
      active--;
      const input = JSON.parse(params.contents.split("FLAGGED EXAMPLES AND SPECIFIC AUDIT ISSUES:")[1].split("RULES:")[0].trim())[0];
      const messages = input.example.messages.map((message: any) => ({
        ...message, content: message.role === "assistant" ? "Corrected substantive response." : "Provider must not change this."
      }));
      return { text: JSON.stringify({ regeneratedExamples: [{
        exampleIndex: input.exampleIndex === badIndex ? 999 : input.exampleIndex, messages
      }] }) };
    },
    extractResponseText: (response: any) => response.text
  });
  const response = () => ({
    code: 200, body: null as any,
    status(code: number) { this.code = code; return this; },
    json(body: any) { this.body = body; return this; }
  });
  return {
    calls, peak: () => peak,
    async run(items: any[], extra = {}) {
      const res = response();
      const done = routes.get("/api/regenerate-flagged")!({ deviceId: "owner", body: {
        flaggedItems: items, jobMode: true, templateType: "Mixed", specialInstructions: "Keep examples practical",
        temporaryConstraints: "No invented statistics", suggestions: ["Fix accuracy"], ...extra
      } }, res);
      assert.equal(res.code, 202);
      await done;
      return this.poll().body.result;
    },
    poll(owner = "owner") {
      const res = response();
      routes.get("/api/regenerate-flagged/jobs/:jobId")!({ deviceId: owner, params: { jobId: "qa-job" } }, res);
      return res;
    }
  };
}

const items = Array.from({ length: 25 }, (_, index) => ({
  exampleIndex: index * 2,
  example: { messages: [
    { role: "system", content: "Original system instruction" },
    { role: "user", content: `Original prompt ${index}` },
    { role: "assistant", content: "Flagged response" },
    ...(index % 2 ? [{ role: "user", content: "Follow up" }, { role: "assistant", content: "Flagged follow up" }] : [])
  ] },
  issues: [{ message: "Correct the factual claim", recommendedFix: "Use the supplied evidence" }]
}));

test("QA repairs use concurrent batch stacks, original templates, and only flagged indices", async () => {
  const f = fixture();
  const result = await f.run(items);
  assert.equal(f.peak(), 10);
  assert.equal(result.regeneratedExamples.length, 25);
  assert.equal(result.partial, false);
  assert.equal(f.poll("different-owner").code, 404);
  assert.deepEqual(Array.from(result.regeneratedExamples, (item: any) => item.exampleIndex).sort((a: any, b: any) => a - b), items.map(item => item.exampleIndex));
  for (const repaired of result.regeneratedExamples) {
    const original = items.find(item => item.exampleIndex === repaired.exampleIndex)!;
    assert.equal(repaired.messages.length, original.example.messages.length);
    repaired.messages.forEach((message: any, index: number) => {
      if (message.role !== "assistant") assert.equal(message.content, original.example.messages[index].content);
    });
  }
  assert.match(f.calls[0].contents, /DATASET TEMPLATE TYPE:\s+Single Turn/);
  assert.match(f.calls[1].contents, /DATASET TEMPLATE TYPE:\s+Multi Turn/);
  assert.ok(f.calls.every(call => /Keep examples practical|No invented statistics/.test(call.contents)
    && call.contents.includes("Use the supplied evidence")));
});

test("a wrong-index repair remains flagged while valid concurrent repairs finish", async () => {
  const f = fixture(2);
  const result = await f.run(items.slice(0, 3));
  assert.equal(result.partial, true);
  assert.equal(result.regeneratedExamples.length, 2);
  assert.equal(result.failures[0].exampleIndex, 2);
  assert.ok(result.regeneratedExamples.every((item: any) => item.exampleIndex !== 2 && item.exampleIndex !== 999));
});

test("QA UI polls, saves before updating score, and leaves unflagged examples untouched", async () => {
  const app = await readFile(new URL("../../sft-studio-pro-2/src/App.tsx", import.meta.url), "utf8");
  const flow = app.slice(app.indexOf("const handleRegenerateFlagged"), app.indexOf("// Deduplicate examples"));
  assert.match(flow, /jobMode: true/);
  assert.match(flow, /regenerate-flagged\/jobs/);
  assert.match(flow, /issuesByIndex\.has\(item\.exampleIndex\)/);
  assert.match(flow, /const newExamples = \[\.\.\.targetBatch.examples\]/);
  assert.match(flow, /generationSettings \|\| project/);
  assert.match(flow, /qualityReport: updatedReport/);
  assert.ok(flow.indexOf("await saveBatch") < flow.indexOf("setReports"));
});