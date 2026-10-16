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

Training sessions, job tracking, saved models, and chat trials must use the same SQL database as projects; the earlier instruction to retain Firestore does not apply to these features.

**Why:** The user explicitly requested “Put them all on SQL without breaking or changing the workflows” after the split between SQL, local files, and unavailable Firestore blocked completion updates and chat.

**How to apply:** Keep Firebase configuration intact for unrelated code, but do not reconnect Firestore or restore file-based persistence for training/chat. Preserve account ownership during legacy imports.

The user subsequently chose Clerk Auth and authorized consolidating their two accounts' successful training runs under their primary login, without changing the surrounding workflows.

**Why:** The user explicitly confirmed the provider switch and requested both successful runs in one account.

**How to apply:** Follow the reviewed Clerk migration process. Preserve existing project-owner IDs through the identity bridge; limit training ownership reconciliation to the specifically authorized successful runs, not all jobs visible through the provider key.
