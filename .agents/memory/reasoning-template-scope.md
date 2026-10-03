---
name: Reasoning template scope
description: User-defined boundary for changes to SFT Reasoning batch generation.
---

For Reasoning-generation work, change only the Reasoning template and its tests. Do not alter Single Turn or Multi Turn prompts, schemas, or behavior. Keep the shared concurrent model schedule.

**Why:** The user explicitly set and reinforced this scope while correcting Reasoning generation.

**How to apply:** Confine prompt, schema, and validation changes to Reasoning-specific branches; do not change the shared model pool or scheduler.