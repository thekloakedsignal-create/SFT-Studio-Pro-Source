---
name: Training provider compatibility
description: Together completion identifiers and the shared schema push limitation.
---

Together can return a completed job with its model registry ID but no project ID. Resolve the project from the authenticated provider identity, not the model-name prefix.

**Why:** A real completed job omitted the project ID; treating that as an unavailable model prevented chat from appearing.

**How to apply:** Keep provider project identity distinct from application project IDs. Configuration lookup is project-scoped with a reference-model filter; a model-nested configurations URL returned 404.

The filtered Drizzle push can still attempt to remove serial sequences belonging to unrelated project tables.

**Why:** A development schema push failed while trying to drop the users serial sequence despite the table filter.

**How to apply:** Never force or cascade that change. Use a narrowly scoped development schema addition when necessary; production schema changes remain owned by Publish.

Nebius fine-tuning job requests must provide either top-level `method` or top-level `hyperparameters`, not both. Keep the training settings inside `method.supervised.hyperparameters`.

**Why:** Nebius rejected requests containing both fields with HTTP 422; removing the duplicate made job submission work.

**How to apply:** When editing Nebius job payloads, preserve the base model and use only the supervised `method` object for hyperparameters.

For final Registry output and Together uploads, Llama's Alpaca records are `instruction` (system prompt), `input` (user prompt), and `output` (assistant answer), with no `system` field. Qwen ChatML keeps `reasoning_content` before `content` inside the assistant message. Do not change Nebius formatting or generation.

**Why:** The user specified the exact Llama fields and speaker mapping, required the system prompt to be represented as `instruction`, confirmed `output` is the correct answer field, and placed Qwen reasoning before answer content.

**How to apply:** Run final formatting and validation only on Registry finalized outputs and the Together upload; keep Nebius and generation paths unchanged.
