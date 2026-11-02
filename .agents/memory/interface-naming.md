---
name: Interface naming
description: Scope of model and backend naming removal from the interface.
---

Show the selected model name in training choices, but never disclose the training provider, backend, or pipeline location in the interface. Keep progress messages generic and preserve batch names.

**Why:** The user said the model is the only training detail users need; provider and pipeline details are proprietary.

**How to apply:** Show model identifiers when users choose a training model; keep provider/backend names and pipeline location out of user-visible copy. Do not rename batches or change generation models. When a model call fails, the UI says only "That didn't work! Please try again." — never the model name or backend logic (formatAIErrorMessage enforces this).
