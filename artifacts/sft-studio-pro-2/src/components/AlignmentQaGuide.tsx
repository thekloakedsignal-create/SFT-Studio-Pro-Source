import { useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";

type Props = {
  page: "triad" | "assess";
  onClose: () => void;
};

const guides: Record<Props["page"], { title: string; documentation: string; steps: { title: string; content: ReactNode }[] }> = {
  triad: {
    title: "Optional TRiAD Alignment Guide",
    documentation: "part-four-ftk-corpus.html",
    steps: [
      {
        title: "Decide whether to include alignment examples",
        content: <>
          <p>TRiAD Alignment adds a pre-generated alignment corpus to your training data. These are existing examples, not newly generated batches or documents you upload.</p>
          <p>This section is entirely optional. You can close this guide and skip TRiAD Alignment without importing anything.</p>
          <p>If you choose to include it, we recommend <strong>750 examples</strong>.</p>
        </>,
      },
      {
        title: "Check your project definition",
        content: <>
          <p>Make sure your Project Definition has been saved and locked. If the import button says <strong>Import Locked (Save &amp; Lock First)</strong>, return to Project Definition, review it, and save and lock it.</p>
          <p>Review the system prompt shown on the TRiAD page. The import adds your project’s system prompt to every alignment example while preserving the source dialogue.</p>
        </>,
      },
      {
        title: "Select 750 examples",
        content: <>
          <p>Under <strong>Maximum Import Size</strong>, select <strong>750</strong>. This is the recommended size.</p>
          <p>The page also offers 150 and 300 examples, but our recommendation is 750. Review the displayed project template; a locked instruction format follows your Project Definition.</p>
          <p>You do not need to upload a file or paste a dataset link. This page uses the configured pre-generated alignment dataset.</p>
        </>,
      },
      {
        title: "Import the alignment batch",
        content: <>
          <p>Click <strong>Run Script &amp; Import</strong> on the TRiAD page. Wait while the button shows <strong>Importing Dataset...</strong>.</p>
          <p>The import adds the selected alignment examples to your project with its system prompt. Reading this guide does not start an import or training.</p>
        </>,
      },
      {
        title: "Review the imported examples",
        content: <>
          <p>Scroll to <strong>TRiAD Alignment Batch Review</strong> and read the imported examples. Check the system prompt and the user and assistant messages.</p>
          <p>The imported batch is marked approved automatically and appears selected in the Data Registry without requiring QA. Open QA only if you want to review it; a QA audit is not required for Registry inclusion.</p>
          <p>Click <strong>Done</strong> to close this guide. If you decide not to include alignment data, simply leave this optional section without importing.</p>
        </>,
      },
    ],
  },
  assess: {
    title: "QA Guide",
    documentation: "part-five-quality-assurance.html",
    steps: [
      {
        title: "Understand what QA checks",
        content: <>
          <p>Quality Assurance (QA) reviews a batch of training examples for formatting, template, structure, and content or persona issues. It flags potentially problematic examples and explains each flag in writing.</p>
          <p>Every batch other than TRiAD Alignment must be analyzed in QA before it can be selected in the Data Registry. TRiAD Alignment batches are automatically approved and selected on import; they do not require QA. QA analyzes examples; it is not a question-and-answer interview.</p>
        </>,
      },
      {
        title: "Select and analyze one batch",
        content: <>
          <p>Choose the batch you want to review from <strong>Active Registry Batch</strong>. If no batches are available, first create or import one in the studio.</p>
          <p>Click <strong>Run AI Quality Audit</strong> and wait for the analysis to finish. Review the <strong>Audit Score</strong> and <strong>Batch Assessment Summary</strong>.</p>
        </>,
      },
      {
        title: "Read each flag and its explanation",
        content: <>
          <p>Read <strong>Flagged SFT Compliance Issues</strong> for the reason and severity of each flag, then review <strong>AI Synthesis Suggestions</strong>.</p>
          <p>In <strong>SFT Dataset Inspect &amp; Inline Editor</strong>, choose <strong>Flagged Items</strong> to inspect the examples in question. Choose <strong>All Examples</strong> to see the rest of the batch.</p>
          <p>Compare each flagged example with what you want your model to learn. You decide whether it needs to be regenerated, removed, or kept.</p>
        </>,
      },
      {
        title: "Regenerate examples you want to improve",
        content: <>
          <p>Click <strong>Regenerate Flagged</strong> to generate replacements for flagged examples. The replacements are analyzed again. Wait for the process to finish, then review the updated results.</p>
          <p>Some examples may remain flagged or be flagged again if the issue was not resolved. You can repeat <strong>Regenerate Flagged</strong> as needed.</p>
          <p>You may work toward a 100% score if you wish, but a perfect score is not required to approve a batch.</p>
        </>,
      },
      {
        title: "Remove flagged examples if you prefer",
        content: <>
          <p>If you want to discard flagged examples instead of regenerating them, click <strong>Deduplicate Dataset</strong> and read the confirmation before accepting.</p>
          <p><strong>This deletes all flagged examples and duplicate entries from the batch.</strong> It does not repair them, and the deletion cannot be undone through that action.</p>
          <p>After removing examples, run <strong>Run AI Quality Audit</strong> again to check the remaining batch. Skip removal if you want to keep or regenerate the flagged examples.</p>
        </>,
      },
      {
        title: "Approve or reject, then repeat",
        content: <>
          <p>After reviewing the audit, click <strong>Approve</strong> to keep the batch for your dataset, or <strong>Reject</strong> to exclude it.</p>
          <p>You may leave flags in place and approve a batch if you have reviewed the explanations and believe the examples meet your intent. You have the final say; a 100% score is not required.</p>
          <p>Select the next batch from <strong>Active Registry Batch</strong> and repeat the process. Select QA-reviewed and approved batches in the <strong>Data Registry</strong>. TRiAD Alignment batches are already selected there when imported; you can uncheck them if you do not want to include them.</p>
          <p>Click <strong>Done</strong> to close this guide. No audit, regeneration, deletion, or approval runs automatically.</p>
        </>,
      },
    ],
  },
};

export function AlignmentQaGuide({ page, onClose }: Props) {
  const [step, setStep] = useState(0);
  const guide = guides[page];
  const current = guide.steps[step];
  const buttonClass = "rounded-lg border border-purple-400 bg-purple-300 px-3 py-2 text-sm !font-bold !text-black hover:bg-purple-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-700";

  return (
    <section aria-label={guide.title} className="kk-reading-guide mb-5 rounded-xl border border-purple-300 bg-[#f5f1e8] p-4 sm:p-5 !text-black space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs !font-bold !text-black">{guide.title} · Step {step + 1} of {guide.steps.length}</p>
          <h3 className="mt-1 text-base !font-bold !text-black" aria-live="polite">{step + 1}. {current.title}</h3>
        </div>
        <button type="button" onClick={onClose} aria-label="Close guide" className="rounded-lg p-2 !text-black hover:bg-purple-200"><X className="h-4 w-4" /></button>
      </div>
      <div className="rounded-lg border border-[#c4c4c4] bg-[#e5e5e5] p-4 text-sm leading-relaxed !text-black space-y-3">{current.content}</div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" disabled={step === 0} onClick={() => setStep(step - 1)} className={`${buttonClass} inline-flex items-center gap-1 disabled:opacity-50`}><ArrowLeft className="h-4 w-4" /> Back</button>
        {step < guide.steps.length - 1
          ? <button type="button" onClick={() => setStep(step + 1)} className={`${buttonClass} inline-flex items-center gap-1`}>Next <ArrowRight className="h-4 w-4" /></button>
          : <button type="button" onClick={onClose} className={buttonClass}>Done</button>}
      </div>
      <a href={`https://thekloakedsignal-create.github.io/sft-pro-docs/${guide.documentation}`} target="_blank" rel="noopener noreferrer" className="inline-block text-xs !font-bold !text-purple-900 underline">Read the {page === "triad" ? "TRiAD Alignment" : "QA"} documentation</a>
    </section>
  );
}
