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
