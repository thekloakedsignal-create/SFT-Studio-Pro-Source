---
name: PDF runtime verification
description: PDF worker resolution must be verified in the bundled running server.
---

Verify PDF extraction through the running, built API, not only direct library tests.

**Why:** Direct PDF library tests passed while the bundled server failed to find its PDF.js worker, preventing uploaded documents from reaching analysis.

**How to apply:** After parser or build changes, submit a generated PDF to the extraction endpoint and assert its returned text. Keep package-relative worker resolution intact.