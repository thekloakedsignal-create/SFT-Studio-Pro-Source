---
name: DigitalOcean model compatibility
description: Live compatibility findings for DigitalOcean Serverless Inference model IDs and reasoning suppression.
---

The following DigitalOcean model IDs returned non-empty text with `reasoning_effort: "none"` and no `reasoning_content` in short live tests on 2026-10-02: `qwen3.5-397b-a17b`, `gemma-4-31B-it`, `deepseek-v4-pro`, `nemotron-3-ultra-550b`, `llama-4-maverick`, `mimo-v2.5-pro`, `nemotron-3-nano-omni`, `glm-5.3`, `qwen3.8-max`, and `kimi-k2.6`. Kimi required `temperature: 0.6`.

`glm-5.3-flash` and `minimax-m2.5` returned reasoning content despite `reasoning_effort: "none"`; MiniMax also returned no usable answer content in the small-token test. `mistral-3-14B` failed with `chat_template is not supported for Mistral tokenizers`.

**Why:** Model API support is not uniform: a successful HTTP response does not ensure reasoning is disabled or usable answer text is present.

**How to apply:** Before adding a DigitalOcean model to SFT generation, verify a non-empty answer and check `reasoning_content` with the exact settings intended for production. Recheck availability because these are dated live observations.