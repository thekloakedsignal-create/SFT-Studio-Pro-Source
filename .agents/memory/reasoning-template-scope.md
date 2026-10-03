---
name: Reasoning template scope
description: User-defined boundary for changes to SFT Reasoning batch generation.
---

For Reasoning-generation work, change only the Reasoning template and its tests. Do not alter Single Turn or Multi Turn prompts, schemas, or behavior. Keep the shared concurrent model schedule.

**Why:** The user explicitly set and reinforced this scope while correcting Reasoning generation.

**How to apply:** Confine prompt, schema, and validation changes to Reasoning-specific branches; do not change the shared model pool or scheduler.

The DigitalOcean adapter's verified request format is `json_object`, with response-schema text added to the prompt. Do not infer or add a native JSON-schema request payload unless its exact shape is established by existing app integration material.

**Why:** The user asked for the smallest internally consistent change and stopped further web research; the workspace code demonstrates JSON-object mode but not a native schema payload.

**How to apply:** Preserve JSON-object mode and keep strict schema constraints Reasoning-only until the integration itself establishes native structured-output support.

Treat repeated Reasoning model slots as independent requests, not one shared failure domain. Collect in-flight sibling results before finalizing a partial batch.

**Why:** Assigning the same Nemotron model to every slot made model-wide cancellation affect all slots; fail-fast finalization could also omit responses that completed later. The user requested a minimal fix for only one response completing.

**How to apply:** Keep Reasoning timeout isolation and result collection separate from the existing Single Turn/Multi Turn failure policy. Preserve model selection, batch sizes, timing, and recovery limits unless explicitly asked to change them.

Use only `nemotron-3-ultra-550b` for Reasoning, including timeout recovery; the general GLM recovery rule applies only to other templates.

**Why:** The user stated, “Nemotron is the only model that responds correctly,” after reporting zero completed Reasoning examples.

**How to apply:** Do not switch Reasoning to GLM or other models to compensate for response-format failures. Diagnose the actual response-format error rather than assuming a concurrency problem.