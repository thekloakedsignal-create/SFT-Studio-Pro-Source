---
name: Document conversion intent
description: User's intended behavior for transcript, knowledge, and literature conversion.
---

Analyze source documents and synthesize grounded training examples for all three types: transcript, knowledge, and literature. Do not require existing formatted examples or speaker-labeled Q&A, and do not silently substitute verbatim extraction when synthesis fails.

**Why:** The user explicitly corrected the converter: “It should analyze a document and convert it not look for already formatted examples,” and asked that all three types be understood and fixed.

**How to apply:** Interpret transcript discussions, knowledge facts and procedures, and literary narratives according to their different purposes. Preserve source meaning, avoid invented details, and do not silently skip sections of long documents. Keep this work separate from batch generation.