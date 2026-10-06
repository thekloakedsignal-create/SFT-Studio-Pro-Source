import type { SFTBatch } from "../types";

type RecoveryStorage = Pick<Storage, "setItem" | "removeItem">;
const key = (userId: string, projectId: string, batchId: string) =>
  `sft_batch_backup_${JSON.stringify([userId, projectId, batchId])}`;

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

export function rememberBatch(storage: RecoveryStorage, userId: string, projectId: string, batch: SFTBatch) {
  storage.setItem(key(userId, projectId, batch.id), JSON.stringify(batch));
}

export function forgetBatch(storage: RecoveryStorage, userId: string, projectId: string, batchId: string) {
  storage.removeItem(key(userId, projectId, batchId));
}