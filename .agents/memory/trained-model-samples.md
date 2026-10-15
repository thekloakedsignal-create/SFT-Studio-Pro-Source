---
name: Trained model samples
description: One-time preview entitlement, explicit start, and hosting cleanup intent.
---

Each trained model gets one 15-minute chat, started only when its owner presses the sample button after training. Provisioning does not consume chat time.

**Why:** The user specified one sample per trained model, not per browser session, and explicitly required the button to start it.

**How to apply:** Never auto-deploy after training or reset the entitlement when the dialog closes. Keep provider names and technical identifiers out of the interface.

Keep the stopped endpoint as the durable one-use marker rather than deleting it.

**Why:** The user's workflow explicitly allows scaling both replica bounds to zero instead of deleting. Retaining the unique endpoint prevents repeat samples across server restarts without changing project storage.

**How to apply:** The backend enforces expiration and requests zero replicas; the provider's 30-minute idle shutdown is only an outage safety net, not the sample duration. The backend must be running for prompt expiration cleanup.
