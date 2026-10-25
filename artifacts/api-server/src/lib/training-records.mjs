import { Pool } from "pg";

// Use exactly the same database selection as project storage. Shared with the
// standalone cleanup worker so it cannot accidentally read another database.
export function trainingPool() {
  if (!globalThis._postgresPool) {
    if (!process.env.SQL_HOST && !process.env.DATABASE_URL) {
      throw new Error("Project SQL database is not configured.");
    }
    globalThis._postgresPool = new Pool(process.env.SQL_HOST ? {
      host: process.env.SQL_HOST,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 10,
      connectionTimeoutMillis: 30000,
      idleTimeoutMillis: 30000,
      keepAlive: true,
    } : { connectionString: process.env.DATABASE_URL, max: 10 });
  }
  return globalThis._postgresPool;
}

export async function getRecord(kind, id) {
  const result = await trainingPool().query(
    "SELECT data FROM training_records WHERE kind = $1 AND id = $2", [kind, id],
  );
  return result.rows[0]?.data ?? null;
}

export async function listRecords(kind, ownerId) {
  const result = await trainingPool().query(
    `SELECT id, data, created_at AS "createdAt" FROM training_records WHERE kind = $1
     AND ($2::text IS NULL OR data->>'ownerId' = $2)
     ORDER BY created_at, id`,
    [kind, ownerId ?? null],
  );
  return result.rows;
}

export async function setRecord(kind, id, data) {
  await trainingPool().query(
    `INSERT INTO training_records (kind, id, data) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (kind, id) DO UPDATE
     SET data = training_records.data || EXCLUDED.data, updated_at = now()`,
    [kind, id, JSON.stringify(data)],
  );
}

export async function createRecord(kind, id, data) {
  const result = await trainingPool().query(
    `INSERT INTO training_records (kind, id, data) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (kind, id) DO NOTHING RETURNING id`,
    [kind, id, JSON.stringify(data)],
  );
  return result.rowCount === 1;
}

export async function deleteRecord(kind, id) {
  await trainingPool().query("DELETE FROM training_records WHERE kind = $1 AND id = $2", [kind, id]);
}
