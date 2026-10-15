---
name: TRiAD import source
description: The required source and seed-data boundary for TRiAD dataset imports.
---

TRiAD dataset imports must use the user-provided dataset URL. Do not add embedded helpful/harmful DPO seed examples or fallback records. TRiAD Alignment batches contain preprinted imported outputs, not newly generated examples; exclude them when diagnosing generator output.

**Why:** The user stated that the URL belongs in the import flow and the built-in DPO seeds do not. The user also clarified on 2026-10-04 that TRiAD's preprinted outputs are imported data, not generated output.

**How to apply:** Preserve URL-based imports and reject missing or unusable sources instead of generating placeholder examples, falling back to bundled data, or repeating records. When investigating generated batches, distinguish them from batches sourced as TRiAD Alignment.

Present TRiAD as pre-generated alignment only, not a file uploader. Keep its dataset URL/path box hidden while preserving the configured sources and import behavior.

**Why:** The user explicitly clarified that TRiAD is pre-generated alignment and requested a UI-only explanation with the path box hidden.

**How to apply:** Retain batch-size and template controls; do not reintroduce upload instructions or change the underlying import functions.

The TRiAD guide is instructions-only, must call alignment optional, and must always recommend 750 examples.

**Why:** The user explicitly requested the same instructions-only experience as the Document Guide and specified “always suggest 750 examples.”

**How to apply:** Explain the existing import steps and close the guide when finished. Do not start an import, change the selected size, or alter processing logic from the guide.

TRiAD Alignment imports are auto-approved and eligible for the Data Registry without QA; they should be selected by default.

**Why:** The user explicitly approved this Registry exception and asked TRiAD batches to enter checked by default.

**How to apply:** Preserve the existing QA requirement for all non-TRiAD batches. Rejected TRiAD batches must remain excluded.