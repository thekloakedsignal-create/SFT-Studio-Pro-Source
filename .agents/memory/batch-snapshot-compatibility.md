---
name: Batch snapshot compatibility
description: Why whole-project snapshots cannot be treated as authoritative batch replacements.
---

Maintain compatibility with whole-project saves while treating newer incremental batch writes and explicit deletions as authoritative.

**Why:** A browser can stay open on an older project snapshot while generation finishes or a different client edits/deletes a batch. Replacing saved batches with that snapshot can lose completed work or resurrect deleted data. Array length does not establish freshness.

**How to apply:** When changing persistence, test a delayed whole-project save after an incremental save and after deletion. Do not remove deletion protection merely because current frontend code appears to send fresh snapshots.