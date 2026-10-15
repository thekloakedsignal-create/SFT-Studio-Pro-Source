import { ArrowLeft, ArrowRight, X } from "lucide-react";
import type { ReactNode } from "react";

export type DocumentGuideProgress = {
  step: number;
  hasTranscripts?: boolean;
};

type Props = {
  progress: DocumentGuideProgress;
  onChange: (progress: DocumentGuideProgress) => void;
  onClose: () => void;
  onComplete: () => void;
  canAdvance: boolean;
  children: ReactNode;
};

const titles = [
  "Prepare your document",
  "Choose the conversion type",
  "Label the speakers in a transcript",
  "Add your conversion instructions",
  "Convert the document",
  "How to generate your document batches",
];

// Source: the project's documentation, Part Three — Document Converter.
export function DocumentGuide({ progress, onChange, onClose, onComplete, canAdvance, children }: Props) {
  const step = Math.max(0, Math.min(titles.length - 1, progress.step));
  const buttonClass = "rounded-lg border border-purple-400 bg-purple-300 px-3 py-2 text-sm !font-bold !text-black hover:bg-purple-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-700";
  return (
    <section aria-label="Document conversion guide" className="rounded-xl border border-purple-300 bg-[#f5f1e8] p-4 sm:p-5 !text-black space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs !font-bold !text-black">Document Guide · Step {step + 1} of {titles.length}</p>
          <h3 className="mt-1 text-base !font-bold !text-black" aria-live="polite">{titles[step]}</h3>
        </div>
        <button type="button" onClick={onClose} aria-label="Close document guide" className="rounded-lg p-2 !text-black hover:bg-purple-200">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="rounded-lg border border-[#c4c4c4] bg-[#e5e5e5] p-4 text-sm leading-relaxed !text-black space-y-3">
        {step === 0 && <>
          <p>The Document Converter turns material you already have into training examples for your model. Use it for knowledge documents, conversations, or literature.</p>
          <p>After this guide, upload or paste one document at a time in the Document Converter.</p>
          <p className="!font-bold">Do any of your documents contain transcripts or conversations?</p>
          <div className="flex flex-wrap gap-2">
            {[true, false].map(answer => (
              <button
                key={String(answer)}
                type="button"
                aria-pressed={progress.hasTranscripts === answer}
                onClick={() => onChange({ ...progress, hasTranscripts: answer })}
                className={`${buttonClass} ${progress.hasTranscripts === answer ? "ring-2 ring-purple-700" : ""}`}
              >{answer ? "Yes" : "No"}</button>
            ))}
          </div>
          {progress.hasTranscripts === true && <p>Transcripts can help carry a persona into training because they preserve examples of how that persona actually speaks and responds. Choose conversations that demonstrate the identity and voice you want, and identify who is speaking in each turn.</p>}
        </>}
        {step === 1 && <>
          <p>Choose the type that matches the document you have loaded:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Knowledge:</strong> for manuals, reference material, or other factual documents. The converter creates knowledge-focused training examples from the source.</li>
            <li><strong>Transcript:</strong> for conversations with identifiable speakers. The converter copies the dialogue using your speaker labels and removes metadata; it does not rewrite the speakers’ words.</li>
            <li><strong>Literature:</strong> for stories and other literary material. Use instructions to describe how the source should be handled.</li>
          </ul>
          <p>Select the matching type in the Document Converter. Conversion does not start here.</p>
        </>}
        {step === 2 && <>
          <p>If you chose Knowledge or Literature, there are no speaker labels to enter. You can continue to the next step.</p>
          <p>Transcripts must be labeled documents: each speaker’s turn must begin with an identifiable label. Find the labels used in your source and enter the first speaker’s label in <strong>User / Speaker 1 Tag</strong> and the responding speaker’s label in <strong>Assistant / Speaker 2 Tag</strong>. If the source has no labels, label its turns before uploading it.</p>
          <p>For example, if the source uses “Human” and “Assistant”, enter those labels. If it uses names, enter the names exactly as written. Map the voice you want the model to learn to the assistant role.</p>
          <p>Transcripts need no conversion instructions. The converter removes metadata and uses the labeled turns to create turn-by-turn examples, retaining the dialogue as written.</p>
          <p>Under <strong>Transcript Dialogue Layout</strong>, choose <strong>Single-Turn Pairs (Q&amp;A)</strong> for separate question-and-answer examples, or <strong>Multi-Turn Dialogue</strong> to keep consecutive exchanges together.</p>
        </>}
        {step === 3 && <>
          <p>For Knowledge and Literature, enter your instructions in <strong>Custom Conversion &amp; Style Instructions</strong> in the Document Converter.</p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Knowledge:</strong> specify the material to focus on and the depth of explanation you want. The optional focus prompt can narrow the subject.</li>
            <li><strong>Literature:</strong> describe how you want the literary source handled. Review the <strong>Literature User Prompt Pattern</strong> if you want to control how story requests are phrased.</li>
            <li><strong>Transcript:</strong> no instructions are needed or generated. Only the labeled speaker turns are used for conversion after metadata is removed.</li>
          </ul>
          <p>For Knowledge or Literature, review the converter’s output-template selection: Single Turn, Multi Turn, or Mixed. Single Turn creates separate exchanges; Multi Turn creates conversations; Mixed combines both.</p>
        </>}
        {step === 4 && <>
          <p>After this guide, upload or paste your document in the Document Converter, choose its conversion type, and enter either its instructions or its transcript speaker labels.</p>
          <p>For Knowledge or Literature, review <strong>Optimal SFT Examples Estimated</strong> and its explanation. Use <strong>Re-Analyze</strong> if you need the source analyzed again. Transcript mode retains matched dialogue rather than generating to that estimated count.</p>
          <p>When everything is ready, click <strong>Convert Document to SFT</strong> in the converter below. Wait for that document’s conversion to finish before loading the next one.</p>
          <p>Loading a document only fills the form. It does not start conversion. Process one document at a time.</p>
        </>}
        {step === 5 && <>
          <p>A batch is the group of training examples created from one conversion. Here is how to create each batch in the Document Converter:</p>
          <ol className="list-decimal pl-5 space-y-3">
            <li>Upload or paste one document in the <strong>Document Converter</strong>. This fills the form; it does not start conversion.</li>
            <li>Check the document text and conversion type. <strong>Knowledge</strong> is for factual source material; <strong>Literature</strong> is for literary material; <strong>Transcript</strong> is for labeled conversations.</li>
            <li>For <strong>Knowledge or Literature</strong>, enter your conversion instructions, select Single Turn, Multi Turn, or Mixed, and click <strong>Re-Analyze</strong> to get an example-count estimate for this document. Review the analysis and confirm that the selected conversion type still matches your source.</li>
            <li>For <strong>Transcript</strong>, check that both speaker tags match the labels in your document. Choose <strong>Single-Turn Pairs (Q&amp;A)</strong> or <strong>Multi-Turn Dialogue</strong>. No conversion instructions are needed: metadata is removed and the labeled dialogue is kept turn by turn.</li>
            <li>Click <strong>Convert Document to SFT</strong>. Generate one document batch at a time. Wait for it to finish before loading another document into the converter.</li>
            <li>Read the examples under <strong>Document Conversion Review &amp; Approval</strong>. Approve or reject the batch before moving on. For batches you keep, open <strong>AI Quality Assessment</strong>, select the batch, and click <strong>Run AI Quality Audit</strong>. Review it in QA before including it in the Data Registry.</li>
            <li>When you are done with that document, upload or paste the next one and repeat from step 1.</li>
          </ol>
          <p>When you are ready, click <strong>Done</strong> below to close the guide and use the Document Converter. No conversion starts automatically.</p>
        </>}
      </div>

      {children}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" disabled={step === 0} onClick={() => onChange({ ...progress, step: step - 1 })} className={`${buttonClass} inline-flex items-center gap-1 disabled:opacity-50`}>
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        {step < titles.length - 1
          ? <button type="button" disabled={!canAdvance} onClick={() => onChange({ ...progress, step: step + 1 })} className={`${buttonClass} inline-flex items-center gap-1 disabled:opacity-50`}>Next <ArrowRight className="h-4 w-4" /></button>
          : <button type="button" disabled={!canAdvance} onClick={onComplete} className={`${buttonClass} disabled:opacity-50`}>Done</button>}
      </div>
      <a
        href="https://thekloakedsignal-create.github.io/sft-pro-docs/part-three-document-converter.html"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block text-xs !font-bold !text-purple-900 underline"
      >Read the Document Converter documentation</a>
    </section>
  );
}
