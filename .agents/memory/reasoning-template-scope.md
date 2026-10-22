---
name: Reasoning template scope
description: User-defined boundary for changes to SFT Reasoning batch generation.
---

For a Llama project, automated batch examples must use Single Turn and Multi Turn only, without reasoning tags or Reasoning templates. The recommender may still suggest reasoning-related recipes/topics; recipe topic and output template are separate.

**Why:** The user clarified that reasoning recipes may be recommended, but Llama batches must not be auto-generated using the Reasoning template.

**How to apply:** Use the saved onboarding model to set the recommendation mix: Llama gets Single Turn + Multi Turn only; other models retain the existing mix. Do not filter reasoning-related recipe topics or change the actual batch generator or Model Trainer.

For Reasoning-generation work, change only the Reasoning template and its tests. Do not alter Single Turn or Multi Turn prompts, schemas, or behavior. Keep the shared concurrent model schedule.

Reasoning initial generation uses the user's ten-model list, not one repeated model. Keep recovery model selection separate; a generation-slot name replacement does not authorize changing refill routing. Keep shared model configuration shared, even where QA also uses it.

**Why:** The user repeatedly required literal initial-slot model-name replacements, rejected separating the shared QA list, and objected to recovery-routing changes. This supersedes earlier single-model Nemotron/GLM guidance here and in generation constraints.

**How to apply:** For model-name-only requests, preserve slot order, branches, prompts, retries, and surrounding code. Do not infer model capabilities or add model-specific behavior. For Reasoning fixes, make only the smallest Reasoning-scoped correction; keep other templates, QA, the document converter, and UI untouched.

**Why:** The user explicitly set and reinforced this scope while correcting Reasoning generation.

**How to apply:** Confine prompt, schema, and validation changes to Reasoning-specific branches; do not change the shared model pool or scheduler.

The DigitalOcean adapter's verified request format is `json_object`, with response-schema text added to the prompt. Do not infer or add a native JSON-schema request payload unless its exact shape is established by existing app integration material.

**Why:** The user asked for the smallest internally consistent change and stopped further web research; the workspace code demonstrates JSON-object mode but not a native schema payload.

**How to apply:** Preserve JSON-object mode and keep strict schema constraints Reasoning-only until the integration itself establishes native structured-output support.

Treat Reasoning model slots as independent requests, not one shared failure domain. Collect in-flight sibling results before finalizing a partial batch. Refill any missing examples with separate concurrent requests, never one bulk fill request.

**Why:** Assigning the same Nemotron model to every slot made model-wide cancellation affect all slots; fail-fast finalization could also omit responses that completed later. The user requested a minimal fix for only one response completing and later explicitly required individual concurrent refills instead of one all-missing request.

**How to apply:** Keep Reasoning timeout isolation and result collection separate from prompt/template changes. Preserve model names, batch sizes, and spacing. Do not diagnose all models as failed from recovery-only logs or from logs predating a server restart.

Reasoning retries must keep cycling through the model list until the missing examples are filled, moving each failed example to the next model rather than holding it for two minutes.

**Why:** The user explicitly requested this retry behavior after a batch stalled at 48 examples, overriding the earlier bounded-batch retry policy for Reasoning only.

**How to apply:** Keep retries individual and concurrent, preserve each missing example's topic, and advance its model independently on failure. Keep initial generation, other templates, prompts, validation, QA, and document conversion unchanged.

Treat `<think>` as a potentially reserved provider delimiter, not safe literal text inside generated JSON. Use a transport-only delimiter and restore dataset tags before strict validation.

**Why:** A user-authorized Nemotron diagnostic returned complete JSON objects lacking required tags and JSON suffixes missing their prefixes. The same concurrent diagnostic passed with transport-only delimiters restored before validation, supporting provider reasoning-delimiter handling as the cause; prompt escaping and concurrency fixes alone did not resolve it.

**How to apply:** Keep the dataset's required `<think>` format unchanged. Apply transport encoding only to Reasoning prompts and schema instructions, never Single Turn or Multi Turn, and do not invent missing explanation text or weaken validation.

Mixed must contain 50% Single Turn and 50% Multi Turn across batch sizes, never Reasoning.

Mixed generation must keep issuing fresh one-example calls concurrently across the model pool until the requested split is complete, rather than stopping at an overall batch deadline or relying on one recovery model. This overrides earlier deadline guidance for Mixed only.

**Why:** The user clarified that generation should keep going until complete using concurrent individual calls across many models.

**How to apply:** Preserve individual call timeouts and the required turn type of each missing slot; do not change Reasoning or other templates.

**Why:** The user explicitly confirmed “50% Single Turn + 50% Multi Turn” and clarified that mentioning Reasoning was a mistake: “Don’t touch reasoning.”

**How to apply:** Apply this boundary to both generation and document conversion, including instruction-formatted output. Mixed must not preserve reasoning fields or thinking traces; leave the dedicated Reasoning template unchanged.

When removing the Mixed option from the UI, remove it only from the Document Converter; preserve the Mixed option in Batch Synthesis.

**Why:** The user corrected an earlier change that removed the Batch Synthesis option instead of limiting the change to the Document Converter.

**How to apply:** Keep the Batch Synthesis Mixed control available for conversation and instruction projects. Do not expose Mixed in the Document Converter when the user requests its removal there.