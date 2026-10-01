---
name: SFT generation constraints
description: User's non-negotiable constraints for SFT model dispatch and the generation UI.
---

Use direct DigitalOcean Chat Completions for the separate initial requests to the configured models. Never use Model Synthesis. If an initial request returns HTTP 529, retry it exactly once with a distinct backup model from the configured list; do not retry other failures or top up batches. Fail promptly when an initial request and its permitted 529 fallback are unrecoverable instead of waiting for sibling requests to settle. Preserve the initial schedules, two-second spacing, templates, schemas, selectable batch sizes, and surrounding UI.

**Why:** The user explicitly ruled out Model Synthesis and objected to inferred changes to the app and its controls, then authorized one backup-model retry specifically for provider HTTP 529 overloads. Once a stack cannot meet the full-batch requirement, waiting on unrelated slow requests only prolongs a doomed generation job.

**How to apply:** Before changing SFT generation, inspect the current request path and templates. Keep initial model calls independent, limit overload fallback to one extra call per HTTP 529, fail the overall stack on the first unrecoverable task, and verify existing templates and batch-size choices remain unchanged. Do not trigger live generation for testing unless the user explicitly asks.