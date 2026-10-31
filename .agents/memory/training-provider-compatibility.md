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

For the Together automated-training final dataset only, format Llama datasets as Alpaca and Qwen datasets as ChatML `messages`, preserving assistant reasoning separately as `reasoning_content`. Do not change Nebius formatting, Registry exports, generation, or other training workflow behavior.

**Why:** The user explicitly limited this model-specific formatting to the final Together training dataset and required reasoning to remain a separate field for Qwen.

**How to apply:** Select the template at the Together training finalization boundary and validate the matching JSONL schema before upload; leave all other dataset paths and system prompts unchanged.
