---
name: Document conversion intent
description: User's intended behavior for transcript, knowledge, and literature conversion.
---

Knowledge and literature synthesize grounded training examples. Transcript mode instead copies dialogue exactly, stripping metadata according to user-provided speaker tags; it must not call AI to rewrite dialogue.

**Why:** The user clarified Transcript behavior: “Copies transcript exactly as is stripping meta data according to user tags.” This supersedes the earlier synthesis requirement for transcripts only.

**How to apply:** Keep Knowledge conversion unchanged. Transcript wording must survive saving and reloading without generation-oriented prose cleanup. Keep this work separate from batch generation.

The document converter offers Single Turn, Multi Turn, and Mixed only—not Reasoning.

**Why:** The user explicitly asked to remove the Reasoning option from the converter while keeping the repair confined to document conversion.

**How to apply:** Leave Reasoning generation elsewhere unchanged; do not reintroduce converter reasoning controls based on the project's selected template.

Keep document analysis brief on the UI.

**Why:** The user explicitly requested brief visible analysis when discussing reuse of the pre-generation document analysis.

**How to apply:** Keep any detailed coverage plan internal; do not expand the displayed analysis into that plan.

Preserve the existing document extractor when changing analysis or generation.

**Why:** The user objected when image OCR extraction was temporarily removed while adding the Maverick reading stage.

**How to apply:** Removing duplicate AI analysis must not remove or bypass image OCR, PDF text extraction, or Word extraction.