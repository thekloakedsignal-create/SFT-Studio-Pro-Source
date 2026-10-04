---
name: Document conversion intent
description: User's intended behavior for transcript, knowledge, and literature conversion.
---

Knowledge and literature synthesize grounded training examples. Transcript mode instead copies dialogue exactly, stripping metadata according to user-provided speaker tags; it must not call AI to rewrite dialogue.

**Why:** The user clarified Transcript behavior: “Copies transcript exactly as is stripping meta data according to user tags.” This supersedes the earlier synthesis requirement for transcripts only.

**How to apply:** Keep Knowledge conversion unchanged. Transcript wording must survive saving and reloading without generation-oriented prose cleanup. Keep this work separate from batch generation.

For Knowledge and Literature, typed user conversion instructions are the highest-priority content directions. For Transcript only, preserve exact dialogue and apply extraction/metadata removal, never rewriting.

**Why:** The user confirmed “No—preserve exact dialogue; apply only extraction and metadata-removal instructions” and clarified “For transcript converter only. If knowledge or literature setting user instruction is highest priority.”

**How to apply:** Put Knowledge/Literature instructions in the provider's system instructions, overriding default content/style preferences. Keep Transcript cleanup deterministic; do not introduce an AI rewriting or instruction-planning path. Make minimal scoped fixes, not converter redesigns.

The document converter offers Single Turn, Multi Turn, and Mixed only—not Reasoning.

**Why:** The user explicitly asked to remove the Reasoning option from the converter while keeping the repair confined to document conversion.

**How to apply:** Leave Reasoning generation elsewhere unchanged; do not reintroduce converter reasoning controls based on the project's selected template.