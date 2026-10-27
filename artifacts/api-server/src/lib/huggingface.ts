export async function makeHuggingFaceModelPublic(repoName: string): Promise<void> {
  const token = process.env.HF_TOKEN;
  if (!token) throw new Error("Hugging Face access is not configured.");

  const [namespace, repo] = repoName.split("/");
  if (!namespace || !repo || repoName.split("/").length !== 2) {
    throw new Error("Invalid model repository name.");
  }

  const response = await fetch(
    `https://huggingface.co/api/models/${encodeURIComponent(namespace)}/${encodeURIComponent(repo)}/settings`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ private: false }),
      signal: AbortSignal.timeout(15000),
    },
  );

  if (!response.ok) {
    throw new Error(`Could not make the model repository public (HTTP ${response.status}).`);
  }
}
