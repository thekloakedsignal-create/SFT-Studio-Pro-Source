import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeBatchRecords, mergeProjectSnapshot, removeBatch, sqlBatchData, visibleBatches
} from "../src/lib/project-batches.ts";

test("merges by ID, replacing stale longer example arrays with newer incremental records", () => {
  const local = [{ id: "same", examples: ["old", "old", "old"] }, { id: "local-only" }];
  const embedded = [{ id: "same", examples: ["embedded"] }, { id: "embedded-only" }];
  const sql = [{ id: "same", examples: ["latest"] }, { id: "sql-only" }];
  const merged = mergeBatchRecords(local, embedded, sql);
  assert.equal(merged.length, 4);
  assert.deepEqual(merged.find(batch => batch.id === "same")?.examples, ["latest"]);
});

test("loads SQL batch data by project ID with row identity overriding embedded payload identity", () => {
  const rows = [
    { id: "a", projectId: "one", name: "A", data: { id: "wrong", examples: [1] } },
    { id: "b", projectId: "two", name: "B", data: { examples: [2] } }
  ];
  const result = sqlBatchData(rows, "one");
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "a");
  assert.deepEqual(result[0].examples, [1]);
});

test("stale full snapshots cannot hide newer SQL increments or resurrect deleted batches", () => {
  const stale = [{ id: "deleted", examples: ["old"] }, { id: "keep", examples: ["old"] }];
  const deleted = removeBatch(stale, "deleted");
  assert.deepEqual(visibleBatches(deleted).map(batch => batch.id), ["keep"]);
  const merged = mergeProjectSnapshot(deleted, stale, [{ id: "keep", examples: ["latest"] }, { id: "new" }]);
  assert.deepEqual(visibleBatches(merged).map(batch => batch.id), ["keep", "new"]);
  assert.deepEqual(visibleBatches(merged)[0].examples, ["latest"]);
  // A deliberate incremental save can recreate the ID, unlike a stale snapshot.
  assert.equal(visibleBatches(mergeBatchRecords(deleted, [{ id: "deleted", examples: ["recreated"] }])).length, 2);
});