---
name: Project list payload limit
description: Why the saved-project list must never include batch example arrays in production.
---

The project list endpoint must return batch summaries only (counts, names, status), never example arrays.

**Why:** In production the list grew past the hosting proxy's response-size limit once batches were persisted to SQL. The app logged 200 while the proxy returned 5xx (visible only in path-level metrics, not app logs), the browser fetch failed, and the UI silently showed an empty project list. It looked like lost projects or an account-ID mismatch; the data was intact.

**How to apply:** Keep heavy data on the per-project detail route. When the list "disappears" in production but request logs show 200s, check payload size before account mapping. Watch single-project detail sizes too (largest was ~10 MB).
