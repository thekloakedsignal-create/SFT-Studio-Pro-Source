---
name: Model chat trial
description: User-approved limits and cleanup cadence for the one-time trained-model chat trial.
---

The free model chat trial is available once per account. Start its 15-minute clock when the trained model is ready to chat. The user chose a cleanup worker that runs every 10 minutes and accepted the corresponding shutdown delay.

**Why:** The user prefers a lower-frequency cleanup job over an always-on worker.

**How to apply:** Keep the chat disabled after its 15-minute session expires. The scheduled cleanup must work even if the browser tab closes or the app server restarts. Do not expose hosting/provider details in the UI.

Do not change cleanup script logic when repairing automated training, job updates, or model-chat loading.

**Why:** The user explicitly restricted these repairs to the training and chat flow.

**How to apply:** Preserve cleanup behavior and its access to trial records. The user subsequently authorized moving training and chat storage to SQL, including cleanup's database access, without changing workflows or cleanup timing/shutdown rules.

Paid continuation is a separate endpoint and paygate; leave the free-trial route unchanged. Save conversation history through direct account-scoped UI requests so it follows the account across devices; do not intercept trial requests. Each balance load may be any amount of at least $5. Meter Qwen at $0.25/minute and Llama at $0.50/minute starting when the endpoint is ready. Users can stop it; automatically stop at zero, and keep any unused balance for later. Do not refund prepaid payments.

**Why:** The user explicitly corrected the fixed-$5-credit interpretation and prohibited edits to the existing trial code and middleware interception.

**How to apply:** Preserve the free trial independently. Keep billing usage-based against a persistent wallet, not a fixed purchase plan or up-front reservation.
