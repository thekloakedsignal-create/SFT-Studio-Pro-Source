import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { transform } from "esbuild";
import { auditTemplateFormat } from "../src/lib/quality-format.ts";

const pair = [
  { role: "user", content: "Explain why the sky appears blue." },
  { role: "assistant", content: "Air scatters shorter wavelengths of visible light more strongly." }
];
function types(messages: any[], templateType = "Single Turn", instructTemplate?: string) {
  return auditTemplateFormat([{ messages }], { templateType, instructTemplate }).map(issue => issue.type);
}

test("clean structured messages pass every instruction export format without requiring serialization tokens", () => {
  for (const instructTemplate of [undefined, "Alpaca", "Mistral", "ChatML"]) {
    assert.deepEqual(types(pair, "Single Turn", instructTemplate), []);
    assert.deepEqual(types([...pair, ...pair], "Multi Turn", instructTemplate), []);
    assert.deepEqual(types(pair, "Mixed", instructTemplate), []);
  }
});

test("turn counts, alternation, final assistant and system placement match selected templates", () => {
  assert.ok(types([...pair, ...pair]).includes("Template Turn Count"));
  assert.ok(types(pair, "Multi Turn").includes("Template Turn Count"));
  assert.ok(types([...pair, pair[0]]).includes("Invalid Turn Sequence"));
  assert.ok(types([pair[1], pair[0]]).includes("Invalid Turn Sequence"));
  assert.ok(types([pair[0], { role: "system", content: "Late system" }, pair[1]]).includes("System Message Placement"));
});

test("malformed messages and invalid role/content types are reported without mutation or crashes", () => {
  const examples = [{ messages: [null, { role: 12, content: {} }, "not an object", { role: "tool", content: "output" }] }];
  const before = JSON.stringify(examples);
  const issues = auditTemplateFormat(examples, { templateType: "Single Turn" });
  for (const type of ["Invalid Message Schema", "Invalid Message Role", "Invalid Content Type"]) {
    assert.ok(issues.some(issue => issue.type === type));
  }
  assert.equal(JSON.stringify(examples), before);
});

test("Reasoning accepts stored explanations but requires reasoning before a non-empty final answer", () => {
  assert.deepEqual(types([pair[0], { ...pair[1], reasoning: "A brief explanation." }], "Reasoning"), []);
  assert.deepEqual(types([pair[0], { ...pair[1], content: "<think>Brief explanation.</think>\nFinal answer." }], "Reasoning"), []);
  assert.ok(types(pair, "Reasoning").includes("Missing Reasoning"));
  assert.ok(types([pair[0], { ...pair[1], content: "<think>Explanation.</think>" }], "Reasoning").includes("Missing Final Answer"));
  assert.ok(types([pair[0], { ...pair[1], content: "Answer first.<think>Explanation.</think>" }], "Reasoning").includes("Reasoning Placement"));
  assert.ok(types([pair[0], { ...pair[1], content: "<think><think>Nested.</think></think>Answer." }], "Reasoning").includes("Invalid Reasoning Block"));
  for (const mode of ["Single Turn", "Multi Turn", "Mixed"]) {
    assert.ok(types([pair[0], { ...pair[1], reasoning: "Unwanted trace" }], mode).includes("Unexpected Reasoning"));
  }
  assert.ok(types([{ role: "system", content: "Persona" }, pair[0], { ...pair[1], reasoning: "Explanation" }], "Reasoning").includes("Reasoning Template Anomaly"));
});

test("instruction markers detect mismatches but accept correctly wrapped messages", () => {
  assert.deepEqual(types([{ ...pair[0], content: "Explain the `[INST]` and `<|im_start|>` tokens in a format." }, pair[1]], "Single Turn", "Alpaca"), []);
  assert.deepEqual(types([{ role: "user", content: "[INST] Explain light. [/INST]" }, pair[1]], "Single Turn", "Mistral"), []);
  assert.deepEqual(types([{ role: "user", content: "### Instruction:\nExplain light." }, { role: "assistant", content: "### Response:\nExplanation." }], "Single Turn", "Alpaca"), []);
  assert.deepEqual(types(pair.map(m => ({ ...m, content: `<|im_start|>${m.role}\n${m.content}<|im_end|>` })), "Single Turn", "ChatML"), []);
  assert.ok(types([{ ...pair[0], content: "[INST] Missing closing delimiter" }, pair[1]], "Single Turn", "Mistral").includes("Malformed Mistral Delimiters"));
  assert.ok(types([{ ...pair[0], content: "### Response:\nWrong heading" }, pair[1]], "Single Turn", "Alpaca").includes("Malformed Alpaca Headers"));
  assert.ok(types([{ ...pair[0], content: "<|im_start|>assistant\nWrong role<|im_end|>" }, pair[1]], "Single Turn", "ChatML").includes("Malformed ChatML Delimiters"));
  assert.ok(types([{ ...pair[0], content: "[INST] Question [/INST]" }, pair[1]], "Single Turn", "ChatML").includes("Conflicting Template Markers"));
});

const source = await readFile(new URL("../legacy-server.ts", import.meta.url), "utf8");
const auditSource = source.slice(source.indexOf("// 3. AI Quality Assessment"), source.indexOf("// 3.1 Regenerate"));
const compiled = await transform(auditSource, { loader: "ts", format: "cjs", target: "node24" });

test("QA endpoint merges structural and semantic findings into the same scored report", async () => {
  for (const providerFails of [false, true]) {
    let handler: Function;
    let semanticCalls = 0;
    vm.runInNewContext(compiled.code, {
      app: { post: (_: string, fn: Function) => { handler = fn; } },
      auditTemplateFormat,
      console: { warn() {} },
      getDigitalOceanClient: () => ({}),
      normalizeModel: () => "fixture-model",
      extractResponseText: (value: any) => value.text,
      callDigitalOceanAI: async () => {
        semanticCalls++;
        if (providerFails) throw new Error("fixture unavailable");
        return { text: JSON.stringify({ issues: [{ exampleIndex: 0, severity: "Medium", type: "Factual Error", message: "Fixture semantic finding" }], suggestions: [] }) };
      }
    });
    let result: any;
    await handler!({ body: {
      templateType: "Multi Turn", instructTemplate: "Mistral",
      examples: [{ messages: [{ ...pair[0], content: "[INST] Unclosed prompt" }, { ...pair[1], content: "```js\nunfinished" }] },
        { messages: [null, { role: 42, content: {} }] }]
    } }, { json: (body: any) => { result = body; } });
    assert.equal(semanticCalls, 1);
    assert.equal(result.success, true);
    for (const type of ["Template Turn Count", "Malformed Mistral Delimiters", "Unclosed Code Fence", "Invalid Message Schema"]) {
      assert.ok(result.report.issues.some((issue: any) => issue.type === type), type);
    }
    assert.equal(result.report.issues.some((issue: any) => issue.type === "Factual Error"), !providerFails);
    assert.equal(result.report.stats.flaggedCount, 2);
    assert.ok(result.report.overallScore < 100);
  }
});