---
name: SFT change scope
description: The user's requirement for literal execution and clarification when SFT Studio instructions are ambiguous.
---

For this app, follow the user's instructions directly and literally. Ask before assuming or interpreting any discrepancy.

**Why:** The user explicitly asked for direct execution and consultation on even small discrepancies.

**How to apply:** If the requested page, exclusion, or behavior is unclear, ask before changing code.

Do not modify the existing SFT Studio app's runtime logic, backend, batch generation, batch settings, or batch data. Project Setup changes may use only the minimum visible UI handoff needed to show onboarding recommendations.

**Why:** The user explicitly limited work to Project Onboarding and its visible UI handoff, excluding app functionality and backend changes.

**How to apply:** Keep edits in Project Setup and the recommendation handoff UI only. Do not alter batch-generation logic or touch other app surfaces.

The Project Setup base-model choice is temporary and must not be passed into project settings until the app has a supported field for it.

**Why:** The user said the model choice will be needed later, but there is nowhere appropriate to store it yet.

**How to apply:** Keep the choice in onboarding state only; do not add it to the completion payload, project data, or batch settings.
