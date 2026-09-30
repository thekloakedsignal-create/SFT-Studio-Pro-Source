---
name: SFT generation constraints
description: User's non-negotiable constraints for SFT model dispatch and the generation UI.
---

Use DigitalOcean Chat Completions for separate requests to these exact ordered model groups:

- Group 1: `glm-5.3-flash`, `qwen3.5-397b-a17b`, `gemma-4-31B-it`, `deepseek-v4-pro`, `qwen3.8-max`
- Group 2: `llama-4-maverick`, `mimo-v2.5-pro`, `minimax-m2.5`, `mistral-3-14B`, `nemotron-3-nano-omni`

Never use Model Synthesis. Supported batch sizes are exactly 5, 10, 25, 50, 100, 200, and 250. Every deployment launches its assigned model requests concurrently; wait 2 seconds only between deployments:

- 5: Group 1 once.
- 10: Groups 1 and 2 once.
- 25: Groups 1+2, Groups 1+2, Group 1.
- 50: Groups 1+2 for 5 deployments.
- 100: Groups 1+2 for 10 deployments.
- 200: Groups 1 twice + Group 2 twice for 10 deployments.
- 250: Groups 1 twice + Group 2 twice for 12 deployments, then Groups 1+2 once.

Preserve the existing templates and output schemas unless explicitly requested otherwise.

**Why:** The user explicitly specified the ordered model groups, exact batch sizes, and parallel deployment timing, and objected to inferred changes beyond those requirements.

**How to apply:** Keep every deployment wave concurrent and never delay between individual models. Only the next deployment waits 2 seconds. Do not add request retries or top-up calls. Keep user-visible batch choices and server validation aligned with the exact supported sizes.