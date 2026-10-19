---
name: Model chat trial
description: User-approved limits, cleanup cadence, and endpoint teardown rule for the one-time trained-model chat trial.
---

The free model chat trial is available once per account. Start its 15-minute clock when the trained model is ready to chat. Cleanup runs every 10 minutes (in-process timer in the API server, plus a check on every status poll) and the standalone script remains for a scheduled job.

**Why:** The user prefers a lower-frequency cleanup job over an always-on worker. A scheduled deployment was never actually set up in an earlier session, so an endpoint ran for 80+ minutes until the provider cut it off; the in-server timer was added on 2026-10-19 so cleanup runs without a separate publish.

**How to apply:** Keep the chat disabled after its 15-minute session expires. Do not expose hosting/provider details in the UI.

Ending a trial must DELETE the provider endpoint, never scale it to zero.

**Why:** The user stated scaling to zero does not stop billing on this provider ("it's not RunPod — you delete it").

**How to apply:** Any teardown path (expiry, failure, start-error rollback, cleanup script) issues DELETE on the endpoint; treat 404 as already deleted. Starting a trial first checks the provider for an existing `sft-chat-` endpoint and refuses if one exists, since workspace and production share the provider key but not the database lock.
