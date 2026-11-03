---
name: Training model handoff
description: Keep onboarding model selection separate from the automated trainer's model and data format.
---

The model selected during project onboarding is for the project/onboarding flow only. Do not hand it off as the automated trainer's selected model or use onboarding's instruction template to determine training serialization. The model and its required data format are selected in the automated trainer.

**Why:** The user repeatedly clarified that onboarding model selection must not lock or preselect the model/format for a training run.

**How to apply:** Keep onboarding model state separate from trainer state. Use only the automated trainer's model selection to choose provider routing and its required dataset schema.
