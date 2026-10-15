---
name: QA scope
description: User requirement to retain semantic assessment while detecting format and template defects.
---

QA must catch formatting errors and template anomalies as well as assess semantic quality.

**Why:** The user said the semantic assessment is good but QA “needs to do both.”

**How to apply:** Keep both sources of findings in the existing QA report and scoring. Inspect raw examples without silently sanitizing away defects. Keep audit changes confined to QA, not generation or conversion.

QA must distinguish substantive defects from minor stylistic preferences. Do not make small wording or formatting nits imply that an otherwise useful example is bad, while continuing to flag meaningful factual, instruction-following, persona, and structural failures.

**Why:** The user said QA currently makes almost all app-generated content look unusable, but should not become permissive either.

**How to apply:** Treat low-impact observations as suggestions or small deductions rather than automatic failures; reserve flags and severe score reductions for consequential defects.

Clean role/content messages are valid before export; do not require serialized Alpaca, Mistral, or ChatML delimiters just because that export format is selected.

**Why:** Requiring export-only markers would falsely flag valid structured training examples. When markers are present, their structure and compatibility still need checking.

**How to apply:** Distinguish actual message-boundary delimiters from literal mentions of template tokens inside ordinary prose or code.

QA “Regenerate Flagged” must send concurrent individual requests, preserving each original example's template (including its Single Turn/Multi Turn layout within Mixed). Keep repair slots continuously occupied rather than waiting for whole groups to finish. Change only flagged assistant responses using the original project/batch instructions and QA recommended fixes; do not regenerate unflagged examples. For invalid formats, allow structural repairs, including merging duplicate assistant turns and reconstructing missing user prompts, rather than preserving the broken message layout.

**Why:** The user requested concurrent requests “the same way other batches do in the template of the original example” and a 100% UI score after all flagged responses are fixed. They clarified that regeneration must reformat examples with double assistant responses or missing user prompts, and later asked to increase repair concurrency because it was too slow.

**How to apply:** Preserve user/system messages unless correcting their invalid format or placement is necessary; retain failed items as flagged, save repairs and the updated report before showing completion, and show 100% only after every flagged item was successfully repaired. Snapshot project instructions for new batches; older batches lack historical project settings, so use their original system messages and stored batch instructions with current project settings where necessary.