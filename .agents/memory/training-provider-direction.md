---
name: Training provider direction
description: User's provider choice for Muse training and sequencing of future provider work.
---

Use Fireworks for Muse Glimmer training only. Do not run a training job. Nebius may be added later; do not include it in the initial Fireworks setup.

The existing Together AI path keeps its serialized `<|im_start|>` ChatML export. Fireworks Muse uses regular ChatML message arrays from the app's already prepared training and validation splits.

**Why:** The user explicitly said Fireworks is for Muse Glimmer only, no training should be run, and Nebius will be added later.

**How to apply:** Restrict Fireworks training setup to Muse Glimmer. Reuse the app's existing prepared data, serialize it as regular `{messages:[{role,content}]}` ChatML without `<|im_start|>` tokens, and leave Together's export untouched. Do not create or run training jobs. Treat Nebius as deferred until requested.
