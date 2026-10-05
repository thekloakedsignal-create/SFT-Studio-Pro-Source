import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { transform } from "esbuild";
import { parseGeneratedExamples, sanitizeExample } from "../src/lib/generation-response.ts";

const source = await readFile(new URL("../legacy-server.ts", import.meta.url), "utf8");
const routesSource = source.slice(source.indexOf("// Universal Transcript Cleaning"), source.indexOf("// 3. AI Quality Assessment"));
assert.ok(routesSource.includes('app.post("/api/convert-document"'));
const compiled = await transform(routesSource, { loader: "ts", format: "cjs", target: "node24" });

function fixture(output: "valid" | "invalid" | "error" | "partial" | "unfinished" = "valid") {
  const routes = new Map<string, Function>();
  const calls: any[] = [];
  let active = 0;
  let peak = 0;
  vm.runInNewContext(compiled.code, {
    app: { post: (path: string, ...handlers: Function[]) => routes.set(path, handlers.at(-1)!),
      get: (path: string, ...handlers: Function[]) => routes.set(path, handlers.at(-1)!) },
    optionalAuth: () => {},
    projectOwnerId: (req: any) => req.deviceId || null,
    randomUUID: () => "conversion-test-job",
    console: { log() {}, error() {}, warn() {} },
    getDigitalOceanClient: () => ({}),
    normalizeModel: (model: string) => model || "fixture-model",
    formatAIErrorMessage: (error: Error) => error.message,
    parseGeneratedExamples, sanitizeExample,
    extractResponseText: (response: any) => response.text,
    setTimeout: (callback: Function) => callback(),
    async callDigitalOceanAI(params: any) {
      calls.push(params);
      const callIndex = calls.length;
      peak = Math.max(peak, ++active);
      await Promise.resolve();
      active--;
      if (output === "error" && callIndex === 1) throw new Error("fixture provider failure");
      if (output === "partial" && callIndex === 2) throw new Error("fixture truncated response");
      if (output === "invalid" && callIndex === 1) return { text: '{"examples":[{"messages":[]}]}' };
      if (output === "unfinished" && callIndex === 1) return { text: JSON.stringify({ examples: [{ messages: [
        { role: "user", content: "Question" }, { role: "assistant", content: "Answer" },
        { role: "user", content: "Unanswered follow-up" }
      ] }] }) };
      if (params.contents.includes("architectural analysis")) return { text: JSON.stringify({
        estimatedCount: 4, recommendedDocType: "transcript", titleOrTheme: "Storage migration",
        explanation: "Four substantive topics in the discussion."
      }) };
      const count = Number(params.contents.match(/Synthesize exactly (\d+) examples/)?.[1]);
      const reasoning = params.contents.includes('Conversation Mode/Format: "reasoning"');
      const multi = params.contents.includes('Conversation Mode/Format: "multi_turn"');
      return { text: JSON.stringify({ examples: Array.from({ length: count }, (_, index) => ({
        messages: [
          { role: "user", content: `What is the source's point ${index + 1}?` },
          { role: "assistant", content: "An answer synthesized from the source.", ...(reasoning ? { reasoning: "A brief source-grounded explanation." } : {}) },
          ...(multi ? [
            { role: "user", content: "What follows from that?" },
            { role: "assistant", content: "A source-grounded follow-up." }
          ] : [])
        ]
      })) }) };
    }
  });
  return {
    calls, peak: () => peak,
    async start(body: any) {
      const response: any = { code: 200, status(code: number) { this.code = code; return this; },
        json(body: any) { this.body = body; return this; } };
      const done = routes.get("/api/convert-document")!({ deviceId: "test-owner", body: {
        documentContent: "Keep a backup and verify it.", count: 4, async: true, ...body
      } }, response);
      return { response, done };
    },
    poll(owner = "test-owner") {
      const response: any = { code: 200, status(code: number) { this.code = code; return this; },
        json(body: any) { this.body = body; return this; } };
      routes.get("/api/convert-document/jobs/:jobId")!({ deviceId: owner, params: { jobId: "conversion-test-job" } }, response);
      return response;
    },
    async run(body: any, path = "/api/convert-document") {
      const response: any = {
        code: 200,
        status(code: number) { this.code = code; return this; },
        json(body: any) { this.body = body; return this; }
      };
      await routes.get(path)!({ body: {
        documentContent: "The team discussed storage migration. Keep a backup and verify it before switching systems.",
        count: 2, ...body
      } }, response);
      return response;
    }
  };
}

