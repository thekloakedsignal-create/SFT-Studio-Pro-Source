---
name: Keep saved projects separate from generation
description: Preserve deliberate project loading; do not feed local batch caches into generation.
---

Preserve saving and deliberate loading of saved projects, including browser and server-local copies. Do not automatically reopen cached projects or use stored batch examples as generation input or replacement output.

**Why:** The user identified local storage as the repetition source and instructed not to investigate that cause again. They corrected the overly broad removal of saved-project loading: their restriction concerns generation, not opening saved work.

**How to apply:** Keep the project list and explicit project selection functional across storage types. Keep generation independent of cached batch outputs, and leave automatic cache migration/restoration disabled.
