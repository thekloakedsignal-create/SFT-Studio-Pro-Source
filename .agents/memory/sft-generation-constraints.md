---
name: SFT generation constraints
description: User's non-negotiable constraints for SFT model dispatch and the generation UI.
---

Use direct DigitalOcean Chat Completions for the separate initial requests to the configured models. Never use Model Synthesis. If an initial request returns HTTP 529, retry it exactly once with a distinct backup model from the configured list; do not retry other failures or top up batches. Fail promptly when an initial request and its permitted 529 fallback are unrecoverable instead of waiting for sibling requests to settle. If some valid examples completed before an unrecoverable failure, save them as a clearly marked partial batch; if none completed, return an error. Return the server-generated batch ID in both the job-start response and final result. Preserve the initial schedules, two-second spacing, templates, schemas, selectable batch sizes, and surrounding UI.

**Why:** The user explicitly ruled out Model Synthesis and objected to inferred changes to the app and its controls, then authorized one backup-model retry specifically for provider HTTP 529 overloads. On 2026-10-01, after repeated DigitalOcean request timeouts, the user changed the batch policy to keep completed examples as a partial batch rather than discard them.

**How to apply:** Before changing SFT generation, inspect the current request path and templates. Keep initial model calls independent, limit overload fallback to one extra call per HTTP 529, preserve the completed examples when a stack fails, and verify batch IDs remain stable from job creation through save. Keep partial status and the failure reason visible in the UI. Do not trigger live generation for testing unless the user explicitly asks.