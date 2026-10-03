---
name: Architecture change scope
description: The user's standing constraint on changes to this app.
---

For this app, the architecture is deliberate and particular. Make only changes the user explicitly requested; do not infer a "helpful" fix or expand scope without approval. An incorrect assumption or unapproved change could break the workflow.

**Why:** The user stated this directly and asked the agent to stay on task.

**How to apply:** Keep code changes limited to the stated request. If the correct implementation depends on an unstated architectural choice, ask rather than guessing.