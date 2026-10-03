---
name: Reasoning template scope
description: User-defined boundary for changes to SFT Reasoning batch generation.
---

For Reasoning-generation work, change only the Reasoning template and its tests. Do not alter Single Turn or Multi Turn prompts, schemas, or behavior. Keep the shared concurrent model schedule, and wait for all already-launched Reasoning workers before finalizing a partial result.

**Why:** The user explicitly set and reinforced this scope while correcting Reasoning generation. A fast failure from one worker must not discard valid results still in flight from its siblings.

**How to apply:** Confine prompt, schema, validation, and result-collection changes to Reasoning-specific branches; do not change the shared model pool or scheduler.

The DigitalOcean adapter's verified request format is `json_object`, with response-schema text added to the prompt. Do not infer or add a native JSON-schema request payload unless its exact shape is established by existing app integration material.

**Why:** The user asked for the smallest internally consistent change and stopped further web research; the workspace code demonstrates JSON-object mode but not a native schema payload.

**How to apply:** Preserve JSON-object mode and keep strict schema constraints Reasoning-only until the integration itself establishes native structured-output support.