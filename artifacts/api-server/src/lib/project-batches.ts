type BatchRecord = Record<string, any>;

/** Later sources replace records by ID; example array length is never freshness. */
export function mergeBatchRecords(...sources: unknown[]): BatchRecord[] {
  const byId = new Map<string, BatchRecord>();
  for (const source of sources) {
    if (!Array.isArray(source)) continue;
    for (const batch of source) {
      if (batch && typeof batch === "object" && typeof batch.id === "string" && batch.id) {
        byId.set(batch.id, batch);
      }
    }
  }
  return [...byId.values()];
}

/** Existing tombstones override stale incoming snapshots, without a schema migration. */
export function mergeProjectSnapshot(existing: unknown, incoming: unknown, incremental: unknown = []): BatchRecord[] {
  const deleted = Array.isArray(existing) ? existing.filter(batch => batch?.__deleted === true) : [];
  return mergeBatchRecords(existing, incoming, deleted, incremental);
}

export function visibleBatches(records: unknown): BatchRecord[] {
  return mergeBatchRecords(records).filter(batch => batch.__deleted !== true);
}

export function removeBatch(records: unknown, batchId: string): BatchRecord[] {
  return mergeBatchRecords(records, [{ id: batchId, __deleted: true }]);
}

/** SQL rows are scoped by project ID even when a caller supplies rows for several projects. */
export function sqlBatchData(rows: any[], projectId: string): BatchRecord[] {
  return rows.filter(row => row.projectId === projectId && row.data && typeof row.data === "object")
    .map(row => ({
      ...row.data,
      id: row.id,
      name: row.name,
      timestamp: row.timestamp,
      templateType: row.templateType
    }));
}