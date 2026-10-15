import type { Dispatch, SetStateAction } from "react";
import { DocumentGuide, type DocumentGuideProgress } from "./DocumentGuide";
import type { GuideDocument } from "../lib/document-guide";
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

export function DocumentGuideWorkspace(props: Props) {
  return props.open ? <div className="mb-5"><DocumentGuide
    progress={props.progress}
    onChange={props.onProgressChange}
    onClose={props.onClose}
    canAdvance={props.progress.step !== 0 || props.progress.hasTranscripts !== undefined}
    onComplete={props.onClose}
  >{null}</DocumentGuide></div> : null;
}
