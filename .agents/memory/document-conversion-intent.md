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

Clearing a document resets the converter and its displayed result so another document can be converted. Keep approved and pending conversion batches saved; delete the current conversion batch if it was rejected.

**Why:** The user clarified that Clear Document is meant to prepare the converter for another document, not merely dismiss the review card.

**How to apply:** Clear the document inputs and active converter result. Do not remove approved or pending batches from shared project data. Delete a rejected converter batch through the existing batch-delete path.

User-typed conversion instructions apply to every generated conversation and override document-analysis guidance. Literature defaults to storytelling. Knowledge and Literature use the project definition and target the example count displayed in analysis.

**Why:** The user explicitly clarified the instruction precedence and Literature's storytelling default.

**How to apply:** Pass current instructions, project context, and analysis to each synthesis and refill request. Keep source grounding and the selected template; never fabricate examples to fill a count.