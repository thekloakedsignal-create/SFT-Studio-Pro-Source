---
name: Pipeline automation spec
description: User-locked design for the opt-in onboarding automation pipeline (generation, document conversion, QA chain) — exact step order and UX wording decisions.
---

The onboarding ends with four conversational questions (NOT toggles):
1. "Would you like to automatically generate suggested batches?" — background generation of recommendations, templates round-robin single/multi/reasoning (reasoning skipped for 70B projects).
2. "Do you have any documents to convert? Would you like me to process them for you?" — upload inline in onboarding, auto-convert when the pipeline starts.
3. "Would you like me to run the quality audit or do you prefer to oversee it yourself?" — automated QA chain.
4. "Do you want to train a model now or export your data set?" — exit routing only.

QA chain order is fixed by the user: **assess once → regenerate flagged once → deduplicate → approve.** No post-regen re-assessment, no conditional approve gate, no skipped steps. Only a step *failure* halts a batch at "needs review" with the error shown.

**Why:** The user corrected two deviations explicitly: approval is unconditional after the full chain (not gated on a second assessment), and the controls are questions, not toggles.
**How to apply:** When building the pipeline, do not add re-assessment after regen, do not make approval conditional on cleanliness, and keep the QA chain scoped to pipeline-produced batches (manual batches stay manual).
