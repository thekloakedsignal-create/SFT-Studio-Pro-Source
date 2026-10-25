---
name: Training provider direction
description: User's provider choice for Muse training and sequencing of future provider work.
---

Use Fireworks for Muse Glimmer training only. Do not run a training job. Nebius supports Qwen/Qwen3-14B-Base and Qwen/Qwen2.5-72B; use 65,536-token sequence packing and map them to the existing 9B and 70B training tiers. Qwen/Qwen2.5-32B is owner-only. Make every trained Hugging Face model public before exposing its link.

Together keeps its serialized `<|im_start|>` ChatML export. Nebius uploads standard ChatML conversations as `{messages:[{role,content}]}` JSONL, not serialized `<|im_start|>` text. Leave Nebius's scheduler unset; its documented API does not expose a scheduler field. Preserve useful sanitized validation errors for training submissions instead of returning generic failures.

**Why:** The user explicitly limited Fireworks to Muse Glimmer, said no training job should be run, later requested Nebius fine-tuning for Qwen models and specified that Nebius needs normal ChatML conversations. They also asked for an owner-only Qwen/Qwen2.5-32B option, chose not to send an undocumented scheduler field, and objected to submissions hiding actionable errors. Trained models must be public so users can access them. The user requires active job status to remain visible throughout the run.

**How to apply:** Restrict Fireworks training setup to Muse Glimmer. For Nebius, convert the prepared chat data to `{messages:[{role,content}]}` JSONL without `<|im_start|>` tokens; leave Together's export untouched. Don't set a learning-rate schedule unless Nebius documents a supported field. Show sanitized validation details to the submitting user without leaking tokens or backend-provider names. Do not create or run training jobs. Keep provider details out of the public UI, and set each output repository public only after training completes and before returning the link. When restoring status, choose the newest job across Together and Nebius; offer the correct output/download action for each, not a Together-only path. Keep the active status screen visible until the job reaches a terminal state.
