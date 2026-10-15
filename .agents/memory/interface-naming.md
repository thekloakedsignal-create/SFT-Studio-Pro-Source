---
name: Interface naming
description: Scope of model and backend naming removal from the interface.
---

Do not display generation-model, provider, or backend details in the interface. Keep progress messages generic and preserve batch names. In the automated trainer, the user-selected training model and named Hugging Face output remain visible; do not mention Together AI or expose unnecessary technical details. Show the job status received from the provider.

**Why:** The user explicitly forbids generation-backend labels and reiterated that the automated trainer should not mention its provider or disclose unnecessary information. They separately requested a training-model choice and a named Hugging Face output link.

**How to apply:** Use generic progress and status wording without exposing model/provider/backend details. Do not rename batches or change generation models.
