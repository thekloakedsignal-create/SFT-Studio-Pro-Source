---
name: Batch snapshot compatibility
description: Why whole-project snapshots cannot be treated as authoritative batch replacements.
---

Maintain compatibility with whole-project saves while treating newer incremental batch writes and explicit deletions as authoritative.

**Why:** A browser can stay open on an older project snapshot while generation finishes or a different client edits/deletes a batch. Replacing saved batches with that snapshot can lose completed work or resurrect deleted data. Array length does not establish freshness.

**How to apply:** When changing persistence, test a delayed whole-project save after an incremental save and after deletion. Do not remove deletion protection merely because current frontend code appears to send fresh snapshots.

Never let a lightweight project-list batch summary replace a full batch loaded for the selected project just because their example counts match. Only a full batch containing its examples can supersede another full batch.

**Why:** List summaries omit examples and QA/status fields. Treating equal `examplesCount` as evidence of equivalent data can make loaded batches appear disabled and leave the training dataset empty.

**How to apply:** Keep summary and full-batch merge rules distinct in project loading; preserve the selected-project detail response when merging list metadata.