test("knowledge and literature synthesize new examples from ordinary prose", async () => {
  for (const [docType, directive] of [
    ["knowledge_base", "KNOWLEDGE DOCUMENT CONVERSION"],
    ["literature", "LITERATURE DOCUMENT CONVERSION"]
  ]) {
    const f = fixture();
    const result = await f.run({ docType, systemPrompt: 'A "helpful" assistant', literatureTheme: "River Journey" });
    assert.equal(result.code, 200);
    assert.equal(result.body.examples.length, 2);
    assert.equal(f.calls.length, 2);
    const prompt = f.calls[0].contents;
    assert.ok(prompt.includes(directive));
    assert.match(prompt, /create NEW training examples from its meaning/);
    assert.match(prompt, /Keep a backup and verify it/);
    assert.equal(result.body.examples[0].messages[0].content, 'A "helpful" assistant');
    if (docType === "literature") assert.match(prompt, /River Journey/);
  }
});

test("transcripts copy tagged dialogue without provider calls and survive sanitization", async () => {
  const f = fixture();
  const body = { docType: "transcript", userTag: "Alice", assistantTag: "Bob", count: 1,
    documentContent: "Meeting date: Monday\n[00:01] Alice: What next at 12:30?\n[00:02] Bob: Answer: Keep  two spaces.\nAlice: Again?\nBob: Yes." };
  const converted = await f.run(body);
  assert.equal(converted.body.examples.length, 2);
  assert.equal(f.calls.length, 0);
  assert.equal(converted.body.examples[0].messages[0].content, "What next at 12:30?");
  assert.equal(sanitizeExample(converted.body.examples[0]).messages[1].content, "Answer: Keep  two spaces.");
  const multi = await f.run({ ...body, async: true, transcriptLayout: "multi_turn" });
  assert.equal(multi.code, 200);
  assert.equal(multi.body.examples[0].messages.length, 4);
  assert.equal((await f.run({ ...body, documentContent: "No tagged dialogue." })).code, 400);
});

