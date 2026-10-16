import { trainingPool } from "./training-records.mjs";

const TARGET_UID = "izaaUGzC28eM6FJcisbfKhGrwaF3";
const SOURCE_UID = "0l3DRt7a96NkbBJ736dNKf1mASn1";
const TARGET_EMAIL = "dubsteph47@gmail.com";
const MARKER = "approved-completed-training-consolidation";
// Explicit authorization covers these two runs only, never a provider-wide import.
const RUNS = [
  { id: "ft-35f4c6dc-3816", repo: "RoseG/This-8", model: "Qwen/Qwen3.5-4B", selection: "Qwen3.5 4B Base" },
  { id: "ft-4c42fe31-0008", repo: "RoseG/NG-v1.02", model: "Qwen/Qwen3.5-9B", selection: "Qwen3.5 9 Base" },
];

async function providerGet(route) {
  if (!process.env.TOGETHER_API_KEY) throw new Error("Training provider is not configured.");
  const response = await fetch(`https://api.together.ai/v1${route}`, {
    headers: { Authorization: `Bearer ${process.env.TOGETHER_API_KEY}` },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Training provider lookup failed (${response.status}).`);
  return response.json();
}

async function attached(client) {
  const result = await client.query(
    `SELECT kind, id, data FROM training_records
     WHERE kind IN ('job', 'model') AND id = ANY($1::text[])`,
    [RUNS.map(run => run.id)],
  );
  return RUNS.every(run => {
    const job = result.rows.find(row => row.kind === "job" && row.id === run.id)?.data;
    const model = result.rows.find(row => row.kind === "model" && row.id === run.id)?.data;
    return job?.ownerId === TARGET_UID && job.status === "completed"
      && job.modelId && job.projectId && job.hfRepoName === run.repo
      && model?.ownerId === TARGET_UID && model.jobId === run.id
      && model.hfRepoName === run.repo && model.togetherModelName
      && model.baseTrainingModel === run.selection;
  });
}

export async function reconcileApprovedTraining(user) {
  if (user.uid !== TARGET_UID || user.identityEmail !== TARGET_EMAIL || user.email_verified !== true) {
    return { applicable: false };
  }
  const pool = trainingPool();
  const marker = await pool.query(
    "SELECT id FROM training_records WHERE kind = 'legacy-import' AND id = $1", [MARKER],
  );
  if (marker.rowCount && await attached(pool)) return { complete: true };

  // Only GETs: no upload, job creation, endpoint deployment or chat trial.
  const verifiedJobs = await Promise.all(RUNS.map(async run => {
    const job = await providerGet(`/fine-tunes/${run.id}`);
    if (job.id !== run.id || job.status !== "completed"
      || job.model !== run.model || job.hf_output_repo_name !== run.repo
      || !job.model_object_id || !job.model_output_name
      || !Number.isFinite(Date.parse(job.created_at))) {
      throw new Error(`Approved run ${run.id} did not match its verified completed metadata.`);
    }
    return { run, job };
  }));
  const projectId = (await providerGet("/whoami"))?.project_id;
  if (typeof projectId !== "string" || !projectId) throw new Error("Training project identity is missing.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [MARKER]);
    const rows = await client.query(
      `SELECT kind, id, data FROM training_records
       WHERE (kind IN ('job', 'model') AND id = ANY($1::text[]))
          OR (kind = 'model' AND data->>'jobId' = ANY($1::text[])) FOR UPDATE`,
      [RUNS.map(run => run.id)],
    );
    for (const row of rows.rows) {
      if (![TARGET_UID, SOURCE_UID].includes(row.data.ownerId)) {
        throw new Error("An approved run has unexpected ownership; no records were moved.");
      }
    }
    for (const { run, job } of verifiedJobs) {
      const records = [
        ["job", {
          ownerId: TARGET_UID, status: "completed", trainingModel: run.selection,
          model: job.model, hfRepoName: run.repo, outputName: job.model_output_name,
          modelId: job.model_object_id, projectId: job.project_id || projectId,
          providerCreatedAt: job.created_at, providerUpdatedAt: job.updated_at,
        }],
        ["model", {
          ownerId: TARGET_UID, jobId: run.id, togetherModelName: job.model_output_name,
          hfRepoName: run.repo, baseTrainingModel: run.selection,
          modelId: job.model_object_id, projectId: job.project_id || projectId,
          createdAt: job.updated_at || job.created_at,
        }],
      ];
      for (const [kind, data] of records) {
        await client.query(
          `INSERT INTO training_records (kind, id, data, created_at) VALUES ($1, $2, $3::jsonb, $4)
           ON CONFLICT (kind, id) DO UPDATE SET
             data = training_records.data || EXCLUDED.data,
             created_at = EXCLUDED.created_at, updated_at = now()`,
          [kind, run.id, JSON.stringify(data), job.created_at],
        );
      }
    }
    // Handle any already-saved choices keyed differently, but only for these runs.
    await client.query(
      `UPDATE training_records SET data = data || jsonb_build_object('ownerId', $1::text), updated_at = now()
       WHERE kind = 'model' AND data->>'jobId' = ANY($2::text[])`,
      [TARGET_UID, RUNS.map(run => run.id)],
    );
    if (!await attached(client)) throw new Error("Both jobs and model choices must be attached before completion.");
    await client.query(
      `INSERT INTO training_records (kind, id, data) VALUES ('legacy-import', $1, $2::jsonb)
       ON CONFLICT (kind, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [MARKER, JSON.stringify({ ownerId: TARGET_UID, jobIds: RUNS.map(run => run.id), completedAt: new Date().toISOString() })],
    );
    await client.query("COMMIT");
    return { complete: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
