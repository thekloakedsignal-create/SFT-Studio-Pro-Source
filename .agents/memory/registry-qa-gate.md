---
name: Registry QA gate
description: User's minimal Registry inclusion and final formatting requirements.
---

QA-checked batches are selectable and initially checked in the Registry as-is. Batches without a QA check are greyed out and cannot be selected, with a short prompt to run QA. Do not introduce a passing-score or zero-issues requirement.

The template-format preview in the Registry should show only a small sample (2–3 records), not serialize or render the full dataset.

**Why:** The user explicitly requested checked batches “as is,” plus disabled unchecked batches and one final JSONL formatting check after template conversion.

**Why:** The user clarified that the format preview exists only to inspect a few examples; large datasets must not be rendered into the page.

**How to apply:** Gate final output on completion of QA, keep explicit rejection excluded, validate the selected output schema without rewriting examples or changing generation, conversion, or QA algorithms, and keep the rendered format preview to 2–3 sample records.

Apply the user's supplied corpus-cleansing rules only to finalized export/upload copies: normalize curly quotes, strip markup, and collapse whitespace while retaining required template delimiters and reasoning fields.

**Why:** The user supplied the cleansing script and explicitly restricted its integration to the final dataset before export or training, without rewriting existing logic.

**How to apply:** Keep stored examples, generation, and training workflow unchanged; use the existing final-output boundary rather than adding a new API/service.
