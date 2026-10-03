import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { transform } from "esbuild";
import { parseGeneratedExamples, sanitizeExample } from "../src/lib/generation-response.ts";

const source = await readFile(new URL("../legacy-server.ts", import.meta.url), "utf8");
const routesSource = source.slice(source.indexOf("// 1.5 Document Analysis"), source.indexOf("// 3. AI Quality Assessment"));
assert.ok(routesSource.includes('app.post("/api/convert-document"'));
const compiled = await transform(routesSource, { loader: "ts", format: "cjs", target: "node24" });

function fixture(output: "valid" | "invalid" | "error" = "valid") {
  const routes = new Map<string, Function>();
  const calls: any[] = [];
  let active = 0;
  let peak = 0;
  vm.runInNewContext(compiled.code, {
    app: { post: (path: string, handler: Function) => routes.set(path, handler) },
    console: { log() {}, error() {}, warn() {} },
    getDigitalOceanClient: () => ({}),
    normalizeModel: (model: string) => model || "fixture-model",
    formatAIErrorMessage: (error: Error) => error.message,
    parseUniversalTranscript: () => { throw new Error("Verbatim extraction must never run"); },
    parseGeneratedExamples, sanitizeExample,
    extractResponseText: (response: any) => response.text,
    setTimeout: (callback: Function) => callback(),
    async callDigitalOceanAI(params: any) {
      calls.push(params);
      peak = Math.max(peak, ++active);
      await Promise.resolve();
      active--;
      if (output === "error") throw new Error("fixture provider failure");
      if (output === "invalid") return { text: '{"examples":[{"messages":[]}]}' };
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

test("all three source types synthesize new examples from ordinary prose", async () => {
  for (const [docType, directive] of [
    ["transcript", "ANALYZE THE DISCUSSION"],
    ["knowledge_base", "KNOWLEDGE DOCUMENT CONVERSION"],
    ["literature", "LITERATURE DOCUMENT CONVERSION"]
  ]) {
    const f = fixture();
    const result = await f.run({ docType, systemPrompt: 'A "helpful" assistant', literatureTheme: "River Journey" });
    assert.equal(result.code, 200);
    assert.equal(result.body.examples.length, 2);
    assert.equal(f.calls.length, 1);
    const prompt = f.calls[0].contents;
    assert.ok(prompt.includes(directive));
    assert.match(prompt, /create NEW training examples from its meaning/);
    assert.match(prompt, /Keep a backup and verify it/);
    assert.equal(result.body.examples[0].messages[0].content, 'A "helpful" assistant');
    if (docType === "literature") assert.match(prompt, /River Journey/);
  }
});

test("labeled transcripts also use synthesis, and analysis no longer counts extracted pairs", async () => {
  const f = fixture();
  const body = { docType: "transcript", documentContent: "User: What next?\nAssistant: Verify the backup." };
  const analysis = await f.run(body, "/api/analyze-document");
  assert.equal(analysis.body.estimatedCount, 4);
  const converted = await f.run(body);
  assert.equal(converted.body.examples.length, 2);
  assert.equal(f.calls.length, 2);
  assert.doesNotMatch(converted.body.examples[0].messages[1].content, /What next/);
});

test("transcript layout, reasoning, Mixed, and instruction formats remain available", async () => {
  const f = fixture();
  const multi = await f.run({ docType: "transcript", transcriptLayout: "multi_turn" });
  assert.equal(multi.body.examples[0].messages.length, 5);
  const reasoning = await f.run({ docType: "transcript", templateType: "Reasoning" });
  assert.equal(reasoning.body.examples[0].messages.length, 2);
  assert.ok(reasoning.body.examples[0].messages[1].reasoning);
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
  assert.equal(f.calls.length, 4);
  assert.equal(f.peak(), 2);
  assert.ok(f.calls.every(call => /Synthesize exactly 2 examples/.test(call.contents)
    && /Focus on backup procedures/.test(call.contents)));
  assert.match(f.calls.at(-1).contents, /examples 7-8 of 8/);
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
  assert.ok(f.peak() <= 2);
});

test("invalid input and provider output fail explicitly without transcript extraction fallback", async () => {
  for (const documentContent of ["", "  ", null, 123]) {
    const f = fixture();
    assert.equal((await f.run({ documentContent })).code, 400);
    assert.equal(f.calls.length, 0);
  }
  for (const output of ["invalid", "error"] as const) {
    const f = fixture(output);
    const result = await f.run({ docType: "transcript", documentContent: "User: Question\nAssistant: Answer" });
    assert.equal(result.code, 500);
    assert.equal(result.body.success, false);
    assert.match(result.body.error, /section 1 could not be converted/);
  }
});