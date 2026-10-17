---
name: Pipeline automation spec
description: User-locked design for the opt-in onboarding automation pipeline (generation, document conversion, QA chain) — exact step order and UX wording decisions.
---

The onboarding ends with four conversational questions (NOT toggles):
1. "Would you like to automatically generate suggested batches?" — background generation of recommendations. Each batch's TOTAL is 200 examples (400 for user-specified-skill batches), mixed within the batch across single-turn, multi-turn, and reasoning (reasoning skipped for 70B projects). The converter sets its own per-document count via its analyzer — never impose a default there.
2. "Do you have any documents to convert? Would you like me to process them for you?" — upload inline in onboarding, auto-convert when the pipeline starts.
3. "Would you like me to run the quality audit or do you prefer to oversee it yourself?" — automated QA chain.
4. "Do you want to train a model now or export your data set?" — exit routing only.

QA chain order is fixed by the user: **assess once → regenerate flagged once → deduplicate → approve.** No post-regen re-assessment, no conditional approve gate, no skipped steps. Only a step *failure* halts a batch at "needs review" with the error shown.

**Why:** The user corrected two deviations explicitly: approval is unconditional after the full chain (not gated on a second assessment), and the controls are questions, not toggles.
QA scope: the automated QA chain covers EVERY pending batch in the project — manual and pipeline-produced alike (skip only already-Approved ones). Each batch's automation runs as its own separate unit; one batch's failure never affects another.

**How to apply:** When building or changing the pipeline, do not add re-assessment after regen, do not make approval conditional on cleanliness, and do not restrict QA automation to pipeline-produced batches.
