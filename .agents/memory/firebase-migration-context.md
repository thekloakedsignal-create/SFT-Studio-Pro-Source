---
name: Database migration context
description: Use the existing PostgreSQL database, not legacy Firebase dependencies.
---

The user explicitly corrected: "We aren't using Firebase. ... We have our own database."
Use the existing PostgreSQL database for application persistence, including training history, saved models, and chat trials. Firebase configuration and imports are legacy leftovers, not evidence that Firebase is intended.

**Why:** The previous migration left Firebase calls behind; requesting Firebase credentials contradicted the user's completed database transition.
**How to apply:** Remove residual Firebase dependencies from affected features instead of requesting Firebase credentials or adding a storage fallback. Keep Replit Auth and existing account ownership.

Keep the owner's account identity stable across sign-ins and normalize existing sessions to that same identity; never derive it from the deployment's mutable local user cache.
**Why:** Production held the saved batches, but a later sign-in selected a different account ID and hid them. A successful save does not prove that the next session can load the same records.
**How to apply:** Preserve the existing project owner ID rather than moving projects or relaxing access checks. Keep this correction backend-only.

