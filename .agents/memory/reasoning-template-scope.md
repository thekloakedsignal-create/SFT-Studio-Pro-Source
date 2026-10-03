---
name: Reasoning worker reliability
description: User-defined reliability requirements for SFT Reasoning batch generation.
---

Keep the Reasoning template unchanged. Make reliability changes only to Reasoning dispatch, result collection, and tests; do not alter Single Turn or Multi Turn prompts, schemas, or behavior. Workers must run concurrently for every supported batch size: 5, 10, 25, 50, 100, 200, and 250. When a Reasoning worker fails, start its replacement immediately while sibling workers continue. Retain successful sibling results, and return exactly the requested number of examples or an error—never a successful partial batch.

**Why:** The user explicitly said the template is already correct, repeatedly emphasized concurrency across all batch sizes, required failed slots to move quickly to another worker, and prohibited incomplete batches.

**How to apply:** Keep prompts and schemas untouched. Confine worker replacement and collection changes to Reasoning-specific branches; preserve the shared model pool and schedule. Wait for all launched sibling tasks in the active stack, and report an error if recovery cannot fill every requested slot.

The DigitalOcean adapter's verified request format is `json_object`, with response-schema text added to the prompt. Do not infer or add a native JSON-schema request payload unless its exact shape is established by existing app integration material.

**Why:** The user asked for the smallest internally consistent change and stopped further web research; the workspace code demonstrates JSON-object mode but not a native schema payload.

**How to apply:** Preserve JSON-object mode and keep strict schema constraints Reasoning-only until the integration itself establishes native structured-output support.