---
name: Registry QA gate
description: User's minimal Registry inclusion and final formatting requirements.
---

QA-checked batches are selectable and initially checked in the Registry as-is. Batches without a QA check are greyed out and cannot be selected, with a short prompt to run QA. Do not introduce a passing-score or zero-issues requirement.

**Why:** The user explicitly requested checked batches “as is,” plus disabled unchecked batches and one final JSONL formatting check after template conversion.

**How to apply:** Gate final output on completion of QA, keep explicit rejection excluded, and validate the selected output schema without rewriting examples or changing generation, conversion, or QA algorithms.
