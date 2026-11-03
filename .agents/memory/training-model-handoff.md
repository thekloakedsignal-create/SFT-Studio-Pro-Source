---
name: Training model handoff
description: Keep onboarding model selection separate from the automated trainer's model and data format.
---

The model selected during project onboarding is for the project/onboarding flow only. Do not hand it off as the automated trainer's selected model or use onboarding's instruction template to determine training serialization. In the automated trainer, only Qwen3.5 9B and Llama 70B use ChatML Instruction text; every other training model uses ChatML conversation messages. Reformat the approved registry examples for the selected trainer model rather than rejecting them for a template mismatch.

**Why:** The user repeatedly clarified that onboarding model selection must not lock or preselect the model/format for a training run, and explicitly set this model-to-format rule.

**How to apply:** Keep onboarding model state separate from trainer state. In the automated trainer, choose provider routing and dataset serialization separately; use the trainer's model selection to format data according to the rule above.
