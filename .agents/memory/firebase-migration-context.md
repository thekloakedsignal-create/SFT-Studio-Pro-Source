---
name: Firebase migration context
description: The app's original Google Studio migration and Firebase database context.
---

This app was migrated from Google Studio with a Firebase database.

**Why:** the user asked me to remember this.

**How to apply:** Treat Firebase as an existing database when diagnosing or changing persistence; distinguish it from any separate SQL or local-file paths.
Sign-in moved from Firebase Auth to Replit Auth on 2026-10-15; Firestore and the Firebase config stay. Replit sign-ins reuse the existing account ID matched by email, and the owner's Replit email is aliased to the owner email.
**Why:** the user asked to switch auth without breaking anything and to keep the Firebase keys.

Keep the owner's account identity stable across sign-ins and normalize existing sessions to that same identity; never derive it from the deployment's mutable local user cache.
**Why:** Production held the saved batches, but a later sign-in selected a different account ID and hid them. A successful save does not prove that the next session can load the same records.
**How to apply:** Preserve the existing project owner ID rather than moving projects or relaxing access checks. Keep this correction backend-only.

The browser Firebase configuration does not authorize server-side Firestore access; the Replit server needs a Firebase Admin credential for saved models and chat-trial records.
**Why:** These requests failed with missing Application Default Credentials even while SQL-backed projects loaded correctly.
**How to apply:** Diagnose Firestore credentials separately from Replit sign-in and SQL storage. Do not replace Firestore or reset trial records to hide credential failures.
