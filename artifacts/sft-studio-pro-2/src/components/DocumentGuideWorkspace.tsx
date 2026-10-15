import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { DocumentGuide, type DocumentGuideProgress } from "./DocumentGuide";
import { FileAccessModal } from "./FileAccessModal";
import { readGuideDocument, suggestDocumentInstructions, type GuideDocument } from "../lib/document-guide";
import type { ProjectSettings } from "../types";

type Props = {
  open: boolean;
  progress: DocumentGuideProgress;
  onProgressChange: (progress: DocumentGuideProgress) => void;
  onClose: () => void;
  documents: GuideDocument[];
  setDocuments: Dispatch<SetStateAction<GuideDocument[]>>;
  project: ProjectSettings;
  uploadPermitted: boolean;
  onPermitUpload: () => void;
  busy: boolean;
  onLoad: (document: GuideDocument) => void;
};

const button = "rounded-lg border border-purple-400 bg-purple-300 px-3 py-2 text-sm !font-bold !text-black hover:bg-purple-200 disabled:opacity-50";
const field = "w-full rounded-lg border border-gray-400 bg-[#f5f1e8] p-2 text-sm !text-black";

export function DocumentGuideWorkspace(props: Props) {
  const { documents, setDocuments, progress } = props;
  const [index, setIndex] = useState(0);
  const [permissionOpen, setPermissionOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const selected = documents[Math.min(index, Math.max(0, documents.length - 1))];
  const published = documents.filter(document => document.published);
  const [displayIndex, setDisplayIndex] = useState(0);
  const displayed = published[Math.min(displayIndex, Math.max(0, published.length - 1))];
  const update = (id: string, changes: Partial<GuideDocument>) =>
    setDocuments(current => current.map(document => document.id === id ? { ...document, ...changes } : document));
  const ready = documents.length > 0 && documents.every(document =>
    document.status === "ready" && (document.type === "transcript" || document.instructions.trim()) &&
    (document.type !== "transcript" || (document.userTag.trim() && document.assistantTag.trim())));

  const upload = async (files: File[]) => {
    const added: GuideDocument[] = files.map(file => ({
      id: crypto.randomUUID(), file, text: "", type: "knowledge_base", userTag: "", assistantTag: "",
      instructions: "", status: "reading", published: false, done: false,
    }));
    setDocuments(current => [...current, ...added]);
    for (const document of added) {
      try { update(document.id, { text: await readGuideDocument(document.file), status: "ready" }); }
      catch (error) { update(document.id, { status: "error", error: (error as Error).message }); }
    }
  };
  const draft = async (document: GuideDocument) => {
    if (document.type === "transcript") return;
    update(document.id, { status: "drafting", error: undefined });
    try {
      update(document.id, { instructions: await suggestDocumentInstructions(document, props.project), status: "ready", done: false });
    } catch (error) {
      update(document.id, { status: "ready", error: (error as Error).message });
    }
  };
  const canAdvance = progress.step === 0
    ? documents.length > 0 && documents.every(document => document.status === "ready")
    : progress.step === 2
      ? documents.every(document => document.type !== "transcript" || (document.userTag.trim() && document.assistantTag.trim()))
      : progress.step >= 3 ? ready : true;

  return <>
    <input ref={input} type="file" multiple accept=".pdf,.docx,.txt,.md,.csv,.json,.jsonl,image/*" className="hidden" onChange={event => {
      void upload(Array.from(event.target.files || []));
      event.target.value = "";
    }} />
    <FileAccessModal isOpen={permissionOpen} type="upload" onAccept={() => {
      props.onPermitUpload();
      setPermissionOpen(false);
      input.current?.click();
    }} onDecline={() => setPermissionOpen(false)} />
    {props.open && <div className="mb-5"><DocumentGuide
      progress={progress} onChange={props.onProgressChange} onClose={props.onClose}
      canAdvance={canAdvance}
      onComplete={() => {
        setDocuments(current => current.map(document => ({ ...document, published: true })));
        props.onClose();
      }}
    >
      <div className="rounded-lg border border-purple-300 bg-purple-100 p-3 space-y-3 !text-black">
        <p className="text-sm">Files are held temporarily in this browser tab. Reloading or closing it clears the upload list.</p>
        <button type="button" className={button} onClick={() => props.uploadPermitted ? input.current?.click() : setPermissionOpen(true)}>Upload documents</button>
        {documents.length > 0 && <>
          <label className="block text-sm !font-bold">Choose a document
            <select className={field} value={selected?.id} onChange={event => setIndex(documents.findIndex(document => document.id === event.target.value))}>
              {documents.map(document => <option key={document.id} value={document.id}>{document.file.name}{document.status === "reading" ? " — reading" : ""}</option>)}
            </select>
          </label>
          {selected && <>
            {selected.status === "reading" && <p role="status">Reading this document…</p>}
            {selected.error && <p role="status" className="text-sm">{selected.error}</p>}
            <button type="button" className="text-xs underline !text-black" disabled={selected.status === "drafting"} onClick={() => setDocuments(current => current.filter(document => document.id !== selected.id))}>Remove this document</button>
            {progress.step >= 1 && <label className="block text-sm !font-bold">Conversion type
              <select className={field} value={selected.type} disabled={selected.status === "drafting"} onChange={event => update(selected.id, { type: event.target.value as GuideDocument["type"], instructions: "", done: false })}>
                <option value="knowledge_base">Knowledge</option><option value="transcript">Transcript</option><option value="literature">Literature</option>
              </select>
            </label>}
            {progress.step >= 2 && selected.type === "transcript" && <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm !font-bold">User / Speaker 1 Tag<input className={field} value={selected.userTag} disabled={selected.status === "drafting"} onChange={event => update(selected.id, { userTag: event.target.value })} /></label>
              <label className="text-sm !font-bold">Assistant / Speaker 2 Tag<input className={field} value={selected.assistantTag} disabled={selected.status === "drafting"} onChange={event => update(selected.id, { assistantTag: event.target.value })} /></label>
            </div>}
            {progress.step >= 3 && selected.type === "transcript" && <p className="text-sm">No instructions needed. The converter uses your speaker labels to remove metadata and retain the dialogue turn by turn.</p>}
            {progress.step >= 3 && selected.type !== "transcript" && <>
              <button type="button" className={button} disabled={selected.status !== "ready"} onClick={() => void draft(selected)}>{selected.status === "drafting" ? "Writing suggestions…" : "Suggest instructions for this document"}</button>
              {selected.text.length > 60000 && <p className="text-xs">Suggestions use beginning, middle, and end excerpts. The full extracted text is kept for conversion.</p>}
              <label className="block text-sm !font-bold">Review and edit the suggested instructions
                <textarea rows={6} className={field} value={selected.instructions} disabled={selected.status === "drafting"} onChange={event => update(selected.id, { instructions: event.target.value, done: false })} />
              </label>
              <p className="text-xs">Review instructions for each document before continuing. You can also write your own.</p>
            </>}
          </>}
        </>}
      </div>
    </DocumentGuide></div>}
    {displayed && <details className="mb-5 rounded-xl border border-purple-300 bg-[#f5f1e8] !text-black" open>
      <summary className="cursor-pointer bg-purple-300 px-4 py-3 !font-bold !text-black">Suggested document conversions ({published.filter(document => document.done).length}/{published.length} checked)</summary>
      <div className="p-4 space-y-3">
        <button type="button" className={button} disabled={props.busy} onClick={() => props.onLoad(displayed)}>Copy to Document Converter</button>
        <div className="flex items-center gap-2">
          <button type="button" className={button} aria-label="Previous document" disabled={displayIndex <= 0} onClick={() => setDisplayIndex(value => value - 1)}><ArrowLeft className="h-4 w-4" /></button>
          <select aria-label="Choose a suggested document conversion" className={field} value={displayed.id} onChange={event => setDisplayIndex(published.findIndex(document => document.id === event.target.value))}>
            {published.map(document => <option key={document.id} value={document.id}>{document.file.name}</option>)}
          </select>
          <button type="button" className={button} aria-label="Next document" disabled={displayIndex >= published.length - 1} onClick={() => setDisplayIndex(value => value + 1)}><ArrowRight className="h-4 w-4" /></button>
        </div>
        <label className="flex gap-2 text-sm !font-bold"><input type="checkbox" checked={displayed.done} onChange={event => update(displayed.id, { done: event.target.checked })} />Finished processing this document</label>
        <p className="text-sm !font-bold">{displayed.type === "knowledge_base" ? "Knowledge" : displayed.type === "transcript" ? "Transcript" : "Literature"} — {displayed.file.name}</p>
        {displayed.type === "transcript"
          ? <div className="space-y-2 text-sm">
              <p>No conversion instructions needed. Dialogue is copied using these speaker labels and metadata is removed.</p>
              <label className="block !font-bold">User / Speaker 1 Tag<input className={field} value={displayed.userTag} onChange={event => update(displayed.id, { userTag: event.target.value, done: false })} /></label>
              <label className="block !font-bold">Assistant / Speaker 2 Tag<input className={field} value={displayed.assistantTag} onChange={event => update(displayed.id, { assistantTag: event.target.value, done: false })} /></label>
            </div>
          : <label className="block text-sm !font-bold">Conversion instructions<textarea className={field} rows={5} value={displayed.instructions} onChange={event => update(displayed.id, { instructions: event.target.value, done: false })} /></label>}
      </div>
    </details>}
  </>;
}
