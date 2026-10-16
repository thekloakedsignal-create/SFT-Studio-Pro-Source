---
name: Training provider compatibility
description: Together completion identifiers and the shared schema push limitation.
---

Together can return a completed job with its model registry ID but no project ID. Resolve the project from the authenticated provider identity, not the model-name prefix.

**Why:** A real completed job omitted the project ID; treating that as an unavailable model prevented chat from appearing.

**How to apply:** Keep provider project identity distinct from application project IDs. Configuration lookup is project-scoped with a reference-model filter; a model-nested configurations URL returned 404.

The filtered Drizzle push can still attempt to remove serial sequences belonging to unrelated project tables.

**Why:** A development schema push failed while trying to drop the users serial sequence despite the table filter.

**How to apply:** Never force or cascade that change. Use a narrowly scoped development schema addition when necessary; production schema changes remain owned by Publish.
