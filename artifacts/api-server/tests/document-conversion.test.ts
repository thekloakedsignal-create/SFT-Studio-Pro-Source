import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { transform } from "esbuild";
import { PDFDocument } from "pdf-lib";
import { PDFParse } from "pdf-parse";
import { parseGeneratedExamples, sanitizeExample } from "../src/lib/generation-response.ts";

const source = await readFile(new URL("../legacy-server.ts", import.meta.url), "utf8");
const routesSource = source.slice(source.indexOf("// Universal Transcript Cleaning"), source.indexOf("// 3. AI Quality Assessment"));
assert.ok(routesSource.includes('app.post("/api/convert-document"'));
const compiled = await transform(routesSource, { loader: "ts", format: "cjs", target: "node24" });

function fixture(output: "valid" | "invalid" | "error" | "partial" | "persistentPartial" | "unfinished" = "valid") {
  const routes = new Map<string, Function>();
  const calls: any[] = [];
  let active = 0;
  let peak = 0;
  vm.runInNewContext(compiled.code, {
    PDFParse, Buffer,
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
      if (output === "error") throw new Error("fixture provider failure");
      if (Array.isArray(params.contents)) return { text: '{"coverage":["Backup procedures","Verification requirements"]}' };
      if (output === "partial" && callIndex === 3) throw new Error("fixture truncated response");
      if (output === "persistentPartial" && params.contents.includes("Coverage assignment: examples 3-4 ")) {
        throw new Error("fixture persistent failure");
      }
      if (output === "invalid") return { text: '{"examples":[{"messages":[]}]}' };
      if (output === "unfinished") return { text: JSON.stringify({ examples: [{ messages: [
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
    const prompt = f.calls[1].contents;
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
  const result = await f.run({ docType: "knowledge_base", count: 50, converterInstructions: "Focus on backup procedures." });
  assert.equal(result.body.examples.length, 50);
  assert.equal(f.calls.length, 26);
  assert.equal(f.peak(), 5);
  assert.ok(f.calls.every(call => call.model === "llama-4-maverick" && call.timeoutMs === 600_000));
  assert.ok(f.calls.slice(1).every(call => /Synthesize exactly 2 examples/.test(call.contents)
    && /Focus on backup procedures/.test(call.contents)));
  assert.match(f.calls.at(-1).contents, /examples 49-50 of 50/);
  assert.equal(f.calls.filter(call => Array.isArray(call.contents)).length, 1);
  assert.match(f.calls[2].contents, /What is the source's point/);
});

test("Maverick reads original images once before sequential synthesis", async () => {
  const f = fixture();
  const { response, done } = await f.start({
    documentContent: "", count: 5,
    documentSource: { data: "data:image/png;base64,aW1hZ2U=", mimeType: "image/png" }
  });
  assert.equal(response.code, 202);
  assert.equal(f.poll().body.phase, "reading");
  await done;
  assert.equal(f.poll().body.completed, 5);
  assert.equal(f.calls.length, 4);
  assert.equal(f.calls.at(-1).model, "deepseek-4-flash");
  assert.equal(f.calls.at(-1).config.systemInstruction, f.calls[2].config.systemInstruction);
  assert.equal(f.calls[0].contents[0].inlineData.data, "aW1hZ2U=");
  assert.equal(f.calls[0].contents[0].inlineData.mimeType, "image/png");
  assert.equal(f.calls[0].config.systemInstruction, f.calls[1].config.systemInstruction);
  assert.ok(f.calls.slice(1).every(call => call.contents.includes("[DOCUMENT COVERAGE INDEX]")));
});

test("PDF originals send every rendered page to the single Maverick reading", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage([200, 200]).drawText("First page");
  pdf.addPage([200, 200]).drawText("Second page");
  const f = fixture();
  const result = await f.run({
    documentSource: { data: Buffer.from(await pdf.save()).toString("base64"), mimeType: "application/pdf" }
  });
  assert.equal(result.code, 200);
  const pages = f.calls[0].contents.filter((part: any) => part.inlineData);
  assert.equal(pages.length, 2);
  assert.ok(pages.every((part: any) => part.inlineData.data.startsWith("data:image/png;base64,")));
});

test("failed converter requests are retried individually without repeating successful requests", async () => {
  const f = fixture("partial");
  const result = await f.run({ count: 4 });
  assert.equal(result.code, 200);
  assert.equal(result.body.examples.length, 4);
  assert.equal(result.body.partial, false);
  assert.equal(f.calls.length, 4);
  assert.equal(f.calls.filter(call => typeof call.contents === "string" && call.contents.includes("Coverage assignment: examples 3-4 ")).length, 2);
  assert.equal(f.peak(), 4);
});

test("persistent failures stop after three attempts and preserve completed examples", async () => {
  const f = fixture("persistentPartial");
  const result = await f.run({ count: 4 });
  assert.equal(result.code, 200);
  assert.equal(result.body.examples.length, 2);
  assert.equal(result.body.partial, true);
  assert.equal(result.body.requestedCount, 4);
  assert.equal(f.calls.length, 5);
  assert.deepEqual(f.calls.slice(-3).map(call => call.model), ["llama-4-maverick", "deepseek-4-flash", "glm-5.3"]);
});

test("unfinished conversations are not returned as completed examples", async () => {
  const result = await fixture("unfinished").run({ templateType: "Multi Turn" });
  assert.equal(result.code, 500);
  assert.equal(result.body.success, false);
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

test("background errors and partial results are retrievable", async () => {
  for (const output of ["error", "persistentPartial"] as const) {
    const f = fixture(output);
    const { done } = await f.start({});
    await done;
    const status = f.poll().body;
    assert.equal(status.status, output === "error" ? "error" : "complete");
    assert.equal(status.result.success, output !== "error");
    if (output === "persistentPartial") assert.equal(status.result.examples.length, 2);
    assert.equal(status.completed, output === "error" ? 0 : 2);
  }
});

test("converter UI excludes Reasoning and retains partial results for review", async () => {
  const app = await readFile(new URL("../../sft-studio-pro-2/src/App.tsx", import.meta.url), "utf8");
  const options = app.slice(app.indexOf("Dataset Turn Mode & Layout:"), app.indexOf("AI Document Analysis & Example Count Estimation Readout"));
  assert.doesNotMatch(options, /TemplateType\.REASONING/);
  for (const mode of ["SINGLE_TURN", "MULTI_TURN"]) assert.ok(options.includes(`TemplateType.${mode}`));
  assert.ok(app.includes("setLatestConvertedDocBatchId(newBatch.id)"));
  assert.ok(app.includes("partial: Boolean(data.partial)"));
  assert.ok(app.includes("latestDocBatch.partial"));
});

test("long documents analyze every section, including sections formerly skipped", async () => {
  const f = fixture();
  const result = await f.run({
    count: 8,
    documentContent: Array.from({ length: 6 }, (_, index) => `SECTION_${index} ` + "source material ".repeat(1400)).join("\n\n")
  });
  assert.equal(result.code, 200);
  for (let index = 0; index < 6; index++) {
    assert.ok(f.calls.some(call => typeof call.contents === "string" && call.contents.includes(`SECTION_${index} `)));
  }
  assert.equal(result.body.examples.length, 8);
  assert.equal(f.peak(), 5);
});

test("invalid input and provider output fail explicitly without transcript extraction fallback", async () => {
  for (const documentContent of ["", "  ", null, 123]) {
    const f = fixture();
    assert.equal((await f.run({ documentContent })).code, 400);
    assert.equal(f.calls.length, 0);
  }
  for (const output of ["invalid", "error"] as const) {
    const f = fixture(output);
    const result = await f.run({ docType: "knowledge_base", documentContent: "User: Question\nAssistant: Answer" });
    assert.equal(result.code, 500);
    assert.equal(result.body.success, false);
    assert.match(result.body.error, /section 1 could not be converted/);
  }
});