---
name: Reasoning template scope
description: User-defined boundary for changes to SFT Reasoning batch generation.
---

For Reasoning-generation work, change only the Reasoning template and its tests. Do not alter Single Turn or Multi Turn prompts, schemas, or behavior. Keep the shared concurrent model schedule.

For initial and refill Reasoning batch calls, use GLM-5.3-Flash with a 120-second request timeout. Send the user's supplied system and user messages together in one request, with project/batch placeholders filled and no appended schema or extra instructions. This overrides earlier Nemotron and 20-second Reasoning guidance below and in generation constraints.

**Why:** The user explicitly replaced the Reasoning call with their supplied text, requested GLM-5.3-Flash and a longer timeout, and prohibited other changes.

**How to apply:** Preserve the supplied wording and independent one-example scheduling. Keep other templates, QA repair behavior, parsing, and UI untouched.

**Why:** The user explicitly set and reinforced this scope while correcting Reasoning generation.

**How to apply:** Confine prompt, schema, and validation changes to Reasoning-specific branches; do not change the shared model pool or scheduler.

The DigitalOcean adapter's verified request format is `json_object`, with response-schema text added to the prompt. Do not infer or add a native JSON-schema request payload unless its exact shape is established by existing app integration material.

**Why:** The user asked for the smallest internally consistent change and stopped further web research; the workspace code demonstrates JSON-object mode but not a native schema payload.

**How to apply:** Preserve JSON-object mode and keep strict schema constraints Reasoning-only until the integration itself establishes native structured-output support.

Treat repeated Reasoning model slots as independent requests, not one shared failure domain. Collect in-flight sibling results before finalizing a partial batch. Refill any missing examples with separate concurrent Nemotron requests, never one bulk fill request.

**Why:** Assigning the same Nemotron model to every slot made model-wide cancellation affect all slots; fail-fast finalization could also omit responses that completed later. The user requested a minimal fix for only one response completing and later explicitly required individual concurrent refills instead of one all-missing request.

**How to apply:** Keep Reasoning timeout isolation and result collection separate from prompt/template changes. Preserve Nemotron model selection, batch sizes, initial schedule, and spacing; apply the user-authorized per-example concurrent refill and longer shared batch deadline without changing provider transport or parsing.

Use only `nemotron-3-ultra-550b` for Reasoning, including timeout recovery; the general GLM recovery rule applies only to other templates.

**Why:** The user stated, “Nemotron is the only model that responds correctly,” after reporting zero completed Reasoning examples.

**How to apply:** Do not switch Reasoning to GLM or other models to compensate for response-format failures. Diagnose the actual response-format error rather than assuming a concurrency problem.

Treat `<think>` as a potentially reserved provider delimiter, not safe literal text inside generated JSON. Use a transport-only delimiter and restore dataset tags before strict validation.

**Why:** A user-authorized Nemotron diagnostic returned complete JSON objects lacking required tags and JSON suffixes missing their prefixes. The same concurrent diagnostic passed with transport-only delimiters restored before validation, supporting provider reasoning-delimiter handling as the cause; prompt escaping and concurrency fixes alone did not resolve it.

**How to apply:** Keep the dataset's required `<think>` format unchanged. Apply transport encoding only to Reasoning prompts and schema instructions, never Single Turn or Multi Turn, and do not invent missing explanation text or weaken validation.

Mixed must contain only a mix of Single Turn and Multi Turn, never Reasoning.

**Why:** The user explicitly requested that the MIXED template exclude reasoning.

**How to apply:** Apply this boundary to both generation and document conversion, including instruction-formatted output. Mixed must not preserve reasoning fields or thinking traces; leave the dedicated Reasoning template unchanged.

When removing the Mixed option from the UI, remove it only from the Document Converter; preserve the Mixed option in Batch Synthesis.

**Why:** The user corrected an earlier change that removed the Batch Synthesis option instead of limiting the change to the Document Converter.

**How to apply:** Keep the Batch Synthesis Mixed control available for conversation and instruction projects. Do not expose Mixed in the Document Converter when the user requests its removal there.