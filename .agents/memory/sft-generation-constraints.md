---
name: SFT generation constraints
description: User's non-negotiable constraints for SFT model dispatch and the generation UI.
---

The scoped Single Turn policy below and the Reasoning-only policy in `reasoning-template-scope.md` override the baseline recovery policy where they differ.

Use direct DigitalOcean Chat Completions for the separate initial requests to the configured models. Never use Model Synthesis. A per-example model request times out after twenty seconds. If a model times out (including HTTP 408/504), skip it for later scheduled calls and ask `glm-5.3-flash` once to generate all missing examples together; this is the only timeout failover. If that GLM fill receives HTTP 529, preserve the existing single distinct-model 529 backup rule. The total batch deadline is 120 seconds per 50-example block, so every supported size above 50 has a longer deadline. Do not retry or top up for other failures. If some valid examples completed before an unrecoverable failure, save them as a clearly marked partial batch; if none completed, return an error. Return the server-generated batch ID in both the job-start response and final result. Preserve the initial schedules, two-second spacing, templates, schemas, selectable batch sizes, and surrounding UI.

**Why:** The user explicitly ruled out Model Synthesis and objected to inferred changes to the app and its controls, then authorized one backup-model retry specifically for provider HTTP 529 overloads. On 2026-10-01, after repeated DigitalOcean request timeouts, the user changed the batch policy to use GLM for missing examples and keep completed examples as a partial batch if recovery fails. On 2026-10-02, the user clarified that batches over 50 need a total deadline longer than 120 seconds, set the per-example timeout to twenty seconds, and instructed that UI changes are prohibited and only minimal fixes to specified problems are allowed. The earlier five-second limit was too short in a real app job: four initial requests and the four-example GLM recovery both timed out, leaving one example.

**How to apply:** Before changing SFT generation, inspect the current request path and templates. Do not change the UI; make only minimal fixes to problems the user explicitly identifies. Keep Quality Assessment confined to its own tab and separate from SFT generation. Keep initial model calls independent, preserve their schedules and spacing, apply the per-model timeout separately from the size-scaled batch deadline, abort that model's other in-flight requests when it stalls, and limit each timeout recovery to one GLM batch. Limit overload fallback to one extra call per HTTP 529. Preserve completed examples when recovery fails, keep partial status and the completed count visible without exposing backend-provided reasons, and verify batch IDs remain stable from job creation through save. Do not trigger live generation for testing unless the user explicitly asks.

Do not show or replace backend failure messages in the SFT UI. Keep the existing progress display; partial batches may show their completed-example count, but do not display backend failure reasons or a substitute failure notification.

**Why:** The user explicitly directed that backend failure messages be removed, not rewritten or substituted.

**How to apply:** Do not render backend/provider error text or partial reasons in the SFT UI, and do not add generic failure copy in their place. Preserve existing progress-bar wording unless explicitly requested.

Single Turn must collect in-flight responses and continue the remaining originally scheduled stacks after an individual request fails, within the existing batch deadline.

**Why:** The user reported receiving six examples when requesting fifty and asked for a strictly scoped fix. Abandoning later scheduled stacks on one failed request needlessly reduces completed output.

**How to apply:** Keep this exception Single Turn-only. Continuing already scheduled requests is not permission to add retries or top-ups for non-timeout failures. Preserve honest partial status if the provider still returns fewer valid examples.

Single Turn timeout recovery uses individual requests for missing examples rather than one large fill request.

**Why:** The user explicitly approved individual recovery after the single GLM fill returned only one of twelve requested replacements.

**How to apply:** Preserve completed examples, bound recovery concurrency, keep the existing per-request timeout and total deadline, and permit only the existing one distinct-model backup on HTTP 529. Do not add retry loops, recover non-timeout failures, or change other templates under this approval.