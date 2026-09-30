---
name: SFT generation constraints
description: User's non-negotiable constraints for SFT model dispatch and the generation UI.
---

Use DigitalOcean Chat Completions for separate requests to the five configured models. Never use Model Synthesis. Preserve the existing templates, output schemas, selectable batch sizes, and surrounding UI; change only internal model scheduling and progress reporting when those are requested.

**Why:** The user explicitly ruled out Model Synthesis and objected to inferred changes to the app and its controls.

**How to apply:** Before changing SFT generation, inspect the current request path and templates. Keep model calls independent, and verify that the existing templates and batch-size choices remain unchanged.