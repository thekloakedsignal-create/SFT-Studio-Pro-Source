import fs from "node:fs";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { trainingState } from "@workspace/db";
import { db } from "../db/index.ts";

type RecordKind = "runs" | "models" | "trial";

export async function readTrainingRecord<T>(uid: string, kind: RecordKind): Promise<T | null> {
  const [row] = await db.select().from(trainingState)
    .where(and(eq(trainingState.userId, uid), eq(trainingState.kind, kind)));
  return row ? row.data as T : null;
}

// Serialize even the first write, so two requests cannot both reserve a free trial.
export async function updateTrainingRecord<T>(
  uid: string, kind: RecordKind, update: (current: T | null) => T | null,
): Promise<T | null> {
  return db.transaction(async (tx: any) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${uid}), hashtext(${kind}))`);
    const where = and(eq(trainingState.userId, uid), eq(trainingState.kind, kind));
    const [row] = await tx.select().from(trainingState).where(where).for("update");
    const next = update(row ? row.data as T : null);
    if (next === null) {
      await tx.delete(trainingState).where(where);
    } else {
      await tx.insert(trainingState).values({ userId: uid, kind, data: next })
        .onConflictDoUpdate({
          target: [trainingState.userId, trainingState.kind],
          set: { data: next, updatedAt: new Date() },
        });
    }
    return next;
  });
}

export interface OwnerSession {
  preflightAt?: string;
  preflightModel?: string;
  upload?: {
    trainingFileId: string; validationFileId: string;
    trainingCount: number; validationCount: number; at: string;
  };
  estimate?: {
    trainingFileId: string; validationFileId: string; model?: string;
    fromCheckpoint?: string; estimate: unknown; at: string;
  };
}

export interface FinetuneStore {
  sessions: Record<string, OwnerSession>;
  jobOwners: Record<string, string>;
  jobTrainingModels: Record<string, string>;
  jobHfRepos: Record<string, string>;
}

function legacyRuns(uid: string): FinetuneStore {
  const file = path.join(process.cwd(), ".data", "finetune-sessions.json");
  const old = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  // Import only records already owned by this exact account; never claim another user's run.
  const jobs = Object.entries(old.jobOwners || {}).filter(([, owner]) => owner === uid);
  return {
    sessions: old.sessions?.[uid] ? { [uid]: old.sessions[uid] } : {},
    jobOwners: Object.fromEntries(jobs) as Record<string, string>,
    jobTrainingModels: Object.fromEntries(jobs.filter(([id]) => old.jobTrainingModels?.[id])
      .map(([id]) => [id, old.jobTrainingModels[id]])),
    jobHfRepos: Object.fromEntries(jobs.filter(([id]) => old.jobHfRepos?.[id])
      .map(([id]) => [id, old.jobHfRepos[id]])),
  };
}

export async function loadTrainingStore(uid: string): Promise<FinetuneStore> {
  const saved = await readTrainingRecord<FinetuneStore>(uid, "runs");
  if (saved) return saved;
  const legacy = legacyRuns(uid);
  return (await updateTrainingRecord<FinetuneStore>(uid, "runs", current => current || legacy))!;
}

export async function updateTrainingStore(uid: string, update: (store: FinetuneStore) => void) {
  await loadTrainingStore(uid);
  return updateTrainingRecord<FinetuneStore>(uid, "runs", current => {
    if (!current) throw new Error("Training account record is missing.");
    update(current);
    return current;
  });
}

export async function latestOwnedJob(uid: string): Promise<string | null> {
  const store = await loadTrainingStore(uid);
  return Object.entries(store.jobOwners).filter(([, owner]) => owner === uid).at(-1)?.[0] || null;
}
