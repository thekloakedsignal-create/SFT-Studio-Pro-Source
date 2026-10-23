import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { transform } from "esbuild";
import { sanitizeExample } from "../src/lib/generation-response.ts";
import {
  mergeBatchRecords, mergeProjectSnapshot, removeBatch, sqlBatchData, visibleBatches
} from "../src/lib/project-batches.ts";
import { projectBelongsTo, projectOwnerId } from "../src/lib/project-access.ts";

// Evaluate the real persistence handlers with in-memory SQL/files and captured Express
// registrations. No server, auth initialization, production data, or network is used.
const legacySource = await readFile(new URL("../legacy-server.ts", import.meta.url), "utf8");
const persistenceSource = legacySource.slice(
  legacySource.indexOf("// Local file storage helpers"),
  legacySource.indexOf("// Student / Teacher codes endpoints")
);
const compiled = await transform(persistenceSource, { loader: "ts", format: "cjs", target: "node24" });

type MemoryState = { projects: any[]; batches: any[] };
function fixture(initial: MemoryState, local: any[] = [], sqlEnabled = true) {
  const state = structuredClone(initial);
  const files = new Map<string, string>();
  const projectsFile = "/offline-fixture/.data/projects.json";
  files.set(projectsFile, JSON.stringify(local));
  const routes = new Map<string, Function>();
  const tableProjects = { kind: "projects", id: "id", userId: "userId" };
  const tableBatches = { kind: "batches", id: "id", projectId: "projectId" };
  let failSQL = false;
  let failFiles = false;
  const matches = (row: any, predicate: any): boolean => {
    if (!predicate) return true;
    if (predicate.kind === "and") return predicate.parts.every((part: any) => matches(row, part));
    if (predicate.kind === "in") return predicate.values.includes(row[predicate.column]);
    return row[predicate.column] === predicate.value;
  };
  const tableRows = (table: any) => state[table.kind as keyof MemoryState];
  const db = {
    select() {
      let table: any;
      let predicate: any;
      const query: any = {
        from(value: any) { table = value; return query; },
        where(value: any) { predicate = value; return query; },
        for() { return query; },
        then(resolve: Function, reject: Function) {
          if (failSQL) return Promise.reject(new Error("fixture SQL unavailable")).then(resolve as any, reject as any);
          return Promise.resolve(structuredClone(tableRows(table).filter(row => matches(row, predicate))))
            .then(resolve as any, reject as any);
        }
      };
      return query;
    },
    insert(table: any) {
      return {
        values(record: any) {
          return {
            async onConflictDoUpdate(options: any) {
              if (failSQL) throw new Error("fixture SQL unavailable");
              const rows = tableRows(table);
              const existing = rows.find(row => row.id === record.id);
              if (existing) Object.assign(existing, structuredClone(options.set));
              else rows.push(structuredClone(record));
            }
          };
        }
      };
    },
    update(table: any) {
      return {
        set(data: any) {
          return {
            async where(predicate: any) {
              if (failSQL) throw new Error("fixture SQL unavailable");
              for (const row of tableRows(table).filter(row => matches(row, predicate))) {
                Object.assign(row, structuredClone(data));
              }
            }
          };
        }
      };
    },
    delete(table: any) {
      return {
        async where(predicate: any) {
          if (failSQL) throw new Error("fixture SQL unavailable");
          state[table.kind as keyof MemoryState] = tableRows(table).filter(row => !matches(row, predicate));
        }
      };
    },
    async transaction(callback: Function) {
      if (failSQL) throw new Error("fixture SQL unavailable");
      const before = structuredClone(state);
      try { return await callback(db); } catch (error) {
        Object.assign(state, before);
        throw error;
      }
    }
  };
  const app: any = {
    use() {},
    get(route: string, ...handlers: Function[]) { routes.set(`GET ${route}`, handlers.at(-1)!); },
    post(route: string, ...handlers: Function[]) { routes.set(`POST ${route}`, handlers.at(-1)!); },
    delete(route: string, ...handlers: Function[]) { routes.set(`DELETE ${route}`, handlers.at(-1)!); }
  };
  const express = Object.assign(() => app, { json() {}, urlencoded() {} });
  const context = {
    module: { exports: {} },
    express, path, randomUUID: () => "fixture-uuid", process: { cwd: () => "/offline-fixture" },
    db: sqlEnabled ? db : null,
    projects: tableProjects, batches: tableBatches,
    eq: (column: string, value: any) => ({ kind: "eq", column, value }),
    inArray: (column: string, values: any[]) => ({ kind: "in", column, values }),
    and: (...parts: any[]) => ({ kind: "and", parts }),
    optionalAuth() {},
    logger: { warn() {}, error() {} },
    sanitizeExample, mergeBatchRecords, mergeProjectSnapshot, removeBatch, sqlBatchData, visibleBatches,
    projectBelongsTo, projectOwnerId,
    fs: {
      existsSync: (file: string) => files.has(file),
      mkdirSync() {},
      readFileSync: (file: string) => files.get(file),
      writeFileSync(file: string, value: string) {
        if (failFiles) throw new Error("fixture disk unavailable");
        files.set(file, value);
      },
      renameSync(from: string, to: string) {
        files.set(to, files.get(from)!);
        files.delete(from);
      },
      unlinkSync(file: string) { files.delete(file); }
    }
  };
  vm.runInNewContext(compiled.code, context);
  return {
    state, local: () => JSON.parse(files.get(projectsFile)!),
    failSQL() { failSQL = true; },
    failFiles() { failFiles = true; },
    async request(
      method: string,
      route: string,
      body: any = {},
      params: any = {},
      identity: any = { user: { uid: "owner-a" } }
    ) {
      const response: any = {
        statusCode: 200, body: undefined,
        status(code: number) { this.statusCode = code; return this; },
        json(value: any) { this.body = value; return this; }
      };
      const handler = routes.get(`${method} ${route}`);
      assert.ok(handler, `handler missing: ${method} ${route}`);
      await handler({ body, params, query: {}, ...identity }, response);
      return response;
    }
  };
}

