---
name: TRiAD import source
description: The required source and seed-data boundary for TRiAD dataset imports.
---

TRiAD dataset imports must use the user-provided dataset URL. Do not add embedded helpful/harmful DPO seed examples or fallback records.

**Why:** The user stated that the URL belongs in the import flow and the built-in DPO seeds do not.

**How to apply:** Preserve URL-based imports and reject missing or unusable sources instead of generating placeholder examples, falling back to bundled data, or repeating records.