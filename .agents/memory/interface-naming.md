---
name: Interface naming
description: Scope of model and backend naming removal from the interface.
---

Never display model, provider, or backend information anywhere in the interface. Keep progress messages generic and preserve batch names.

**Why:** The user explicitly said never to add model information to the interface.

**How to apply:** Use generic progress and status wording without exposing model/provider/backend details. Do not rename batches or change generation models. When a model call fails, the UI says only "That didn't work! Please try again." — never the model name or backend logic (formatAIErrorMessage enforces this).
