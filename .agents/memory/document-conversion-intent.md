---
name: Document conversion intent
description: User's intended behavior for transcript, knowledge, and literature conversion.
---

Knowledge and literature synthesize grounded training examples. Transcript mode instead copies dialogue exactly, stripping metadata according to user-provided speaker tags; it must not call AI to rewrite dialogue.

**Why:** The user clarified Transcript behavior: “Copies transcript exactly as is stripping meta data according to user tags.” This supersedes the earlier synthesis requirement for transcripts only.

**How to apply:** Keep Transcript exact and separate converter changes from batch generation. Do not apply transcript-copy behavior to Knowledge or Literature.

Transcript parsing must accept common labeled transcript exports and remove platform, timestamp, header, and recording metadata without rewriting the spoken dialogue.

**Why:** The user reported that ordinary transcripts are rejected and metadata is not removed reliably.

**How to apply:** Improve speaker-label and metadata recognition within the transcript parser; keep transcript conversion verbatim and separate from AI synthesis.

Transcript layout choices are deliberate: Single Turn emits one example per complete user/assistant pair; Multi Turn keeps the conversation together as one example. Preserve the user's selection.

**Why:** The user clarified that a long transcript must not become one example when Single Turn is selected, and both layouts currently fail.

**How to apply:** Fix transcript parsing and pair extraction without changing the selected layout or defaulting to Multi Turn.

The Document Guide is instructions-only: ask about transcripts, explain what to do using the existing conversion instructions, then close. Do not upload or handle documents inside the guide. Transcripts need speaker labels, not instructions.

**Why:** The user explicitly replaced the earlier upload-enabled guide request with “Just give the instructions for document conversion and don't upload them in the guide.”

**How to apply:** Keep the numbered guidance and distinctions among Knowledge, Literature, and Transcript. Users upload documents directly in the existing converter. Limit these changes to the Document Guide; do not alter conversion logic or other guides.

The document converter offers Single Turn, Multi Turn, and Mixed only—not Reasoning.

**Why:** The user explicitly asked to remove the Reasoning option from the converter while keeping the repair confined to document conversion.

**How to apply:** Leave Reasoning generation elsewhere unchanged; do not reintroduce converter reasoning controls based on the project's selected template.

Knowledge and Literature conversion in the Document Converter must target the analyst-recommended count, use up to ten independent workers distributed across at least three generation models, and keep processing other examples when one request is slow or hung.

**Why:** The user requested concurrency of ten, at least three models generating, and explicitly said one hung example must not make the others wait.

**How to apply:** Keep this behavior only in Knowledge and Literature conversion. Preserve valid examples, existing timeout/retry policies, and completed-versus-target progress. Leave Transcript and all other generation features unchanged.

Document-converter (Knowledge/Literature) scheduling must mirror the regular batch generator exactly: the same 10-model lineup (getGenerationModels), up to 20 cycling workers, slots requeued before awaiting (first valid result wins), model rotation per attempt, immediate cycling on failure with no wait, and the same per-example timeouts (20s single-turn, 60s multi-turn).

**Why:** The user found the regular generator's concurrency/model-assignment/retry logic effective and explicitly asked for the same setup in the document converter — without touching the regular generators or converter-specific prompts.

**How to apply:** Apply only to the converter's scheduling/model/timeout configuration. Keep converter-specific prompts and the Literature 10-minute batch deadline separate. Transcript conversion is unaffected.