test("transcript layout, Mixed, and instruction formats work; converter rejects Reasoning", async () => {
  const f = fixture();
  const multi = await f.run({ docType: "transcript", transcriptLayout: "multi_turn",
    documentContent: "User: Q?\nAssistant: A.\nUser: More?\nAssistant: Yes." });
  assert.equal(multi.body.examples[0].messages.length, 4);
  const reasoning = await f.run({ docType: "transcript", templateType: "Reasoning" });
  assert.equal(reasoning.code, 400);
  assert.match(reasoning.body.error, /Reasoning is not available/);
  const mixed = await f.run({ docType: "knowledge_base", templateType: "Mixed" });
  assert.ok(mixed.body.examples.every((e: any) => e.messages.every((m: any) => !m.reasoning)));
  assert.match(f.calls.at(-1).contents, /single-turn and multi-turn examples only/);
  for (const instructTemplate of ["Alpaca", "Mistral", "ChatML"]) {
    const result = await f.run({ docType: "literature", instructTemplate });
    const user = result.body.examples[0].messages[1].content;
    if (instructTemplate === "Alpaca") assert.match(user, /^### Instruction:/);
    if (instructTemplate === "Mistral") assert.match(user, /^\[INST\]/);
  }
});

test("large requested counts use bounded small groups with custom instructions retained", async () => {
  const f = fixture();
  const result = await f.run({ docType: "knowledge_base", count: 8, converterInstructions: "Focus on backup procedures." });
  assert.equal(result.body.examples.length, 8);
  assert.equal(f.calls.length, 8);
  assert.equal(f.peak(), 5);
  assert.ok(f.calls.every(call => call.timeoutMs === 180_000));
  assert.ok(f.calls.every(call => /Synthesize exactly 1 examples/.test(call.contents)
    && /Focus on backup procedures/.test(call.contents)));
  assert.match(f.calls.at(-1).contents, /examples 8-8 of 8/);
});

test("failed requests retry missing examples without discarding successes", async () => {
  const f = fixture("partial");
  const result = await f.run({ count: 4 });
  assert.equal(result.code, 200);
  assert.equal(result.body.examples.length, 4);
  assert.equal(result.body.partial, false);
  assert.equal(result.body.requestedCount, 4);
  assert.equal(f.calls.length, 5);
});

test("background progress reports completed examples, not attempted requests", async () => {
  const f = fixture("partial");
  const { done } = await f.start({ count: 4, docType: "knowledge_base" });
  await done;
  const status = f.poll().body;
  assert.equal(status.completed, 4);
  assert.equal(status.total, 4);
  assert.equal(status.result.examples.length, 4);
});

test("unfinished conversations are retried instead of counted as completed", async () => {
  const f = fixture("unfinished");
  const result = await f.run({ templateType: "Multi Turn" });
  assert.equal(result.code, 200);
  assert.equal(result.body.examples.length, 2);
  assert.equal(f.calls.length, 3);
});

test("background conversion acknowledges before completion and exposes owner-scoped results", async () => {
  const f = fixture();
  const { response, done } = await f.start({});
  assert.equal(response.code, 202);
  assert.equal(response.body.status, "running");
  assert.equal(f.poll("another-owner").code, 404);
  await done;
  const status = f.poll();
  assert.equal(status.body.status, "complete");
  assert.equal(status.body.result.examples.length, 4);
  assert.equal(status.body.completed, 4);
});

test("background errors and retry-recovered results are retrievable", async () => {
  for (const output of ["error", "partial"] as const) {
    const f = fixture(output);
    const { done } = await f.start({});
    await done;
    const status = f.poll().body;
    assert.equal(status.status, "complete");
    assert.equal(status.result.success, true);
    assert.equal(status.result.examples.length, 4);
    assert.equal(status.result.partial, false);
  }
});

test("converter UI excludes Reasoning and retains partial results for review", async () => {
  const app = await readFile(new URL("../../sft-studio-pro-2/src/App.tsx", import.meta.url), "utf8");
  const options = app.slice(app.indexOf("Dataset Turn Mode & Layout:"), app.indexOf("AI Document Analysis & Example Count Estimation Readout"));
  assert.doesNotMatch(options, /TemplateType\.REASONING/);
  for (const mode of ["SINGLE_TURN", "MULTI_TURN", "MIXED"]) assert.ok(options.includes(`TemplateType.${mode}`));
  assert.ok(app.includes("setLatestConvertedDocBatchId(newBatch.id)"));
  assert.ok(app.includes("partial: Boolean(data.partial)"));
  assert.ok(app.includes("latestDocBatch.partial"));
});

test("converter UI displays live progress for Knowledge and Literature", async () => {
  const app = await readFile(new URL("../../sft-studio-pro-2/src/App.tsx", import.meta.url), "utf8");
  assert.ok(app.includes('role="progressbar"'));
  assert.ok(app.includes("status.completed"));
  assert.ok(app.includes('docType === "knowledge_base" || docType === "literature"'));
});

test("long documents analyze every section, including sections formerly skipped", async () => {
  const f = fixture();
  const result = await f.run({
    count: 8,
    documentContent: Array.from({ length: 6 }, (_, index) => `SECTION_${index} ` + "source material ".repeat(1400)).join("\n\n")
  });
  assert.equal(result.code, 200);
  for (let index = 0; index < 6; index++) {
    assert.ok(f.calls.some(call => call.contents.includes(`SECTION_${index} `)));
  }
  assert.equal(result.body.examples.length, 8);
  assert.equal(f.calls.length, 8);
  assert.equal(f.peak(), 5);
});

test("invalid input fails explicitly and malformed generated examples are retried", async () => {
  for (const documentContent of ["", "  ", null, 123]) {
    const f = fixture();
    assert.equal((await f.run({ documentContent })).code, 400);
    assert.equal(f.calls.length, 0);
  }
  const f = fixture("invalid");
  const result = await f.run({ docType: "knowledge_base", documentContent: "User: Question\nAssistant: Answer" });
  assert.equal(result.code, 200);
  assert.equal(result.body.examples.length, 2);
  assert.equal(f.calls.length, 3);
});