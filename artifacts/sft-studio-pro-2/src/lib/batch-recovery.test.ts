import assert from "node:assert/strict";
import { test } from "node:test";
import type { SFTBatch } from "../types";
import { pendingBatches, rememberBatch, forgetBatch, orderBatchesForReview } from "./batch-recovery";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); }
  };
}
const batch = (id: string, content = "answer") => ({
  id, examples: [{ messages: [{ role: "user", content: "question" }, { role: "assistant", content }] }]
}) as SFTBatch;

test("unsaved generated examples survive reading from storage again", () => {
  const cache = storage();
  rememberBatch(cache, "user", "project", batch("one"));
  assert.deepEqual(pendingBatches(cache, "user", "project"), [batch("one")]);
});

test("recovery is scoped to project and user", () => {
  const cache = storage();
  rememberBatch(cache, "user", "first", batch("one"));
  assert.deepEqual(pendingBatches(cache, "user", "second"), []);
  assert.deepEqual(pendingBatches(cache, "other-user", "first"), []);
});

test("newer edits replace older pending copies without duplication", () => {
  const cache = storage();
  rememberBatch(cache, "user", "project", batch("one"));
  rememberBatch(cache, "user", "project", batch("one", "edited"));
  assert.deepEqual(pendingBatches(cache, "user", "project"), [batch("one", "edited")]);
});

test("confirming or deleting one batch retains other unsaved work", () => {
  const cache = storage();
  rememberBatch(cache, "user", "project", batch("one"));
  rememberBatch(cache, "user", "project", batch("two"));
  forgetBatch(cache, "user", "project", "one");
  assert.deepEqual(pendingBatches(cache, "user", "project"), [batch("two")]);
  forgetBatch(cache, "user", "project", "two");
  assert.deepEqual(pendingBatches(cache, "user", "project"), []);
});

test("recovered batch opens ahead of older server batch when timestamps tie", () => {
  const saved = { ...batch("saved"), timestamp: "2026-10-01 12:00" };
  const recovered = { ...batch("recovered"), timestamp: saved.timestamp };
  assert.deepEqual(orderBatchesForReview([saved, recovered], ["recovered"]), [recovered, saved]);
});

test("legacy minute timestamps use generated batch identity to break ties", () => {
  const old = { ...batch("batch-100-old"), timestamp: "2026-10-01 12:00" };
  const recent = { ...batch("batch-200-new"), timestamp: old.timestamp };
  assert.deepEqual(orderBatchesForReview([old, recent]), [recent, old]);
});