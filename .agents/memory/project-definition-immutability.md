---
name: Project definition immutability
description: A locked project definition is never rewritten by presets or anything else; the golden exemplar is never seeded from stock text.
---

Once a project definition is locked, it stays for that project exactly — presets, sign-in flows, onboarding shortcuts, or any other code path must never rewrite any of its fields.

**Why:** The user, in their words: "Whatever is locked in the project definition is NEVER rewritten by a preset. Or anything else for that matter. Whatever gets locked in project definition stays for that project exactly. PERIOD." Presets "have no business whatsoever anywhere beyond the UI."

**How to apply:** The golden exemplar (representativePrompt/representativeCompletion) is never populated from preset stock text or any default — it stays as the user wrote it, or empty. New unlocked drafts may be prefilled from presets as a UI convenience for other fields, but never the exemplar. Any code path that writes project definition fields must respect the locked state without exception.