const project = {
  id: "p1", name: "Fixture project", userId: "owner-a", settings: {},
  batches: [{ id: "old", name: "Embedded" }, { id: "shared", examples: ["stale", "longer"] }]
};
const incremental = {
  id: "shared", projectId: "p1", name: "Updated", templateType: "Single Turn",
  data: { id: "shared", examples: ["latest"] }
};

test("list and detail load saved SQL and local batches by project ID", async () => {
  const f = fixture({
    projects: [project],
    batches: [incremental, { id: "new", projectId: "p1", name: "New", data: { id: "new" } },
      { id: "foreign", projectId: "p2", name: "Foreign", data: { id: "foreign" } }]
  }, [{ ...project, batches: [...project.batches, { id: "local-only" }] }]);
  const list = await f.request("GET", "/api/sql/projects");
  const detail = await f.request("GET", "/api/sql/projects/:id", {}, { id: "p1" });
  // The list carries batch summaries only; full examples load from the detail route.
  assert.equal(list.body.projects[0].batches.find((batch: any) => batch.id === "shared").examples, undefined);
  assert.equal(list.body.projects[0].batches.find((batch: any) => batch.id === "shared").examplesCount, 1);
  for (const loaded of [list.body.projects[0], detail.body.project]) {
    assert.equal(loaded.batches.length, 4);
    if (loaded === detail.body.project) assert.deepEqual(loaded.batches.find((batch: any) => batch.id === "shared").examples, ["latest"]);
    assert.equal(loaded.batches.some((batch: any) => batch.id === "foreign"), false);
    assert.equal(loaded.batches.some((batch: any) => batch.id === "local-only"), true);
  }
});

