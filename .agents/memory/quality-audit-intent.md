---
name: QA scope
description: User requirement to retain semantic assessment while detecting format and template defects.
---

QA must catch formatting errors and template anomalies as well as assess semantic quality.

**Why:** The user said the semantic assessment is good but QA “needs to do both.”

**How to apply:** Keep both sources of findings in the existing QA report and scoring. Inspect raw examples without silently sanitizing away defects. Keep audit changes confined to QA, not generation or conversion.

Clean role/content messages are valid before export; do not require serialized Alpaca, Mistral, or ChatML delimiters just because that export format is selected.

**Why:** Requiring export-only markers would falsely flag valid structured training examples. When markers are present, their structure and compatibility still need checking.

**How to apply:** Distinguish actual message-boundary delimiters from literal mentions of template tokens inside ordinary prose or code.