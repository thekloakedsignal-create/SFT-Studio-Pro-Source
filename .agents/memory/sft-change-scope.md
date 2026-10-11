---
name: SFT change scope
description: The user's requirement for literal execution and clarification when SFT Studio instructions are ambiguous.
---

For this app, follow the user's instructions directly and literally. Ask before assuming or interpreting any discrepancy.

**Why:** The user explicitly asked for direct execution and consultation on even small discrepancies.

**How to apply:** If the requested page, exclusion, or behavior is unclear, ask before changing code.

Do not modify the existing SFT Studio app or its runtime logic. When explicitly asked to change Project Setup, keep edits within that separate setup layer; do not change app integration, batch generation, batch settings, or batch data.

**Why:** The user emphasized that the existing app must not be changed and that batch functionality must remain untouched.

**How to apply:** Keep requested work isolated to Project Setup. If a request cannot be completed without changing the existing app, explain that boundary and ask first.

The Project Setup base-model choice is temporary and must not be passed into project settings until the app has a supported field for it.

**Why:** The user said the model choice will be needed later, but there is nowhere appropriate to store it yet.

**How to apply:** Keep the choice in onboarding state only; do not add it to the completion payload, project data, or batch settings.