test("stale project saves preserve newer increments; delete removes SQL/embedded/local data and survives a stale save", async () => {
  const f = fixture({ projects: [project], batches: [incremental] }, [project]);
  assert.equal((await f.request("POST", "/api/sql/projects", project)).body.success, true);
  assert.deepEqual(f.state.projects[0].batches.find((batch: any) => batch.id === "shared").examples, ["latest"]);
  const deletion = await f.request("DELETE", "/api/sql/projects/:id/batches/:batchId", {}, { id: "p1", batchId: "shared" });
  assert.equal(deletion.body.success, true);
  assert.equal(f.state.batches.length, 0);
  for (const stored of [f.state.projects[0], f.local()[0]]) {
    assert.equal(stored.batches.some((batch: any) => batch.id === "shared" && batch.examples), false);
  }
  await f.request("POST", "/api/sql/projects", project);
  for (const response of [
    await f.request("GET", "/api/sql/projects"),
    await f.request("GET", "/api/sql/projects/:id", {}, { id: "p1" })
  ]) {
    const loaded = response.body.project || response.body.projects[0];
    assert.equal(loaded.batches.some((batch: any) => batch.id === "shared"), false);
  }
});

test("incremental save is durable and a later stale full snapshot cannot hide it", async () => {
  const f = fixture({ projects: [project], batches: [] }, [project]);
  const save = await f.request("POST", "/api/sql/projects/:id/batches", {
    batch: { id: "new", name: "New", templateType: "Single Turn", examples: [] }
  }, { id: "p1" });
  assert.equal(save.body.success, true);
  assert.equal(f.state.batches[0].projectId, "p1");
  await f.request("POST", "/api/sql/projects", { ...project, batches: [] });
  const detail = await f.request("GET", "/api/sql/projects/:id", {}, { id: "p1" });
  assert.equal(detail.body.project.batches.some((batch: any) => batch.id === "new"), true);
});

test("SQL save failures are explicit HTTP failures and do not write a fake successful local snapshot", async () => {
  const f = fixture({ projects: [project], batches: [] }, [project]);
  f.failSQL();
  for (const [route, body, params] of [
    ["/api/sql/projects", { ...project, name: "Not saved" }, {}],
    ["/api/sql/projects/:id/batches", { batch: { id: "unsaved" } }, { id: "p1" }]
  ] as const) {
    const response = await f.request("POST", route, body, params);
    assert.equal(response.statusCode, 503);
    assert.equal(response.body.success, false);
    assert.match(response.body.error, /not saved/i);
  }
  assert.equal(f.local()[0].name, project.name);
  assert.equal(f.local()[0].batches.some((batch: any) => batch.id === "unsaved"), false);
});

test("local-only save works without SQL; disk failure and missing project are explicit failures", async () => {
  const f = fixture({ projects: [], batches: [] }, [project], false);
  const missing = await f.request("POST", "/api/sql/projects/:id/batches", { batch: { id: "b" } }, { id: "missing" });
  assert.equal(missing.statusCode, 404);
  const saved = await f.request("POST", "/api/sql/projects/:id/batches", { batch: { id: "b" } }, { id: "p1" });
  assert.equal(saved.body.success, true);
  assert.equal(saved.body.storage, "local");
  await f.request("DELETE", "/api/sql/projects/:id/batches/:batchId", {}, { id: "p1", batchId: "b" });
  const detail = await f.request("GET", "/api/sql/projects/:id", {}, { id: "p1" });
  assert.equal(detail.statusCode, 200);
  assert.equal(f.local()[0].batches.some((batch: any) => batch.id === "b" && !batch.__deleted), false);
  f.failFiles();
  const failed = await f.request("POST", "/api/sql/projects/:id/batches", { batch: { id: "failed" } }, { id: "p1" });
  assert.equal(failed.statusCode, 500);
  assert.equal(failed.body.success, false);
});

