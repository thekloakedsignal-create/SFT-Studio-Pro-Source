---
name: Local storage is save-only
description: Local project and batch copies must not be restored into active data.
---

The user directed: “Batches should save to storage. Never pull from it.” This refers to local storage. Preserve local saves, but do not restore or merge browser or server-local project/batch copies into active state or database records.

**Why:** The user identified local storage as the source of repetitive batch themes and explicitly instructed not to investigate that cause again.

**How to apply:** Keep normal database persistence and deliberate project loading. Local copies are output-only backups; they must not supply settings, examples, or generation inputs. Do not restore old cache migration or offline recovery behavior.
