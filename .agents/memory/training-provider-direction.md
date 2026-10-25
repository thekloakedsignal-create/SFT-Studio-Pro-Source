---
name: Training provider direction
description: User's provider choice for Muse training and sequencing of future provider work.
---

Use Fireworks for Muse Glimmer training only. Do not run a training job. Nebius supports Qwen/Qwen3-14B-Base and Qwen/Qwen2.5-72B; use 65,536-token sequence packing and map them to the existing 9B and 70B training tiers. Qwen/Qwen2.5-32B is owner-only. Make every trained Hugging Face model public before exposing its link.

Together keeps its serialized `<|im_start|>` ChatML export. Nebius uploads standard ChatML conversations as `{messages:[{role,content}]}` JSONL, not serialized `<|im_start|>` text.

**Why:** The user explicitly limited Fireworks to Muse Glimmer, said no training job should be run, later requested Nebius fine-tuning for Qwen models and specified that Nebius needs normal ChatML conversations. They also asked for an owner-only Qwen/Qwen2.5-32B option. Trained models must be public so users can access them.

**How to apply:** Restrict Fireworks training setup to Muse Glimmer. For Nebius, convert the prepared chat data to `{messages:[{role,content}]}` JSONL without `<|im_start|>` tokens; leave Together's export untouched. Do not create or run training jobs. Keep provider details out of the public UI, and set each output repository public only after training completes and before returning the link.
