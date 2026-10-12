---
name: SFT change scope
description: The user's requirement for literal execution and clarification when SFT Studio instructions are ambiguous.
---

For this app, follow the user's instructions directly and literally. Ask before assuming or interpreting any discrepancy.

**Why:** The user explicitly asked for direct execution and consultation on even small discrepancies.

**How to apply:** If the requested page, exclusion, or behavior is unclear, ask before changing code.

Do not add user-facing error messages to the onboarding UI.

**Why:** The user explicitly prohibited adding error messages.

**How to apply:** Do not introduce visible error text as part of an onboarding change.

Keep requests within Project Onboarding, except that onboarding recommendations may be passed to the existing main app for UI display. Never modify backend behavior, batch generation, batch settings, or batch data.

**Why:** The user permits only a display-only main-app handoff for the recommendations and prohibits changes to the app's actual functions.

**How to apply:** Keep recipe logic in ProjectOnboarding. In App.tsx, limit changes to displaying and navigating the handed-off recommendations; preserve all existing generation and application behavior.

The Project Setup base-model choice is temporary and must not be passed into project settings until the app has a supported field for it.

**Why:** The user said the model choice will be needed later, but there is nowhere appropriate to store it yet.

**How to apply:** Keep the choice in onboarding state only; do not add it to the completion payload, project data, or batch settings.

Before the batch-skills interview, show the completed project definition and require final user approval. Freeze that approved project-settings snapshot for recommendations and handoff; any edits require approval again. The AI-generated system prompt should be instructed to stay within five sentences, but never block it with a sentence-count gate; leave longer user-written prompts unchanged.

**Why:** The user explicitly requested a final approval and locked project definition before batch setup, clarified that the sentence limit is system-prompt-specific, and said to instruct the AI rather than block its output.

**How to apply:** Keep this approval gate and snapshot within Project Onboarding. Do not impose the sentence limit on other fields or add selected base-model data to the handoff payload.

After the user approves Project Definition, close onboarding and return to the prefilled Project Definition page. Tell the user to review and Save & Lock it, then navigate to the Batch Synthesizer and open AI Guide for Section 2. Place the Batch Recommendations button on the Synthesizer page, not Project Definition. Keep the existing Batch Synthesizer and recommendations unchanged. Show AI Guide buttons on app pages except Project Definition and Data Registry. Persist guide conversations and recommendations in project-keyed localStorage, separate from saved-project data; do not alter Data Registry content or behavior.

**Why:** The user clarified that Section 1 must end at Project Definition approval, Section 2 is already in the app, the Batch Recommendations button belongs on the Synthesizer page, localStorage is acceptable, and Data Registry is excluded.

**How to apply:** Limit related edits to the Project Definition exit message, AI Guide entry points, and separate localStorage state. Leave batch-generation logic, recommendation content, saved-project records, and Data Registry untouched.

The batch interview only gathers skills and produces recommended batch recipes; it must not create training examples or start the actual batch generator.

**Why:** The user explicitly distinguished onboarding recommendations from generating batches.

**How to apply:** Keep recommendation drafting inside Project Onboarding and leave actual batch generation to the existing app after handoff.

After the golden example, ask whether the user wants the model to remember a name. If yes, prepend the user's exact name in a “Your name is …” sentence to the system prompt.

**Why:** The user explicitly requested this optional onboarding step.

**How to apply:** Keep it in Project Onboarding before system-prompt setup; if declined, leave the prompt unchanged.

Voice approval and golden-example generation must be separate visible stages. A golden-example formatting failure must stay in its own stage and offer retry without making the approved voice sample appear blocked.

**Why:** The user clarified that the separation error appeared in the wrong place and was mistaken for a voice-sample failure.

**How to apply:** Keep the approved voice reference intact while retrying golden-example generation; display golden parsing errors only on the golden-generation step.
