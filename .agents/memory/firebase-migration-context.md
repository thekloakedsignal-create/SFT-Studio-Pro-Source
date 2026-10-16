---
name: Firebase migration context
description: The app's original Google Studio migration and Firebase database context.
---

This app was migrated from Google Studio with a Firebase database.

**Why:** the user asked me to remember this.

**How to apply:** Treat Firebase as an existing database when diagnosing or changing persistence; distinguish it from any separate SQL or local-file paths.
Sign-in moved from Firebase Auth to Replit Auth on 2026-10-15; Firestore and the Firebase config stay. Replit sign-ins reuse the existing account ID matched by email, and the owner's Replit email is aliased to the owner email.
**Why:** the user asked to switch auth without breaking anything and to keep the Firebase keys.
