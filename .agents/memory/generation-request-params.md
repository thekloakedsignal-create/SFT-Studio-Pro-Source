---
name: Generation request parameters
description: Standing rule on sampling/reasoning parameters sent to the inference provider for batch generation.
---

Never add reasoning_effort, thinking/thinkingConfig/thinkingBudget, frequency_penalty, or presence_penalty to any inference request or config object — not even gated, defaulted to null, or "inert".

**Why:** The user has stated this repeatedly ("DO NOT SET REASONING EFFORT OR THINKING OR PENALTIES"). Such parameters crept back in via a checkpoint restore on 2026-10-17 and were removed again on 2026-10-19.

**How to apply:** Requests carry only model, messages, temperature, max tokens, and JSON response_format. If a restore or merge reintroduces any of these fields, remove them without asking.