test("project list is scoped to the authenticated owner and never falls back to other users", async () => {
  const other = { ...project, id: "p2", userId: "owner-b", name: "Private to B" };
  const legacy = { ...project, id: "legacy", userId: "default" };
  const f = fixture({ projects: [project, other, legacy], batches: [] }, [project, other, legacy]);
  const own = await f.request("GET", "/api/sql/projects");
  const emptyOwner = await f.request("GET", "/api/sql/projects", {}, {}, { user: { uid: "owner-c" } });
  const guest = await f.request("GET", "/api/sql/projects", {}, {}, { deviceId: "device-private" });
  const missingIdentity = await f.request("GET", "/api/sql/projects", {}, {}, {});

  assert.deepEqual(own.body.projects.map((item: any) => item.id), ["p1"]);
  assert.deepEqual(emptyOwner.body.projects, []);
  assert.deepEqual(guest.body.projects, []);
  assert.equal(missingIdentity.statusCode, 401);
});

test("another owner cannot read, overwrite, mutate batches, or delete a project", async () => {
  const other = { ...project, id: "p2", userId: "owner-b" };
  const f = fixture({ projects: [project, other], batches: [] }, [project, other]);
  const asA = { user: { uid: "owner-a" } };
  const asB = { user: { uid: "owner-b" } };

  assert.equal((await f.request("GET", "/api/sql/projects/:id", {}, { id: "p2" }, asA)).statusCode, 404);
  assert.equal((await f.request("POST", "/api/sql/projects", {
    ...other, userId: "owner-a", name: "Hijacked"
  }, {}, asA)).statusCode, 404);
  assert.equal((await f.request("POST", "/api/sql/projects/:id/batches", {
    batch: { id: "attack-batch", name: "No" }
  }, { id: "p2" }, asA)).statusCode, 404);
  assert.equal((await f.request("DELETE", "/api/sql/projects/:id/batches/:batchId", {},
    { id: "p2", batchId: "anything" }, asA)).statusCode, 404);
  assert.equal((await f.request("DELETE", "/api/sql/projects/:id", {}, { id: "p2" }, asA)).statusCode, 404);
  assert.equal(f.state.projects.find(item => item.id === "p2").name, other.name);

  assert.equal((await f.request("GET", "/api/sql/projects/:id", {}, { id: "p2" }, asB)).body.project.id, "p2");
  const saved = await f.request("POST", "/api/sql/projects", {
    ...project, id: "new", userId: "owner-b"
  }, {}, asB);
  assert.equal(saved.body.success, true);
  assert.equal(f.state.projects.find(item => item.id === "new").userId, "owner-b");
});

test("guest device identity is required and cannot be replaced with a body owner ID", async () => {
  const f = fixture({ projects: [], batches: [] });
  const guestA = { deviceId: "device-private-a" };
  const guestB = { deviceId: "device-private-b" };
  const created = await f.request("POST", "/api/sql/projects", {
    id: "guest-project", name: "Guest", userId: "device-private-b", settings: {}, batches: []
  }, {}, guestA);
  assert.equal(created.body.success, true);
  assert.equal(f.state.projects[0].userId, "device-private-a");
  assert.equal((await f.request("GET", "/api/sql/projects/:id", {}, { id: "guest-project" }, guestB)).statusCode, 404);
  assert.equal((await f.request("GET", "/api/sql/projects", {}, {}, {})).statusCode, 401);
});

test("project ownership helpers reject missing and reserved default identities", () => {
  assert.equal(projectOwnerId({}), null);
  assert.equal(projectOwnerId({ deviceId: "default" }), null);
  assert.equal(projectOwnerId({ user: { uid: "user-a" }, deviceId: "device-a" }), "user-a");
  assert.equal(projectBelongsTo(project, "owner-a"), true);
  assert.equal(projectBelongsTo(project, "owner-b"), false);
});

test("project saves do not import local-only batches and still write a local backup", async () => {
  const f = fixture({ projects: [project], batches: [] }, [
    { ...project, batches: [{ id: "local-only", examples: ["must not return"] }] }
  ]);
  const saved = await f.request("POST", "/api/sql/projects", { ...project, name: "Saved", batches: [] });
  assert.equal(saved.body.success, true);
  assert.equal(f.state.projects[0].batches.some((batch: any) => batch.id === "local-only"), false);
  assert.equal(f.local()[0].name, "Saved");
  assert.deepEqual(f.local()[0].batches, f.state.projects[0].batches);
});
