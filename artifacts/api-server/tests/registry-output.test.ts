import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { transform } from "esbuild";
import { validateRegistryOutput } from "../../sft-studio-pro-2/src/lib/registry-validation.ts";

const messages = [
  { role: "user", content: "A question\nwith a second line" },
  { role: "assistant", content: "An answer with \"quotes\"." }
];
const validRecords: Record<string, unknown> = {
  chatml: { messages },
  openai: { messages },
  deepseek: { messages },
  openai_o1_o3: { messages },
  sharegpt: { conversations: messages.map((m, i) => ({ from: i ? "gpt" : "human", value: m.content })) },
  chatml_token: { text: messages.map(m => `<|im_start|>${m.role}\n${m.content}\n<|im_end|>`).join("\n") },
  alpaca: { instruction: "Question", input: "", output: "Answer" },
  maestro: { system: "", instruction: "Question", input: "", response: "Answer" },
  prompt_response: { prompt: "Question", response: "Answer" }
};

test("final JSONL validation accepts each supported schema without changing records", () => {
  for (const [format, record] of Object.entries(validRecords)) {
    const before = JSON.stringify(record);
    assert.equal(validateRegistryOutput([record], format), null, format);
    assert.equal(JSON.stringify(record), before);
    assert.equal(before.split("\n").length, 1);
  }
});

test("final validation blocks invalid roles, missing prompts, empty output and broken delimiters", () => {
  for (const record of [
    { messages: [messages[1]] },
    { messages: [messages[0], messages[1], messages[1]] },
    { messages: [{ role: "user", content: "" }, messages[1]] },
    { messages: [messages[0], { role: "other", content: "Answer" }] },
    []
  ]) assert.match(validateRegistryOutput([record], "chatml")!, /example 1/);
  assert.ok(validateRegistryOutput([{ instruction: "Question", input: "", output: "" }], "alpaca"));
  assert.ok(validateRegistryOutput([{ text: "<|im_start|>user\nQuestion" }], "chatml_token"));
  assert.ok(validateRegistryOutput([{ messages: [{ role: "system", content: "Rules" }, ...messages] }], "openai_o1_o3"));
  assert.match(validateRegistryOutput([validRecords.chatml, { messages: [] }], "chatml")!, /example 2/);
});

test("registry requires QA, accepts checked batches as-is and prevents selecting unchecked batches", async () => {
  const source = await readFile(new URL("../../sft-studio-pro-2/src/App.tsx", import.meta.url), "utf8");
  const code = (await transform(source.slice(source.indexOf("  // Registry Batch selections"),
    source.indexOf("  useEffect(() => {\n    setExportedPreview", source.indexOf("  // Registry Batch selections")))
    + "\nglobalThis.result = { selectedApprovedBatches, toggleSelectRegistryBatch };", { loader: "ts" })).code;
  const context: any = {
    batches: [
      { id: "unchecked", status: "Approved" },
      { id: "checked", status: "Pending", qualityReport: { issues: [{ message: "Still flagged" }] } },
      { id: "live", status: "Approved" },
      { id: "rejected", status: "Rejected", qualityReport: {} }
    ],
    reports: { live: {} },
    selectedRegistryBatches: {},
    useMemo: (fn: Function) => fn(),
    setSelectedRegistryBatches: (fn: Function) => {
      context.selectedRegistryBatches = fn(context.selectedRegistryBatches);
    }
  };
  vm.runInNewContext(code, context);
  assert.deepEqual(Array.from(context.result.selectedApprovedBatches, (b: any) => b.id), ["checked", "live"]);
  context.result.toggleSelectRegistryBatch("unchecked");
  assert.deepEqual(context.selectedRegistryBatches, {});
  context.result.toggleSelectRegistryBatch("checked");
  assert.equal(context.selectedRegistryBatches.checked, false);
  context.result.toggleSelectRegistryBatch("checked");
  assert.equal(context.selectedRegistryBatches.checked, true);
});
