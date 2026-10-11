---
name: SFT change scope
description: The user's requirement for literal execution and clarification when SFT Studio instructions are ambiguous.
---

For this app, follow the user's instructions directly and literally. Ask before assuming or interpreting any discrepancy.

**Why:** The user explicitly asked for direct execution and consultation on even small discrepancies.

**How to apply:** If the requested page, exclusion, or behavior is unclear, ask before changing code.

Keep these requests within Project Onboarding. Never modify the main app, backend, batch generation, batch settings, or batch data. For curated-recipe requests, update the onboarding recommendation library only.

**Why:** The user clarified that the recommendations are for Project Onboarding only and the app must never be changed.

**How to apply:** Keep recipe edits in ProjectOnboarding only. Do not change App.tsx, app surfaces, or generation behavior.

The Project Setup base-model choice is temporary and must not be passed into project settings until the app has a supported field for it.

**Why:** The user said the model choice will be needed later, but there is nowhere appropriate to store it yet.

**How to apply:** Keep the choice in onboarding state only; do not add it to the completion payload, project data, or batch settings.

Before the batch-skills interview, show the completed project definition and require final user approval. Freeze that approved project-settings snapshot for recommendations and handoff; any edits require approval again. The five-sentence limit applies only to the system prompt.

**Why:** The user explicitly requested a final approval and locked project definition before batch setup, and clarified that the sentence limit is system-prompt-specific.

**How to apply:** Keep this approval gate and snapshot within Project Onboarding. Do not impose the sentence limit on other fields or add selected base-model data to the handoff payload.

After the golden example, ask whether the user wants the model to remember a name. If yes, prepend the user's exact name in a “Your name is …” sentence to the system prompt.

**Why:** The user explicitly requested this optional onboarding step.

**How to apply:** Keep it in Project Onboarding before system-prompt setup; if declined, leave the prompt unchanged.
