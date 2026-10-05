import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const app = await readFile(new URL("../../sft-studio-pro-2/src/App.tsx", import.meta.url), "utf8");
const start = app.indexOf("// Sign-in starts an unsaved");
const end = app.indexOf("        } else {\n          // Load projects from Postgres", start);
assert.ok(start >= 0 && end > start);
const initialization = app.slice(start, end);

for (const existingProjects of [[], [{ id: "saved-project", batches: [{ id: "saved-batch" }] }]]) {
  test(`sign-in opens an unlocked draft with ${existingProjects.length} saved projects`, async () => {
    const state: Record<string, any> = {};
    const setters = Object.fromEntries(
      Array.from(initialization.matchAll(/\b(set\w+|initSelectedRegistryBatches)\(/g), match => [
        match[1], (value: any) => { state[match[1]] = value; }
      ])
    );
    const preset = {
      name: "General", systemPrompt: "Default", targetTask: "Default task", constraints: "",
      examples: [], batchDesc: "", batchInstructions: "", batchTempConstraints: ""
    };
    let loaded = false;
    await vm.runInNewContext(`(async () => { ${initialization} })()`, {
      ...setters,
      user: { uid: "test-user", displayName: "Test" },
      projectLoadVersion: { current: 0 },
      PROJECT_PRESETS: { general: preset },
      PresetType: { GENERAL_USE: "general" },
      ProjectFormat: { CONVERSATION: "conversation" },
      TemplateType: { SINGLE_TURN: "Single Turn" },
      InstructTemplate: { CHATML: "chatml" },
      localStorage: { getItem: () => null },
      loadUserProfile: async () => {},
      loadUserProjects: async () => { loaded = true; return existingProjects; },
    });
    assert.equal(loaded, true);
    assert.equal(state.setSelectedProjectId, null);
    assert.equal(state.setIsFieldsUnlocked, true);
    assert.equal(state.setActiveTab, "define");
    assert.equal(state.setProject.name, preset.name);
    assert.equal(state.setBatches.length, 0);
    assert.equal(Object.keys(state.setReports).length, 0);
    assert.equal(state.setSelectedBatchId, "");
  });
}