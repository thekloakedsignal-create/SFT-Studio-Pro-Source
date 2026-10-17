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
