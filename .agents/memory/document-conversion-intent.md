---
name: Document conversion intent
description: User's intended behavior for transcript, knowledge, and literature conversion.
---

Knowledge and literature synthesize grounded training examples. Transcript mode instead copies dialogue exactly, stripping metadata according to user-provided speaker tags; it must not call AI to rewrite dialogue.

**Why:** The user clarified Transcript behavior: “Copies transcript exactly as is stripping meta data according to user tags.” This supersedes the earlier synthesis requirement for transcripts only.

**How to apply:** Keep Transcript exact and separate converter changes from batch generation. Do not apply transcript-copy behavior to Knowledge or Literature.

The Document Guide must collect uploads temporarily, draft editable per-document instructions for Knowledge and Literature, and hand off a selectable, checkable document list like the suggested-batches display. Transcripts need speaker labels, not instructions. Show clear numbered batch-creation instructions before handoff.

**Why:** The user explicitly corrected the generic chat/static-guide interpretation and said transcripts remove metadata and use labeled turns to create turn-by-turn examples.

**How to apply:** Base guidance on the project's document site, preserve the distinction among all three conversion types, and keep handoff limited to filling the existing converter UI. Do not start conversion automatically or change its processing logic.

The document converter offers Single Turn, Multi Turn, and Mixed only—not Reasoning.

**Why:** The user explicitly asked to remove the Reasoning option from the converter while keeping the repair confined to document conversion.

**How to apply:** Leave Reasoning generation elsewhere unchanged; do not reintroduce converter reasoning controls based on the project's selected template.

Knowledge and Literature conversion in the Document Converter must target the analyst-recommended count. Keep valid examples, retry missing examples in concurrent sequential waves until the target is met, and show actual completed-versus-target progress.

**Why:** The user repeatedly limited this reliability change to the Document Converter and clarified that arbitrary retry caps or partial completion do not meet the request.

**How to apply:** Keep this behavior only in Knowledge and Literature conversion. Leave Transcript and all other generation features unchanged.