---
name: SFT change scope
description: The user's requirement for literal execution and clarification when SFT Studio instructions are ambiguous.
---

For this app, follow the user's instructions directly and literally. Ask before assuming or interpreting any discrepancy.

**Why:** The user explicitly asked for direct execution and consultation on even small discrepancies.

**How to apply:** If the requested page, exclusion, or behavior is unclear, ask before changing code.

Keep requests within Project Onboarding, except that onboarding recommendations may be passed to the existing main app for UI display. Never modify backend behavior, batch generation, batch settings, or batch data.

**Why:** The user permits only a display-only main-app handoff for the recommendations and prohibits changes to the app's actual functions.

**How to apply:** Keep recipe logic in ProjectOnboarding. In App.tsx, limit changes to displaying and navigating the handed-off recommendations; preserve all existing generation and application behavior.

Save the Project Onboarder model selection permanently in the locked Project Definition only. Do not touch Model Trainer.

**Why:** The user explicitly corrected the scope: “Just fucking save it in the locked project definition” and “don't fucking touch the model trainer.”

**How to apply:** Preserve the onboarder choice when saving and reopening Project Definition. Do not add trainer behavior, trainer restrictions, or changes to batch settings.

Before the batch-skills interview, show the completed project definition and require final user approval. Freeze that approved project-settings snapshot for recommendations and handoff; any edits require approval again. The AI-generated system prompt should be instructed to stay within five sentences, but never block it with a sentence-count gate; leave longer user-written prompts unchanged.

**Why:** The user explicitly requested a final approval and locked project definition before batch setup, clarified that the sentence limit is system-prompt-specific, and said to instruct the AI rather than block its output.

**How to apply:** Keep this approval gate and snapshot within Project Onboarding. Do not impose the sentence limit on other fields.

After the user approves Project Definition, close onboarding and return to the prefilled Project Definition page. Tell the user to review and Save & Lock it, then navigate to the Batch Synthesizer and open AI Guide for Section 2. Place the Batch Recommendations button on the Synthesizer page, not Project Definition. Keep the existing Batch Synthesizer and recommendations unchanged. Show AI Guide buttons on app pages except Project Definition, including Data Registry. Persist guide conversations and recommendations in project-keyed localStorage, separate from saved-project data; do not alter Registry batch data or selection behavior.

**Why:** The user clarified that Section 1 must end at Project Definition approval, Section 2 is already in the app, the Batch Recommendations button belongs on the Synthesizer page, localStorage is acceptable, and later explicitly requested a Data Registry guide.

**How to apply:** Keep Registry guidance separate from Registry data behavior. Its guide asks whether to run automated training, shows the selected QA-approved batches for final approval, and then opens the existing Automated Trainer flow; leave batch generation, recommendation content, saved-project records, and Registry selection logic unchanged.

The batch interview only gathers skills and produces recommended batch recipes; it must not create training examples or start the actual batch generator.

**Why:** The user explicitly distinguished onboarding recommendations from generating batches.

**How to apply:** Keep recommendation drafting inside Project Onboarding and leave actual batch generation to the existing app after handoff.

After the golden example, ask whether the user wants the model to remember a name. If yes, prepend the user's exact name in a “Your name is …” sentence to the system prompt.

**Why:** The user explicitly requested this optional onboarding step.

**How to apply:** Keep it in Project Onboarding before system-prompt setup; if declined, leave the prompt unchanged.

Voice approval and golden-example generation must be separate visible stages. A golden-example formatting failure must stay in its own stage and offer retry without making the approved voice sample appear blocked.

**Why:** The user clarified that the separation error appeared in the wrong place and was mistaken for a voice-sample failure.

**How to apply:** Keep the approved voice reference intact while retrying golden-example generation; display golden parsing errors only on the golden-generation step.

For Project Onboarding, place the approved voice sample in the Target Task & Model Persona instructions, not in project constraints; keep constraints limited to the user's stated rules.

**Why:** The user clarified that placing the voice sample among constraints sends the wrong message.

**How to apply:** Build the target/persona text with the approved voice reference and pass only user-entered constraints through the constraints field.

For generated examples, the approved golden exemplar is the primary guide for tone and diction; batch instructions determine topic and task.

**Why:** The user explicitly said the golden example should be the most emphasized guide for tone and diction.

**How to apply:** State this priority in every generation prompt while preserving required system, safety, batch, and template instructions.
