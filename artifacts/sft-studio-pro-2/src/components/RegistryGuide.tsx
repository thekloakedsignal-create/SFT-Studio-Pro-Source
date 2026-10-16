import { useState } from "react";
import { ArrowLeft, ArrowRight, Cpu, Download, X } from "lucide-react";

type Props = {
  onClose: () => void;
  onOpenTrainer: () => void;
};

const exportSteps: { title: string; content: React.ReactNode }[] = [
  {
    title: "Approve your batches in QA",
    content: <>
      <p>Only batches that have completed a check in <strong>AI Quality Assessment</strong> can be included in your final dataset. Open the QA tab, select each batch, and run its audit before exporting.</p>
      <p>TRiAD Alignment batches are approved automatically on import and do not require QA.</p>
    </>,
  },
  {
    title: "Select batches in the Data Registry",
    content: <>
      <p>In the <strong>Dataset Registry</strong> list, check every batch you want in the export. The <strong>Selected Dataset Breakdown</strong> shows what will be compiled.</p>
    </>,
  },
  {
    title: "Choose your export format",
    content: <>
      <p>Under <strong>Compile &amp; Export SFT</strong>, pick a <strong>Target Export Template Format</strong> — for example ChatML, Alpaca, ShareGPT, or Prompt/Response — matching the training framework you will use.</p>
    </>,
  },
  {
    title: "Format the dataset",
    content: <>
      <p>Click <strong>Format Dataset</strong> to compile the selected batches into the chosen template. Wait for the format check to pass before exporting.</p>
    </>,
  },
  {
    title: "Export your files",
    content: <>
      <p>Click <strong>Export JSON</strong> or <strong>Export JSONL</strong> to download your training and validation datasets. Your files download immediately and are ready to use in your own training environment.</p>
    </>,
  },
];

export function RegistryGuide({ onClose, onOpenTrainer }: Props) {
  // step 0 = path choice, steps 1..n = export instructions
  const [step, setStep] = useState(0);
  const buttonClass = "rounded-lg border border-purple-400 bg-purple-300 px-3 py-2 text-sm !font-bold !text-black hover:bg-purple-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-700";

  return (
    <section aria-label="Data Registry Guide" className="kk-reading-guide mb-5 rounded-xl border border-purple-300 bg-[#f5f1e8] p-4 sm:p-5 !text-black space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs !font-bold !text-black">
            Data Registry Guide{step > 0 ? ` · Step ${step} of ${exportSteps.length}` : ""}
          </p>
          <h3 className="mt-1 text-base !font-bold !text-black" aria-live="polite">
            {step === 0 ? "How would you like to train?" : `${step}. ${exportSteps[step - 1].title}`}
          </h3>
        </div>
        <button type="button" onClick={onClose} aria-label="Close guide" className="rounded-lg p-2 !text-black hover:bg-purple-200"><X className="h-4 w-4" /></button>
      </div>

      <div className="rounded-lg border border-[#c4c4c4] bg-[#e5e5e5] p-4 text-sm leading-relaxed !text-black space-y-3">
        {step === 0 ? (
          <>
            <p>Your registry dataset is ready for the next step. Choose how you want to use it:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={onOpenTrainer}
                className="rounded-lg border border-purple-400 bg-purple-300 p-4 text-left !text-black hover:bg-purple-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-700"
              >
                <Cpu className="h-5 w-5 mb-2" />
                <span className="block !font-bold">Automated Training Run</span>
                <span className="block text-xs mt-1">Train your model here with the automated trainer.</span>
              </button>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="rounded-lg border border-purple-400 bg-purple-300 p-4 text-left !text-black hover:bg-purple-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-700"
              >
                <Download className="h-5 w-5 mb-2" />
                <span className="block !font-bold">Export My Own Dataset</span>
                <span className="block text-xs mt-1">Download your dataset and train it yourself.</span>
              </button>
            </div>
          </>
        ) : (
          exportSteps[step - 1].content
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" disabled={step === 0} onClick={() => setStep(step - 1)} className={`${buttonClass} inline-flex items-center gap-1 disabled:opacity-50`}><ArrowLeft className="h-4 w-4" /> Back</button>
        {step === 0 ? null : step < exportSteps.length
          ? <button type="button" onClick={() => setStep(step + 1)} className={`${buttonClass} inline-flex items-center gap-1`}>Next <ArrowRight className="h-4 w-4" /></button>
          : <button type="button" onClick={onOpenTrainer} className={buttonClass}>Go to Data Registry</button>}
      </div>
    </section>
  );
}
