---
name: Reasoning worker reliability
description: User-defined reliability requirements for SFT Reasoning batch generation.
---

Keep the Reasoning template unchanged. For its existing model slots, use `nemotron-3-ultra-550b` in every slot and run the slots concurrently. Preserve the existing batch lineup, batch sizing, request schedule, fallback logic, and recovery logic. Do not change Single Turn or Multi Turn prompts, schemas, or behavior.

**Why:** The user explicitly clarified that this is a literal model-slot substitution only, with no other changes to generation behavior.

**How to apply:** Change only the model IDs assigned to existing Reasoning slots. Do not modify the batch schedule, concurrency mechanism, fallback, recovery, or other templates.

The DigitalOcean adapter's verified request format is `json_object`, with response-schema text added to the prompt. Do not infer or add a native JSON-schema request payload unless its exact shape is established by existing app integration material.

**Why:** The user asked for the smallest internally consistent change and stopped further web research; the workspace code demonstrates JSON-object mode but not a native schema payload.

**How to apply:** Preserve JSON-object mode and keep strict schema constraints Reasoning-only until the integration itself establishes native structured-output support.