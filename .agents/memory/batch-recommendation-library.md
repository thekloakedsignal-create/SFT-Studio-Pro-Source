---
name: Batch recommendation library
description: The user is providing curated onboarding batch recipes one at a time.
---

The user is building a curated library of batch recipes for Project Onboarding and will provide entries one at a time. Preserve each entry's topic, special instructions, and temporary constraints as supplied; do not invent or rewrite library entries.

**Why:** The user wants the onboarding AI to use a growing, user-authored library in its recommended-batch list.

**How to apply:** Add each newly supplied recipe to the onboarding library and preserve separate copy controls for topic, special instructions, and temporary constraints in the visible recommendation handoff.

Do not ask the AI to reproduce the full curated recipes. Have it choose exact library topic names and draft only additional recipes for user-stated needs; merge selected recipes from the library locally and continue onboarding with the curated list if AI enrichment fails.

**Why:** Requiring the model to repeat a long recipe library made recommendation parsing brittle and could block the onboarding flow.

**How to apply:** Treat the curated library as the source of truth for recipe text. Keep AI output limited to topic references and genuinely new skill-specific instructions and constraints.

Display selected library recipes verbatim. Keep the single-turn/multi-turn/reasoning reminder separate from the recipe's topic, special instructions, and temporary constraints.

**Why:** The user clarified that library content must remain unchanged and each recipe's three fields have separate copy controls.

**How to apply:** Never append general format guidance to a library recipe field; show that guidance as a separate onboarding note.

Every project gets a mix of relational/persona-centered and instructional/utility batches. Persona-centered, companion, and personal-AI projects lean relational and use fewer generic utility batches; task-focused projects can lean more utility while retaining relevant relational batches.

**Why:** The user wants both kinds of capability in every project's recommendations, with less generic utility emphasis for persona and personal-AI projects.

**How to apply:** Make the relative mix project-specific in the batch-adjuster prompt, but never omit either category. Do not change recommendation-selection logic.

On 2026-10-15 the user asked me to rewrite the whole library so every recipe teaches its behavior through the project's target voice and goals. All recipes (including the always-added Red Teaming/Adversarial ones) carry a shared voice-first lead and a no-drift constraint (no disclaimers, moralizing, pathologizing, reframing, or condescension).
**Why:** the user said the old recipes injected generic alignment behavior that ignored the project voice.
**How to apply:** New recipes keep the voice-first lead and no-drift constraint; otherwise preserve user-supplied text.
