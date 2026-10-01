import type { SFTBatch } from "../types";

type RecoveryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type PendingBatches = Record<string, SFTBatch[]>;
const key = (userId: string) => `sft_pending_batches_${userId}`;

/** Unsaved/recent work must remain visible even when legacy timestamps tie. */
export function orderBatchesForReview(batches: SFTBatch[], preferredIds: string[] = []): SFTBatch[] {
  const rank = (id: string) => {
    const index = preferredIds.indexOf(id);
    return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
  };
  const idTime = (id: string) => Number(/^batch-(\d+)/.exec(id)?.[1] || 0);
  return [...batches].sort((a, b) => rank(a.id) - rank(b.id)
    || (b.timestamp || "").localeCompare(a.timestamp || "")
    || idTime(b.id) - idTime(a.id));
}

function read(storage: RecoveryStorage, userId: string): PendingBatches {
  const value = JSON.parse(storage.getItem(key(userId)) || "{}");
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function pendingBatches(storage: RecoveryStorage, userId: string, projectId: string): SFTBatch[] {
  const value = read(storage, userId)[projectId];
  return Array.isArray(value) ? value : [];
}

export function rememberBatch(storage: RecoveryStorage, userId: string, projectId: string, batch: SFTBatch) {
  const value = read(storage, userId);
  const existing = Array.isArray(value[projectId]) ? value[projectId] : [];
  value[projectId] = [batch, ...existing.filter(item => item.id !== batch.id)];
  storage.setItem(key(userId), JSON.stringify(value));
}

export function forgetBatch(storage: RecoveryStorage, userId: string, projectId: string, batchId: string) {
  const value = read(storage, userId);
  value[projectId] = (Array.isArray(value[projectId]) ? value[projectId] : []).filter(item => item.id !== batchId);
  if (!value[projectId].length) delete value[projectId];
  if (Object.keys(value).length) storage.setItem(key(userId), JSON.stringify(value));
  else storage.removeItem(key(userId));
}