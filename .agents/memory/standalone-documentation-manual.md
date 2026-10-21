---
name: Standalone documentation manual
description: Product requirement for a crawlable docs page alongside the embedded GitHub Pages guide.
---

Keep the existing GitHub Pages documentation iframe where it is. A separate standalone, scrapeable HTML manual should be accessible before and after sign-in, including from within the app.

**Why:** The user explicitly asked for a new regular page without replacing or moving the existing embedded documentation.

**How to apply:** When changing docs access or navigation, preserve the iframe and its URL; update the standalone manual separately.

The public manual opened from the login screen must contain the entire GitHub guide, not a summary, and use its purple, cream, and grey styling. Changes to this public documentation must not change anything inside the app.

**Why:** The user explicitly rejected the summary and mismatched colors and limited this work to the login-screen documentation.

**How to apply:** Copy the complete GitHub documentation content and styling into the public HTML manual; keep authenticated app screens and embedded documentation unchanged.
