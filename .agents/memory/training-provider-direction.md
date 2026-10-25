---
name: Training provider direction
description: User's provider choice for Muse training and sequencing of future provider work.
---

Use Fireworks for Muse Glimmer training only. Do not run a training job. Nebius supports Qwen/Qwen3-14B-Base and Qwen/Qwen2.5-72B; use 65,536-token sequence packing and map them to the existing 9B and 70B training tiers. Qwen/Qwen2.5-32B is owner-only. Make every trained Hugging Face model public before exposing its link.

The existing Together AI path keeps its serialized `<|im_start|>` ChatML export. Fireworks Muse uses regular ChatML message arrays from the app's already prepared training and validation splits.

**Why:** The user explicitly limited Fireworks to Muse Glimmer, said no training job should be run, later requested Nebius fine-tuning for two Qwen models with the specified packing length and tier mapping, and asked for an owner-only Qwen/Qwen2.5-32B option. Trained models must be public so users can access them.

**How to apply:** Restrict Fireworks training setup to Muse Glimmer. Reuse the app's existing prepared data, serialize it as regular `{messages:[{role,content}]}` ChatML without `<|im_start|>` tokens, and leave Together's export untouched. Do not create or run training jobs. Keep provider details out of the public UI, and set each output repository public only after training completes and before returning the link.
