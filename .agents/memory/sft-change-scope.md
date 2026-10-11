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
