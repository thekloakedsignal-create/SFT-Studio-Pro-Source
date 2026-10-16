import fs from "node:fs";
import path from "node:path";
import { createRecord, getRecord, listRecords, setRecord } from "./training-records.mjs";

// One-time, owner-scoped import of existing job ownership. Files are never
// written or used as a fallback after the import; SQL is the source of truth.
export async function importLegacyTraining(uid: string) {
  if (await getRecord("legacy-import", uid)) return;
  const file = [
    path.join(process.cwd(), ".data", "finetune-sessions.json"),
    path.join(process.cwd(), "artifacts", "api-server", ".data", "finetune-sessions.json"),
  ].find(candidate => fs.existsSync(candidate));
  if (file) {
    const legacy = JSON.parse(fs.readFileSync(file, "utf8"));
    if (legacy.sessions?.[uid]) {
      await createRecord("session", uid, { state: legacy.sessions[uid] });
    }
    for (const [id, owner] of Object.entries(legacy.jobOwners || {})) {
      if (owner !== uid) continue;
      await createRecord("job", id, {
        ownerId: uid, trainingModel: legacy.jobTrainingModels?.[id] || null,
      });
    }
  }
  await createRecord("legacy-import", uid, { importedAt: new Date().toISOString() });
}

export async function ownedTrainingJobs(uid: string) {
  await importLegacyTraining(uid);
  return listRecords("job", uid);
}

export async function rememberJobStatus(uid: string, jobId: string, job: any) {
  const owned = await getRecord("job", jobId);
  if (owned?.ownerId !== uid) throw new Error("Job not found.");
  // Persist only the fields the app needs, never provider credentials or URLs.
  await setRecord("job", jobId, {
    status: String(job?.status || "").trim().toLowerCase(),
    model: job?.model || owned.model || null,
    hfRepoName: job?.hf_output_repo_name || owned.hfRepoName || null,
    outputName: job?.model_output_name || job?.output_name || job?.model_object_name || owned.outputName || null,
    modelId: job?.model_object_id || owned.modelId || null,
    projectId: job?.project_id || job?.projectId || owned.projectId || null,
    providerUpdatedAt: job?.updated_at || null,
  });
}
