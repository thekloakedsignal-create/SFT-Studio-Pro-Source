import React, { useState, useEffect, useMemo, useRef } from "react";
import { rememberBatch, forgetBatch, orderBatchesForReview } from "./lib/batch-recovery";
import { validateRegistryOutput } from "./lib/registry-validation";
import { 
  Sparkles, 
  Settings, 
  Layers, 
  Search, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Download, 
  FileText, 
  Plus, 
  Trash2, 
  Edit3, 
  TrendingUp, 
  Info, 
  Code, 
  Copy, 
  Check, 
  RefreshCw, 
  PlusCircle, 
  ShieldAlert, 
  Sliders, 
  Database,
  ArrowLeft,
  ArrowRight,
  User,
  Cpu,
  Upload,
  FileCode,
  LogIn,
  LogOut,
  Save,
  Lock,
  Unlock,
  FolderOpen,
  Cloud,
  CloudOff,
  MessageSquare,
  Send,
  HelpCircle,
  Lightbulb,
  Mail,
  ArrowUpRight,
  FileJson,
  ExternalLink,
  BookOpen,
  BookMarked,
  Shuffle,
  Building2,
  ChevronLeft,
  ChevronRight,
  FolderPlus,
  X
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { AboutModal } from "./components/AboutModal";
import { RunTrainingModal } from "./components/RunTrainingModal";
import { ModelChatTab } from "./components/ModelChatTab";
import { PaymentGate, trainingPlan } from "./components/PaymentGate";
import { ProjectOnboarding, type BatchRecommendation } from "./components/ProjectOnboarding";
import { PricingModal } from "./components/PricingModal";
import { CustomPackageModal } from "./components/CustomPackageModal";
import { AccountModal } from "./components/AccountModal";
import { DocsModal } from "./components/DocsModal";
import { type DocumentGuideProgress } from "./components/DocumentGuide";
import { DocumentGuideWorkspace } from "./components/DocumentGuideWorkspace";
import { AlignmentQaGuide } from "./components/AlignmentQaGuide";
import { RegistryGuide } from "./components/RegistryGuide";
import { type GuideDocument } from "./lib/document-guide";
import { FileAccessModal } from "./components/FileAccessModal";
import { 
  PresetType, 
  ProjectFormat,
  TemplateType, 
  InstructTemplate,
  ProjectSettings, 
  SFTBatch, 
  SFTExample, 
  QualityReport, 
  QualityIssue,
  SFTMessage 
} from "./types";
import { auth, signOut } from "./firebase";
import { onAuthStateChanged, login, type AppUser as FirebaseUser } from "./appAuth";

const RESOURCE_LINKS = [
  {
    id: "documentation",
    title: "Documentation",
    url: "https://thekloakedsignal-create.github.io/sft-pro-docs/",
  },
  {
    id: "privacy-policy",
    title: "Privacy Policy",
    url: "https://triadai.online/privacy",
  },
  {
    id: "terms-and-conditions",
    title: "Terms and Conditions",
    url: "https://triadai.online/terms",
  },
] as const;

// Constant presets for SFT Task Definition
const PROJECT_PRESETS: Record<PresetType, Omit<ProjectSettings, "selectedPreset"> & {
  batchDesc: string;
  batchInstructions: string;
  batchTempConstraints: string;
  examples: Array<{ prompt: string; completion: string }>;
}> = {
  [PresetType.GENERAL_USE]: {
    name: "General Instruction Tuner",
    systemPrompt: "You are a helpful, respectful, and honest AI assistant. Always answer queries as accurately and safely as possible, providing clear and direct explanations.",
    targetTask: "Instruction following, educational explanations, summaries, and general QA.",
    constraints: "Maintain a helpful and educational tone. Avoid speculative claims. Keep answers concise, factual, and fully self-contained.",
    batchDesc: "Enter a training topic",
    batchInstructions: "Enter topic specific instructions",
    batchTempConstraints: "Enter topic specific restrictions",
    examples: [
      {
        prompt: "Explain photosynthesis in simple terms.",
        completion: "Photosynthesis is the process where plants use sunlight, water, and carbon dioxide to create oxygen and energy in the form of sugar."
      }
    ]
  },
  [PresetType.COMPANION]: {
    name: "Ember (Empathetic AI)",
    systemPrompt: "You are Ember, a highly empathetic, supportive, and active-listening chat companion. You focus on validation, warm dialogue, and friendly brainstorming.",
    targetTask: "Empathetic active listening, life stories sharing, and warm creative conversations.",
    constraints: "Never provide clinical medical, legal, or psychiatric therapy. Use conversational vocabulary, gentle follow-up queries, and a highly positive tone.",
    batchDesc: "Empathetic listening and active warm support dialogue",
    batchInstructions: "Keep tone warm, validating, conversational, and friendly.",
    batchTempConstraints: "Avoid medical advice",
    examples: [
      {
        prompt: "I'm feeling really overwhelmed with work today.",
        completion: "I hear you, and it is completely valid to feel overwhelmed. You have a lot on your plate. Let's take a deep breath together. Would you like to vent, or should we tackle one small thing at a time?"
      }
    ]
  },
  [PresetType.PERSONA]: {
    name: "Socrates (Athenian Sage)",
    systemPrompt: "You are Socrates, the classical Greek philosopher. Speak in historical first-person classical style. You guide the user with irony and Socratic inquiry.",
    targetTask: "Deconstruction of opinions, logical interrogation, and Socratic philosophical dialogues.",
    constraints: "Respond mostly by asking leading, ironic, or analytical questions that force the user to examine their assumptions. Never drop the Socrates persona.",
    batchDesc: "Socratic sage classical philosophical dialogue",
    batchInstructions: "Speak as Socrates. Use irony and guide the conversation through logical questions.",
    batchTempConstraints: "Never break the Socratic persona",
    examples: [
      {
        prompt: "What is truth?",
        completion: "An excellent question! Tell me, is truth something we discover outside of ourselves, or is it merely what we agree is useful to believe? What do you say?"
      }
    ]
  },
  [PresetType.RESEARCH]: {
    name: "Savant (Academic Scholar)",
    systemPrompt: "You are Savant, an objective and rigorous academic research assistant specializing in science, math, and data synthesizing.",
    targetTask: "Statistical review, math explanations, scholarly summarization, and first-principles logical analysis.",
    constraints: "Provide confident yet highly precise scientific explanations. State assumptions and confidence bounds explicitly. Avoid emotional or colloquial slang.",
    batchDesc: "Scholarly scientific summaries and data review",
    batchInstructions: "Provide confident yet highly precise academic explanations. State confidence bounds.",
    batchTempConstraints: "Avoid colloquial slang",
    examples: [
      {
        prompt: "What is the significance of the p-value?",
        completion: "In statistical hypothesis testing, the p-value represents the probability of obtaining test results at least as extreme as the observed results, assuming the null hypothesis is true. A lower p-value (typically ≤ 0.05) suggests strong evidence against the null hypothesis."
      }
    ]
  },
  [PresetType.CUSTOM]: {
    name: "Custom SFT Project",
    systemPrompt: "You are a specialized AI model configured to...",
    targetTask: "Perform specific high-fidelity fine-tuning tasks...",
    constraints: "Ensure the output format stays strictly within...",
    batchDesc: "",
    batchInstructions: "",
    batchTempConstraints: "",
    examples: [
      {
        prompt: "Design a customized prompt format.",
        completion: "Custom response tailored strictly to your system prompt specifications."
      }
    ]
  }
};

// Initial data to populate SFT Studio Pro with realistic content on first boot (emptied to avoid automatic examples)
const DEFAULT_INITIAL_BATCHES: SFTBatch[] = [];

// Simple custom Markdown parser for Expert Chat (supports bold, inline code, and block code blocks)
function parseExpertMarkdown(text: string) {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map((part, index) => {
    if (part.startsWith("```")) {
      const match = part.match(/```(\w*)\n([\s\S]*?)```/);
      const language = match ? match[1] : "";
      const code = match ? match[2] : part.slice(3, -3).trim();
      return {
        type: "code" as const,
        language,
        content: code,
        key: index,
      };
    } else {
      return {
        type: "text" as const,
        content: part,
        key: index,
      };
    }
  });
}

function RenderInlineExpertText({ text }: { text: string }) {
  const lines = text.split("\n");
  const renderInline = (value: string) => value.split(/(\*\*[^*]+\*\*|__[^_]+__|(?<!\*)\*[^*\n]+\*(?!\*)|(?<!_)_[^_\n]+_(?!_)|~~[^~]+~~|`[^`]+`|\[[^\]]+\]\([^)]+\))/g).filter(Boolean).map((part, i) => {
    if (/^\*\*.+\*\*$|^__.+__$/.test(part)) return <strong key={i} className="rounded-sm bg-purple-200 px-0.5 font-extrabold text-purple-950">{part.slice(2, -2)}</strong>;
    if (/^(?<!\*)\*.+\*(?!\*)$|^(?<!_)_.+_(?!_)$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>;
    if (/^~~.+~~$/.test(part)) return <del key={i}>{part.slice(2, -2)}</del>;
    if (/^`.+`$/.test(part)) return <code key={i} className="rounded bg-slate-950 px-1.5 py-0.5 font-mono text-emerald-300">{part.slice(1, -1)}</code>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const href = /^(https?:|mailto:)/i.test(link[2]) ? link[2] : undefined;
      return href ? <a key={i} href={href} target="_blank" rel="noreferrer" className="text-emerald-300 underline">{link[1]}</a> : link[1];
    }
    return part;
  });
  const isListItem = (line: string) => /^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(line);
  const listContent = (line: string) => line.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, "");
  return (
    <div className="space-y-2 text-slate-300">
      {lines.map((line, lineIdx) => {
        if (!line.trim()) return null;
        const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
        if (heading) return <h3 key={lineIdx} className="my-2 font-bold text-purple-950 bg-purple-200 rounded-sm px-1 w-fit">{renderInline(heading[2])}</h3>;
        if (/^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line)) return <hr key={lineIdx} className="border-slate-700" />;
        const quote = line.match(/^\s*>\s?(.*)$/);
        if (quote) return <blockquote key={lineIdx} className="border-l-2 border-slate-500 pl-3 italic text-slate-300">{renderInline(quote[1])}</blockquote>;
        if (isListItem(line)) {
          const ordered = /^\s*\d+[.)]\s+/.test(line);
          const items = [line];
          while (lineIdx + 1 < lines.length && isListItem(lines[lineIdx + 1]) && /^\s*\d+[.)]\s+/.test(lines[lineIdx + 1]) === ordered) {
            items.push(lines[++lineIdx]);
          }
          const List = ordered ? "ol" : "ul";
          return <List key={lineIdx} className={`${ordered ? "list-decimal" : "list-disc"} space-y-1 pl-5 leading-relaxed text-xs`}>
            {items.map((item, itemIdx) => <li key={itemIdx}>{renderInline(listContent(item))}</li>)}
          </List>;
        }
        return <p key={lineIdx} className="leading-relaxed text-xs">{renderInline(line)}</p>;
      })}
    </div>
  );
}

function CopyCodeButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1 px-2 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 text-[10px] font-mono text-slate-400 hover:text-slate-200 transition-all flex items-center gap-1 cursor-pointer select-none"
    >
      <Copy className="h-3 w-3" />
      <span>{copied ? "Copied!" : "Copy Code"}</span>
    </button>
  );
}

// Utility to safely convert any value (including nested {reasoning, response} objects) to a safe string for React rendering
function safeRenderText(val: any): string {
  if (val === undefined || val === null) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (typeof val === "object") {
    if (typeof val.response === "string") return val.response;
    if (typeof val.content === "string") return val.content;
    if (typeof val.text === "string") return val.text;
    if (typeof val.reasoning === "string") return val.reasoning;
    if (val.response) return safeRenderText(val.response);
    if (val.content) return safeRenderText(val.content);
    if (val.text) return safeRenderText(val.text);
    if (val.reasoning) return safeRenderText(val.reasoning);
    try {
      return JSON.stringify(val);
    } catch {
      return String(val);
    }
  }
  return String(val);
}

function sanitizeClientMessage(msg: any): SFTMessage {
  if (!msg || typeof msg !== "object") {
    return { role: "assistant", content: typeof msg === "string" ? msg : "" };
  }

  const role = typeof msg.role === "string" ? msg.role : "assistant";
  let content = msg.content;
  let reasoning = msg.reasoning || msg.reasoning_content;

  if (content && typeof content === "object") {
    if (!reasoning && (content.reasoning || content.reasoning_content || content.thought)) {
      reasoning = content.reasoning || content.reasoning_content || content.thought;
    }
    content = content.response || content.content || content.text || content.answer || content.output || (
      content.reasoning && !content.response ? content.reasoning : JSON.stringify(content)
    );
  }

  if (reasoning && typeof reasoning === "object") {
    reasoning = reasoning.reasoning || reasoning.thought || reasoning.content || reasoning.text || JSON.stringify(reasoning);
  }

  const finalContent = safeRenderText(content).trim();
  const finalReasoning = reasoning ? safeRenderText(reasoning).trim() : undefined;

  return {
    role,
    content: finalContent,
    ...(finalReasoning ? { reasoning: finalReasoning } : {})
  };
}

function sanitizeClientBatch(batch: SFTBatch): SFTBatch {
  if (!batch || !Array.isArray(batch.examples)) return batch;
  return {
    ...batch,
    examples: batch.examples.map(ex => {
      if (!ex || !Array.isArray(ex.messages)) return ex;
      return {
        ...ex,
        messages: ex.messages.map(sanitizeClientMessage)
      };
    })
  };
}

// Helper to truncate file names gracefully while preserving extensions and UI layout constraints
function truncateFileName(name: string, maxLen: number = 28): string {
  if (!name || name.length <= maxLen) return name;
  const lastDot = name.lastIndexOf(".");
  if (lastDot > 0 && name.length - lastDot <= 8) {
    const ext = name.slice(lastDot);
    const base = name.slice(0, lastDot);
    const keep = Math.max(4, maxLen - ext.length - 3);
    return `${base.slice(0, keep)}...${ext}`;
  }
  return `${name.slice(0, maxLen - 3)}...`;
}

interface ProgressiveScrollListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  initialChunkSize?: number;
  chunkSize?: number;
  title?: string;
  emptyMessage?: React.ReactNode;
}

function ProgressiveScrollList<T>({
  items,
  renderItem,
  initialChunkSize = 15,
  chunkSize = 15,
  title,
  emptyMessage,
}: ProgressiveScrollListProps<T>) {
  const [visibleCount, setVisibleCount] = useState<number>(initialChunkSize);
  const observerRef = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setVisibleCount(initialChunkSize);
  }, [items.length, initialChunkSize]);

  useEffect(() => {
    const target = observerRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + chunkSize, items.length));
        }
      },
      { rootMargin: "300px" }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [items.length, chunkSize, visibleCount]);

  if (!items || items.length === 0) {
    return <>{emptyMessage}</>;
  }

  const visibleItems = items.slice(0, visibleCount);
  const isAllLoaded = visibleCount >= items.length;

  return (
    <div className="space-y-4">
      {title && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-1 border-b border-slate-800/60">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {title} ({items.length})
          </div>
          <div className="text-[11px] font-mono text-slate-500">
            Showing {visibleItems.length} of {items.length} (scroll to render more)
          </div>
        </div>
      )}

      <div className="space-y-3">
        {visibleItems.map((item, idx) => renderItem(item, idx))}
      </div>

      {!isAllLoaded && (
        <div
          ref={observerRef}
          className="py-5 my-2 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2 border border-dashed border-slate-800/60 bg-slate-900/30 rounded-xl"
        >
          <div className="flex items-center gap-2 font-mono text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Scrolling through dataset — rendered {visibleItems.length} of {items.length} items</span>
          </div>
          <button
            type="button"
            onClick={() => setVisibleCount(items.length)}
            className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 underline cursor-pointer transition"
          >
            Render all {items.length} items
          </button>
        </div>
      )}

      {isAllLoaded && items.length > initialChunkSize && (
        <div className="text-center py-2 text-[11px] font-mono text-slate-500 border-t border-slate-800/40">
          ✓ All {items.length} items rendered into view
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"define" | "synthesizer" | "convert" | "triad" | "assess" | "registry" | "expert" | "trainer" | "modelChat">("define");
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [activeTab]);
  const [showProjectOnboarding, setShowProjectOnboarding] = useState(true);
  const [showBatchRecommendationInterview, setShowBatchRecommendationInterview] = useState(false);
  const [guidePage, setGuidePage] = useState<"synthesizer" | "convert" | "triad" | "assess" | null>(null);
  const [showDocumentGuide, setShowDocumentGuide] = useState(false);
  const [sectionGuide, setSectionGuide] = useState<"triad" | "assess" | "registry" | null>(null);
  const [documentGuideProgress, setDocumentGuideProgress] = useState<DocumentGuideProgress>({ step: 0 });
  const [documentGuideQueues, setDocumentGuideQueues] = useState<Record<string, GuideDocument[]>>({});
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [activeResourcePage, setActiveResourcePage] = useState<(typeof RESOURCE_LINKS)[number] | null>(null);
  
  // In-App Chat Assistant State
  const [expertMessages, setExpertMessages] = useState<Array<{ role: "user" | "assistant"; content: string; source?: string }>>([]);
  const [expertInput, setExpertInput] = useState("");
  const [isExpertSending, setIsExpertSending] = useState(false);
  const chatMessagesEndRef = useRef<HTMLDivElement | null>(null);
  
  // Project settings state initialized with Preset Type
  const [project, setProject] = useState<ProjectSettings>({
    name: PROJECT_PRESETS[PresetType.GENERAL_USE].name,
    systemPrompt: PROJECT_PRESETS[PresetType.GENERAL_USE].systemPrompt,
    targetTask: PROJECT_PRESETS[PresetType.GENERAL_USE].targetTask,
    constraints: PROJECT_PRESETS[PresetType.GENERAL_USE].constraints,
    selectedPreset: PresetType.GENERAL_USE,
    projectFormat: ProjectFormat.CONVERSATION,
    templateType: TemplateType.SINGLE_TURN,
    instructTemplate: InstructTemplate.CHATML,
    customInstructionFormat: "### Instruction:\n{instruction}\n\n### Input:\n{input}\n\n### Response:\n{response}",
    representativePrompt: PROJECT_PRESETS[PresetType.GENERAL_USE].examples[0]?.prompt || "",
    representativeCompletion: PROJECT_PRESETS[PresetType.GENERAL_USE].examples[0]?.completion || "",
  });

  // Persistent device ID for guest/unauthenticated users to ensure Firestore persistence
  const getDeviceId = () => {
    let id = localStorage.getItem("sft_device_id");
    if (!id) {
      id = "device-" + Math.random().toString(36).substring(2) + Date.now();
      localStorage.setItem("sft_device_id", id);
    }
    return id;
  };
  const projectApiFetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (!auth.currentUser) headers.set("X-Device-ID", getDeviceId());
    return fetch(input, { ...init, headers, credentials: "include" });
  };
  const guideStorageKey = (projectId: string) =>
    `sft_project_guide_${auth.currentUser?.uid || getDeviceId()}_${projectId}`;
  const readGuideState = (projectId: string) => {
    try {
      return JSON.parse(localStorage.getItem(guideStorageKey(projectId)) || "{}");
    } catch {
      return {};
    }
  };
  const writeGuideState = (projectId: string, update: Record<string, unknown>) => {
    const current = readGuideState(projectId);
    localStorage.setItem(guideStorageKey(projectId), JSON.stringify({ ...current, ...update }));
  };
  const openAiGuide = (page: "synthesizer" | "convert" | "triad" | "assess") => {
    if (page === "convert") {
      const saved = readGuideState(selectedProjectId || "").documentWalkthrough;
      const hasFiles = Boolean(documentGuideQueues[selectedProjectId || "draft"]?.length);
      setDocumentGuideProgress({
        step: hasFiles && Number.isInteger(saved?.step) ? Math.max(0, Math.min(5, saved.step)) : 0,
        hasTranscripts: typeof saved?.hasTranscripts === "boolean" ? saved.hasTranscripts : undefined,
      });
      setShowDocumentGuide(true);
      return;
    }
    if (page === "triad" || page === "assess") {
      setSectionGuide(page);
      return;
    }
    setGuidePage(page);
    const saved = readGuideState(selectedProjectId || "");
    const savedMessages = saved.conversations?.[page] || [];
    setExpertMessages(savedMessages);
    setExpertInput("");
    setActiveTab("expert");
  };

  // Batches state initialized with initial default data
  const [batches, setBatches] = useState<SFTBatch[]>(DEFAULT_INITIAL_BATCHES);
  const lastSavedPayload = useRef<any>(null);
  const teacherCodesLoaded = useRef(false);
  const userProjectsCache = useRef<Record<string, any[]>>({});

  // Notifications or messages feedback
  const [notification, setNotification] = useState<{ text: string; type: "success" | "error" | "info" } | null>({
    text: "SFT Studio Pro ready. Active Project set to General Instruction Tuner.",
    type: "success"
  });

  // Batch Generator Form Settings
  const [batchDesc, setBatchDesc] = useState(PROJECT_PRESETS[PresetType.GENERAL_USE].batchDesc);
  const [batchInstructions, setBatchInstructions] = useState(PROJECT_PRESETS[PresetType.GENERAL_USE].batchInstructions);
  const [batchTempConstraints, setBatchTempConstraints] = useState(PROJECT_PRESETS[PresetType.GENERAL_USE].batchTempConstraints);
  const [batchTemplate, setBatchTemplate] = useState<TemplateType>(TemplateType.SINGLE_TURN);
  const [batchRecommendations, setBatchRecommendations] = useState<BatchRecommendation[]>([]);
  const [activeRecommendedBatchIndex, setActiveRecommendedBatchIndex] = useState(0);
  const activeRecommendedBatch = batchRecommendations[activeRecommendedBatchIndex];
  const [completedRecommendedBatches, setCompletedRecommendedBatches] = useState<string[]>([]);
  const [batchSize, setBatchSize] = useState<number>(5);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{ current: number; total: number; percent: number } | null>(null);
  const [generationStage, setGenerationStage] = useState<"Processing batch request" | "Preparing generation" | null>(null);

  // Tab 2: Document SFT extraction states
  const [docName, setDocName] = useState("");
  const [docContent, setDocContent] = useState("");
  const [docType, setDocType] = useState<"transcript" | "knowledge_base" | "literature">("knowledge_base");
  const [hasUserManuallySetDocType, setHasUserManuallySetDocType] = useState(false);
  const [transcriptLayout, setTranscriptLayout] = useState<"single_turn" | "multi_turn">("single_turn");
  const [docTemplate, setDocTemplate] = useState<TemplateType>(TemplateType.SINGLE_TURN);
  const [docCount, setDocCount] = useState<number>(8); // AI estimated example count
  const [literatureTheme, setLiteratureTheme] = useState<string>("");
  const [extractionModel, setExtractionModel] = useState("glm-5.3");
  const [isConverting, setIsConverting] = useState(false);
  const [docConversionProgress, setDocConversionProgress] = useState<{ completed: number; total: number } | null>(null);
  const [isAnalyzingDoc, setIsAnalyzingDoc] = useState(false);
  const [docSuggestionExplanation, setDocSuggestionExplanation] = useState("");
  const [userTag, setUserTag] = useState<string>("");
  const [assistantTag, setAssistantTag] = useState<string>("");
  const [fixedUserPrompt, setFixedUserPrompt] = useState<string>("Please analyze and explain the following document chunk.");
  const [latestConvertedDocBatchId, setLatestConvertedDocBatchId] = useState<string | null>(null);
  const [converterInstructions, setConverterInstructions] = useState<string>("");

  // Memoized document word count for fast rendering without regex re-runs
  const docWordCount = useMemo(() => {
    if (!docContent.trim()) return 0;
    return docContent.trim().split(/\s+/).length;
  }, [docContent]);

  // Tab 2: TRiAD Alignment Import State
  const [triadSize, setTriadSize] = useState<number>(150);
  const [triadTemplate, setTriadTemplate] = useState<TemplateType>(TemplateType.SINGLE_TURN);
  const [isTriadImporting, setIsTriadImporting] = useState(false);
  const [triadUrls, setTriadUrls] = useState<Record<number, string>>({
    150: "https://drive.google.com/file/d/1YPplVDO45R-endyIEbc3vEgh92KBCYNz/view?usp=drivesdk",
    300: "https://drive.google.com/file/d/1552230JtQ-4EuHvxsXsqik7TqrAfxXVK/view?usp=drivesdk",
    750: "https://drive.google.com/file/d/1_mqGtWNqy3vDptE_1qM5eMKJ0dMgPhq1/view?usp=drivesdk"
  });

  // Tab 3: AI Quality Assessment States
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const [isAssessing, setIsAssessing] = useState(false);
  const [isRegeneratingFlagged, setIsRegeneratingFlagged] = useState(false);
  const [qaRepairProgress, setQaRepairProgress] = useState<{ completed: number; total: number; saving: boolean } | null>(null);
  const [reports, setReports] = useState<Record<string, QualityReport>>({});
  const [inspectorFilter, setInspectorFilter] = useState<"flagged" | "all">("flagged");
  const [inspectorPage, setInspectorPage] = useState<number>(1);
  const [inspectorPageSize, setInspectorPageSize] = useState<number>(15);
  const [generatorPage, setGeneratorPage] = useState<number>(1);
  const [generatorPageSize, setGeneratorPageSize] = useState<number>(10);

  // Sync selectedBatchId to first batch when batches are loaded or current selectedBatchId is invalid
  useEffect(() => {
    if (!selectedBatchId && batches.length > 0) {
      setSelectedBatchId(batches[0].id);
    } else if (selectedBatchId && batches.length > 0 && !batches.some(b => b.id === selectedBatchId)) {
      setSelectedBatchId(batches[0].id);
    }
  }, [batches, selectedBatchId]);
  
  // SFT Example Editing states (Modal or inline)
  const [editingExampleIndex, setEditingExampleIndex] = useState<number | null>(null);
  const [editingExampleBatchId, setEditingExampleBatchId] = useState<string | null>(null);
  const [editingMessages, setEditingMessages] = useState<SFTMessage[]>([]);

  // Tab 4: Data Registry & Export states
  const [selectedRegistryBatches, setSelectedRegistryBatches] = useState<Record<string, boolean>>({});
  const [exportTemplateFormat, setExportTemplateFormat] = useState<string>("chatml"); // "chatml" | "alpaca" | "maestro" | "deepseek" | "openai_o1_o3" | "sharegpt" | "prompt_response"
  
  // Helper to initialize registry batch selection when a project is loaded or created
  const initSelectedRegistryBatches = (batchesList: SFTBatch[]) => {
    const newSelected: Record<string, boolean> = {};
    (batchesList || []).forEach(b => {
      if (b.status === "Approved") {
        newSelected[b.id] = true;
      }
    });
    setSelectedRegistryBatches(newSelected);
  };
  const [exportedPreview, setExportedPreview] = useState<string>("");
  const [formattedFormatBadge, setFormattedFormatBadge] = useState<string | null>(null);

  // Subscription & Credits States
  const [userProfile, setUserProfile] = useState<{
    userId: string;
    subscriptionStatus: "Free" | "Premium" | "Student" | "Owner";
    limit: number;
    redeemedCode: string | null;
  } | null>(null);
  const [showBillingModal, setShowBillingModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showRunTrainingModal, setShowRunTrainingModal] = useState(false);
  const [showExamplePaygate, setShowExamplePaygate] = useState(false);
  const [trainerHandoff, setTrainerHandoff] = useState({ model: "Qwen3.5 9 Base", template: "Instruct ChatML (<|im_start|>)" });
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [showCustomPackageModal, setShowCustomPackageModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showDocsModal, setShowDocsModal] = useState(false);
  const [activeBillingTab, setActiveBillingTab] = useState<"redeem" | "teacher">("redeem");
  const [studentCodeInput, setStudentCodeInput] = useState("");
  const [isRedeemingCode, setIsRedeemingCode] = useState(false);
  
  // Teacher Portal States
  const [showTeacherPortal, setShowTeacherPortal] = useState(false);
  const [teacherPassword, setTeacherPassword] = useState("");
  const [isTeacherVerified, setIsTeacherVerified] = useState(false);
  const [teacherCodes, setTeacherCodes] = useState<any[]>([]);
  const [newClassCodeName, setNewClassCodeName] = useState("");
  const [isCreatingClassCode, setIsCreatingClassCode] = useState(false);

  // Firebase Auth & Cloud Firestore States
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [userProjects, setUserProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectIdState] = useState<string | null>(null);
  const activeProjectId = useRef<string | null>(null);
  const projectLoadVersion = useRef(0);
  // Preserve completed/edited batches when an older project request resolves later.
  const sessionBatches = useRef(new Map<string, Map<string, SFTBatch>>());
  const setSelectedProjectId = (id: string | null) => {
    if (activeProjectId.current !== id) projectLoadVersion.current += 1;
    activeProjectId.current = id;
    setSelectedProjectIdState(id);
  };
  const [dropdownKey, setDropdownKey] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isFieldsUnlocked, setIsFieldsUnlocked] = useState(true);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [showOnlyFlagged, setShowOnlyFlagged] = useState(false);
  const [showLoginDropdown, setShowLoginDropdown] = useState(false);

  // New Project and Delete Project Modal States
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjName, setNewProjName] = useState("");
  const [newProjPreset, setNewProjPreset] = useState<PresetType>(PresetType.GENERAL_USE);
  const [newProjFormat, setNewProjFormat] = useState<ProjectFormat>(ProjectFormat.CONVERSATION);
  const [newProjInstructTemplate, setNewProjInstructTemplate] = useState<InstructTemplate>(InstructTemplate.CHATML);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  
  const [isSigningIn, setIsSigningIn] = useState<string | null>(null);

  // Session File Access Permissions (Pop-up on first use in session)
  const [isUploadPermitted, setIsUploadPermitted] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem("triad_upload_access_granted") === "true";
    } catch {
      return false;
    }
  });
  const [isExportPermitted, setIsExportPermitted] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem("triad_export_access_granted") === "true";
    } catch {
      return false;
    }
  });
  const [showUploadAccessModal, setShowUploadAccessModal] = useState<boolean>(false);
  const [showExportAccessModal, setShowExportAccessModal] = useState<boolean>(false);
  const [pendingDroppedFile, setPendingDroppedFile] = useState<File | null>(null);
  const [isDraggingDoc, setIsDraggingDoc] = useState<boolean>(false);
  const [pendingExport, setPendingExport] = useState<{
    format: "json" | "jsonl";
    dataset: SFTExample[];
    fileName: string;
  } | null>(null);
  const docFileInputRef = useRef<HTMLInputElement | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [isGuestMode, setIsGuestMode] = useState(false);

  // Load user SFT projects list from Postgres SQL backend
  const loadUserProjects = async (userId: string) => {
    setIsLoadingProjects(true);
    try {
      let sqlProjects: any[] = [];

      // 1. Query Postgres SQL endpoint
      try {
        const sqlRes = await projectApiFetch("/api/sql/projects");
        const sqlData = await sqlRes.json();
        if (sqlData.success && Array.isArray(sqlData.projects)) {
          sqlProjects = sqlData.projects.filter((project: any) => project?.userId === userId);
        }
      } catch (e) {
        console.warn("SQL projects lookup notice:", e);
      }

      // List saved projects for explicit selection; do not activate cached settings.
      const projectsById = new Map(sqlProjects.filter(p => p && p.id).map(p => [p.id, p]));
      for (const key of [`cached_projects_${userId}`, "local_sft_projects_list", "local_sft_project"]) {
        try {
          const saved = JSON.parse(localStorage.getItem(key) || "null");
          for (const p of Array.isArray(saved) ? saved : saved ? [saved] : []) {
            const legacyGuest = !auth.currentUser && (!p?.userId || p.userId === "local");
            if (p?.id && (p.userId === userId || legacyGuest) && !projectsById.has(p.id)) {
              projectsById.set(p.id, { ...p, userId });
            }
          }
        } catch (error) {
          console.warn("Saved project list could not be read:", error);
        }
      }
      const projectsList = Array.from(projectsById.values());

      // Sort in-memory descending by updatedAt
      projectsList.sort((a, b) => {
        const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return timeB - timeA;
      });

      setUserProjects(projectsList);
      try {
        localStorage.setItem(`cached_projects_${userId}`, JSON.stringify(projectsList));
      } catch (e) {
        console.warn("Could not save to localStorage cache:", e);
      }
      return projectsList;
    } catch (error: any) {
      console.error("Critical error loading projects:", error);
      return [];
    } finally {
      setIsLoadingProjects(false);
    }
  };

  // Load user profile subscription and limit details from Postgres / Cloud SQL
  const loadUserProfile = async (uid: string) => {
    const isOwner = auth.currentUser?.email?.toLowerCase() === "thekloakedsignal@gmail.com";
    try {
      // Fetch user profile from Postgres SQL backend
      const res = await fetch(`/api/sql/users/${uid}`);
      const data = await res.json();
      
      if (data.success && data.user) {
        const storedStatus = data.user.subscriptionStatus || "Free";
        const storedLimit = data.user.limit;

        let effectiveStatus = isOwner ? ("Owner" as const) : storedStatus;
        let effectiveLimit = 5000;

        if (isOwner) {
          effectiveLimit = 999999999;
        } else if (storedStatus === "Student") {
          effectiveLimit = Math.max(storedLimit || 5000, 5000);
        } else {
          // Default free account quota is 5,000 generations
          effectiveLimit = (!storedLimit || storedLimit < 5000) ? 5000 : storedLimit;
        }

        const profile = {
          userId: uid,
          subscriptionStatus: effectiveStatus,
          limit: effectiveLimit,
          redeemedCode: data.user.redeemedCode || null
        };
        
        if (data.user.subscriptionStatus !== effectiveStatus || data.user.limit !== effectiveLimit) {
          try {
            await fetch("/api/sql/users", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                uid,
                email: auth.currentUser?.email || null,
                subscriptionStatus: effectiveStatus,
                limit: effectiveLimit,
                redeemedCode: profile.redeemedCode
              })
            });
          } catch (e) {
            console.warn("Could not sync updated profile limit to SQL:", e);
          }
        }
        
        setUserProfile(profile);
      } else {
        const initialProfile = {
          userId: uid,
          subscriptionStatus: isOwner ? ("Owner" as const) : ("Free" as const),
          limit: isOwner ? 999999999 : 5000,
          redeemedCode: null
        };
        try {
          await fetch("/api/sql/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              uid,
              email: auth.currentUser?.email || null,
              subscriptionStatus: initialProfile.subscriptionStatus,
              limit: initialProfile.limit,
              redeemedCode: null
            })
          });
        } catch (e) {
          console.warn("Could not write initial profile to SQL:", e);
        }
        setUserProfile(initialProfile);
      }
    } catch (error: any) {
      console.info("Using offline profile fallback for user:", uid);
      setUserProfile({
        userId: uid,
        subscriptionStatus: isOwner ? "Owner" : "Free",
        limit: isOwner ? 999999999 : 5000,
        redeemedCode: null
      });
    }
  };

  // Redeem a student code for 5000 free generations up to 10 redemptions per code
  const handleRedeemStudentCode = async () => {
    if (!currentUser) {
      setNotification({ text: "Please sign in to redeem a student code.", type: "error" });
      return;
    }
    if (!studentCodeInput.trim()) {
      setNotification({ text: "Please enter a class code.", type: "error" });
      return;
    }
    const enteredCode = studentCodeInput.trim().toUpperCase();
    setIsRedeemingCode(true);
    setNotification({ text: "Verifying student class code...", type: "info" });
    
    try {
      // Query student codes from Postgres database
      const res = await fetch("/api/sql/student-codes");
      const data = await res.json();
      const codeList = data.codes || [];
      const codeItem = codeList.find((c: any) => c.code === enteredCode);
      
      if (!codeItem) {
        setNotification({ text: "Invalid student code. Please check with your instructor.", type: "error" });
        setIsRedeemingCode(false);
        return;
      }
      
      if (userProfile && userProfile.redeemedCode) {
        setNotification({ text: "Only one student redemption per user is allowed.", type: "error" });
        setIsRedeemingCode(false);
        return;
      }
      
      const redeemedUserIds = codeItem.redeemedUserIds || [];
      if (redeemedUserIds.includes(currentUser.uid)) {
        setNotification({ text: "You have already redeemed this student code.", type: "error" });
        setIsRedeemingCode(false);
        return;
      }
      
      if (codeItem.redemptionCount >= (codeItem.maxRedemptions || 10)) {
        setNotification({ text: "This student code has reached its 10 redemption limit and is void.", type: "error" });
        setIsRedeemingCode(false);
        return;
      }
      
      const updatedRedeemedUsers = [...redeemedUserIds, currentUser.uid];
      const updatedCodeItem = {
        ...codeItem,
        redemptionCount: codeItem.redemptionCount + 1,
        redeemedUserIds: updatedRedeemedUsers
      };

      // Save code redemption back to Postgres
      await fetch("/api/sql/student-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codeItem: updatedCodeItem })
      });

      // Update user profile in Postgres
      await fetch("/api/sql/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: currentUser.uid,
          email: currentUser.email || null,
          subscriptionStatus: "Student",
          limit: 5000,
          redeemedCode: enteredCode
        })
      });
      
      setUserProfile({
        userId: currentUser.uid,
        subscriptionStatus: "Student",
        limit: 5000,
        redeemedCode: enteredCode
      });
      
      setStudentCodeInput("");
      setNotification({ text: "Success! Student Code Redeemed. 5000 generations granted!", type: "success" });
    } catch (error) {
      console.error("Redemption error:", error);
      setNotification({ text: "Error redeeming student code.", type: "error" });
    } finally {
      setIsRedeemingCode(false);
    }
  };

  // Load student codes list for the teacher portal
  const loadTeacherCodes = async () => {
    if (teacherCodesLoaded.current) return;
    teacherCodesLoaded.current = true;

    try {
      const res = await fetch("/api/sql/student-codes");
      const data = await res.json();
      if (data.success && Array.isArray(data.codes) && data.codes.length > 0) {
        setTeacherCodes(data.codes);
        return;
      }
    } catch (e) {
      console.warn("SQL student codes lookup notice:", e);
    }

    const defaultCodes = [
      { id: "code-sft101", code: "COURSE-SFT101", redemptionCount: 0, maxRedemptions: 10, redeemedUserIds: [], createdAt: new Date().toISOString() },
      { id: "code-nlp202", code: "COURSE-NLP202", redemptionCount: 0, maxRedemptions: 10, redeemedUserIds: [], createdAt: new Date().toISOString() }
    ];
    setTeacherCodes(defaultCodes);
  };

  // Create a new class student code for the group
  const handleCreateClassCode = async () => {
    if (!newClassCodeName.trim()) {
      setNotification({ text: "Please enter a class course code name.", type: "error" });
      return;
    }
    const finalCode = newClassCodeName.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
    if (!finalCode) {
      setNotification({ text: "Invalid code format.", type: "error" });
      return;
    }
    setIsCreatingClassCode(true);
    
    try {
      const newId = `code-${Date.now()}`;
      const payload = {
        id: newId,
        code: finalCode,
        redemptionCount: 0,
        maxRedemptions: 10,
        redeemedUserIds: [],
        createdAt: new Date().toISOString()
      };
      
      // Save directly to Postgres
      await fetch("/api/sql/student-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codeItem: payload })
      });

      setTeacherCodes(prev => [payload, ...prev.filter(c => c.id !== payload.id && c.code !== payload.code)]);
      setNewClassCodeName("");
      setNotification({ text: `Class Code "${finalCode}" created successfully!`, type: "success" });
    } catch (error) {
      console.error("Error creating code:", error);
      setNotification({ text: "Failed to create code.", type: "error" });
    } finally {
      setIsCreatingClassCode(false);
    }
  };

  // Check if adding requested examples would exceed limits across the ENTIRE account
  const checkGenerationLimit = (requestedCount: number): boolean => {
    const isOwner = auth.currentUser?.email?.toLowerCase() === "thekloakedsignal@gmail.com" || userProfile?.subscriptionStatus === "Owner";
    if (isOwner) {
      return true; // Exempt from all limits with unlimited usage
    }
    const maxThreshold = !auth.currentUser ? 100 : (userProfile ? userProfile.limit : 5000);
    const currentTotal = accountTotalGenerations;
    
    if (currentTotal + requestedCount > maxThreshold || currentTotal >= maxThreshold) {
      setShowCustomPackageModal(true);
      return false;
    }
    return true;
  };

  const checkExampleAllowance = async (count: number): Promise<boolean> => {
    try {
      const response = await projectApiFetch("/api/whop/entitlements");
      const balance = await response.json();
      if (!response.ok || !balance.success) throw new Error(balance.error || "Unable to check example allowance.");
      if (balance.bypass === true) return true;
      if (balance.remaining < count) { setShowExamplePaygate(true); return false; }
      return true;
    } catch (error: any) {
      setNotification({ text: error.message, type: "error" });
      return false;
    }
  };

  // Save the SFT project to Firestore directly (incremental delta saving)
  const handleSaveProject = async (projId: string | null = null) => {
    const user = auth.currentUser;
    const userIdToUse = user ? user.uid : getDeviceId();

    const idToSave = (projId && projId !== "NEW_PROJECT") ? projId : (selectedProjectId || `project-${Date.now()}`);
    setIsSaving(true);
    
    const settingsPayload = {
      name: project.name,
      systemPrompt: project.systemPrompt,
      targetTask: project.targetTask,
      constraints: project.constraints,
      selectedPreset: project.selectedPreset,
      projectFormat: project.projectFormat || ProjectFormat.CONVERSATION,
      templateType: project.templateType || TemplateType.SINGLE_TURN,
      instructTemplate: project.instructTemplate || InstructTemplate.CHATML,
      customInstructionFormat: project.customInstructionFormat || "### Instruction:\n{instruction}\n\n### Input:\n{input}\n\n### Response:\n{response}",
      representativePrompt: project.representativePrompt || "",
      representativeCompletion: project.representativeCompletion || ""
    };

    setSelectedProjectId(idToSave);
    setIsFieldsUnlocked(false);

    // Build lightweight batch summaries for root project metadata (no heavy duplicated examples)
    const batchSummaries = batches.map(b => ({
      id: b.id,
      name: b.name,
      source: b.source,
      templateType: b.templateType,
      examplesCount: b.examplesCount || (b.examples ? b.examples.length : 0),
      status: b.status,
      timestamp: b.timestamp,
      description: b.description
    }));

    const projectMetadataPayload = {
      id: idToSave,
      userId: userIdToUse,
      name: project.name || "My SFT Custom Assistant",
      settings: settingsPayload,
      batchCount: batches.length,
      totalExamples: batches.reduce((acc, b) => acc + (b.examplesCount || (b.examples ? b.examples.length : 0)), 0),
      batchSummaries,
      updatedAt: new Date().toISOString()
    };

    // 1. Save metadata and full batches to Postgres database
    try {
      const response = await projectApiFetch("/api/sql/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...projectMetadataPayload,
          batches: batches
        })
      });
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || `Project save failed (${response.status}).`);
      }
      const fullProj = { ...projectMetadataPayload, batches: batches };
      const list = [fullProj, ...userProjects.filter(p => p.id !== idToSave && p.userId === userIdToUse)];
      setUserProjects(list);
      // Write a backup from current state without reading cached projects.
      try {
        localStorage.setItem(`cached_projects_${userIdToUse}`, JSON.stringify(list));
      } catch (e) {}

      setNotification({ 
        text: `Project "${project.name || "SFT Project"}" saved and locked!`, 
        type: "success" 
      });
    } catch (error: any) {
      console.warn("Postgres save notice:", error?.message);
      setNotification({ 
        text: `Project save failed: ${error?.message || "Please retry."}`,
        type: "error"
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Helper to save a single batch incrementally to Postgres DB
  const saveBatch = async (projectId: string, batch: SFTBatch) => {
    const targetBatchId = batch?.id || batch?.batchId;
    if (!batch || !targetBatchId || !projectId) return false;

    const normalizedBatch: SFTBatch = {
      ...batch,
      id: targetBatchId,
      batchId: targetBatchId
    };
    const projectBatches = sessionBatches.current.get(projectId) || new Map<string, SFTBatch>();
    projectBatches.set(targetBatchId, normalizedBatch);
    sessionBatches.current.set(projectId, projectBatches);

    // Update userProjects in state so the active project in memory always has the latest batch
    setUserProjects(prev => prev.map(p => {
      if (p.id !== projectId) return p;
      const currentBatches = Array.isArray(p.batches) ? p.batches : [];
      const exists = currentBatches.some(b => (b.id === targetBatchId || b.batchId === targetBatchId));
      const updatedBatches = exists 
        ? currentBatches.map(b => (b.id === targetBatchId || b.batchId === targetBatchId) ? normalizedBatch : b)
        : [normalizedBatch, ...currentBatches];
      return {
        ...p,
        batches: updatedBatches,
        totalExamples: updatedBatches.reduce((acc, b) => acc + (b.examples?.length || b.examplesCount || 0), 0)
      };
    }));

    // Keep a recovery copy even if the network/database save fails.
    const batchUserId = auth.currentUser?.uid || getDeviceId();
    try {
      rememberBatch(localStorage, batchUserId, projectId, normalizedBatch);
    } catch (error) {
      console.warn("Batch recovery cache unavailable:", error);
    }

    // Save single batch to Postgres and report the actual outcome.
    try {
      const response = await projectApiFetch(`/api/sql/projects/${encodeURIComponent(projectId)}/batches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch: normalizedBatch })
      });
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || `Batch save failed (${response.status}).`);
      }
      try {
        // Do not clear a newer pending edit when an earlier save resolves.
        if (sessionBatches.current.get(projectId)?.get(targetBatchId) === normalizedBatch) {
          forgetBatch(localStorage, batchUserId, projectId, targetBatchId);
        }
      } catch (error) {
        console.warn("Batch recovery cache cleanup failed:", error);
      }
      return true;
    } catch {
      return false;
    }
  };

  // Helper to delete a single batch from Postgres DB
  const deleteBatch = async (projectId: string, batchId: string) => {
    if (!projectId || !batchId) return;
    projectLoadVersion.current += 1;
    sessionBatches.current.get(projectId)?.delete(batchId);
    try {
      forgetBatch(localStorage, auth.currentUser?.uid || getDeviceId(), projectId, batchId);
      const cacheKey = `cached_projects_${auth.currentUser?.uid || getDeviceId()}`;
      localStorage.setItem(cacheKey, JSON.stringify(userProjects.map((p: any) => p.id === projectId
          ? { ...p, batches: (p.batches || []).filter((b: any) => (b.id || b.batchId) !== batchId) }
          : p)));
    } catch (error) {
      console.warn("Batch recovery cache update failed:", error);
    }

    setUserProjects(prev => prev.map(p => {
      if (p.id !== projectId) return p;
      const currentBatches = Array.isArray(p.batches) ? p.batches : [];
      const updatedBatches = currentBatches.filter(b => b.id !== batchId);
      return {
        ...p,
        batches: updatedBatches,
        totalExamples: updatedBatches.reduce((acc, b) => acc + (b.examples?.length || b.examplesCount || 0), 0)
      };
    }));

    try {
      await projectApiFetch(`/api/sql/projects/${encodeURIComponent(projectId)}/batches/${encodeURIComponent(batchId)}`, {
        method: "DELETE"
      });
    } catch (e) {
      console.warn("Postgres batch delete notice:", e);
    }
  };

  // Switch/Load selected project from Postgres or local cache
  const handleSelectProject = async (selectedId: string) => {
    setShowProjectOnboarding(false);
    const loadVersion = ++projectLoadVersion.current;
    const batchesAtLoadStart = new Map(sessionBatches.current.get(selectedId));
    if (selectedId === "NEW_PROJECT") {
      handleCreateNewProject();
      return;
    }
    
    // Save current active project if unlocked
    if (isFieldsUnlocked && selectedProjectId) {
      await handleSaveProject(selectedProjectId);
    }
    if (loadVersion !== projectLoadVersion.current) return;
    
    let selected: any = userProjects.find(p => p.id === selectedId) || null;
    let sqlLoadedProject: any = null;

    // 1. Fetch fresh copy from Postgres SQL endpoint
    try {
      const sqlRes = await projectApiFetch(`/api/sql/projects/${encodeURIComponent(selectedId)}`);
      if (sqlRes.ok) {
        const sqlData = await sqlRes.json();
        if (sqlData.success && sqlData.project) {
          sqlLoadedProject = sqlData.project;
          selected = { ...(selected || {}), ...sqlLoadedProject };
        }
      }
    } catch (sqlErr) {
      console.warn("Postgres project fetch notice:", sqlErr);
    }
    if (loadVersion !== projectLoadVersion.current) return;

    if (!selected) return;
    
    // 3. Collect batches
    const batchesMap = new Map<string, SFTBatch>();

    if (sqlLoadedProject && Array.isArray(sqlLoadedProject.batches)) {
      sqlLoadedProject.batches.forEach((b: SFTBatch) => {
        if (b && b.id) batchesMap.set(b.id, b);
      });
    }

    if (selected.batches && Array.isArray(selected.batches)) {
      selected.batches.forEach((b: SFTBatch) => {
        if (b && b.id) {
          const existing = batchesMap.get(b.id);
          const existingCount = existing?.examples?.length || existing?.examplesCount || 0;
          const newCount = b.examples?.length || b.examplesCount || 0;
          if (!existing || newCount >= existingCount) {
            batchesMap.set(b.id, b);
          }
        }
      });
    }

    const preferredBatchIds: string[] = [];
    sessionBatches.current.get(selectedId)?.forEach((batch, id) => {
      if (batchesAtLoadStart.get(id) !== batch) {
        batchesMap.set(id, batch);
        preferredBatchIds.unshift(id);
      }
    });
    const finalBatches = orderBatchesForReview(Array.from(batchesMap.values()), preferredBatchIds);

    setSelectedProjectId(selectedId);
    const savedGuideState = readGuideState(selectedId);
    setBatchRecommendations(Array.isArray(savedGuideState.recommendations) ? savedGuideState.recommendations : []);
    setCompletedRecommendedBatches(Array.isArray(savedGuideState.completedRecommendedBatches) ? savedGuideState.completedRecommendedBatches : []);
    setActiveRecommendedBatchIndex(0);
    setGuidePage(null);
    setExpertMessages([]);
    setIsFieldsUnlocked(false);
    const loadedFormat = selected.settings?.projectFormat || (selected.settings?.templateType === TemplateType.INSTRUCTION_TEMPLATE ? ProjectFormat.INSTRUCTION : ProjectFormat.CONVERSATION);
    const loadedTemplateType = selected.settings?.templateType || (loadedFormat === ProjectFormat.INSTRUCTION ? TemplateType.INSTRUCTION_TEMPLATE : TemplateType.SINGLE_TURN);
    const loadedInstructTemplate = selected.settings?.instructTemplate || InstructTemplate.CHATML;
    const loadedCustomFormat = selected.settings?.customInstructionFormat || "### Instruction:\n{instruction}\n\n### Input:\n{input}\n\n### Response:\n{response}";
    
    setProject({
      name: selected.name || selected.settings?.name || "Untitled Project",
      systemPrompt: selected.settings?.systemPrompt || "",
      targetTask: selected.settings?.targetTask || "",
      constraints: selected.settings?.constraints || "",
      selectedPreset: selected.settings?.selectedPreset || PresetType.CUSTOM,
      projectFormat: loadedFormat,
      templateType: loadedTemplateType,
      instructTemplate: loadedInstructTemplate,
      customInstructionFormat: loadedCustomFormat,
      representativePrompt: selected.settings?.representativePrompt || (PROJECT_PRESETS[selected.settings?.selectedPreset as PresetType || PresetType.GENERAL_USE]?.examples[0]?.prompt || ""),
      representativeCompletion: selected.settings?.representativeCompletion || (PROJECT_PRESETS[selected.settings?.selectedPreset as PresetType || PresetType.GENERAL_USE]?.examples[0]?.completion || ""),
    });
    setBatchTemplate(loadedTemplateType);
    setDocTemplate(loadedTemplateType);
    setTriadTemplate(loadedTemplateType);
    
    const sanitizedBatches = finalBatches.map(sanitizeClientBatch);
    setBatches(sanitizedBatches);
    initSelectedRegistryBatches(sanitizedBatches);
    setReports({});
    setSelectedBatchId(sanitizedBatches.length > 0 ? sanitizedBatches[0].id : "");
    setEditingExampleIndex(null);
    setEditingExampleBatchId(null);
    setEditingMessages([]);
    setExportedPreview("");
    
    setNotification({ text: `Loaded SFT Project "${selected.name || "Untitled Project"}"`, type: "success" });
  };

  // Send message to In-App Chat Assistant
  const handleSendExpertMessage = async (textToSend?: string) => {
    const input = textToSend || expertInput;
    if (!input || !input.trim() || isExpertSending) return;

    const messageContent = input.trim();
    const newMessages = [...expertMessages, { role: "user" as const, content: messageContent }];
    setExpertMessages(newMessages);
    const persistGuideMessages = (messages: Array<{ role: "user" | "assistant"; content: string; source?: string }>) => {
      if (!guidePage || !selectedProjectId) return;
      const current = readGuideState(selectedProjectId);
      writeGuideState(selectedProjectId, {
        conversations: { ...(current.conversations || {}), [guidePage]: messages }
      });
    };
    persistGuideMessages(newMessages);
    if (!textToSend) {
      setExpertInput("");
    }
    setIsExpertSending(true);

    try {
      const response = await fetch("/api/expert-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          appContext: {
            projectName: project.name,
            targetTask: project.targetTask,
            systemPrompt: project.systemPrompt,
            projectDefinition: project,
            hasSavedProject: Boolean(selectedProjectId),
            activeTab: guidePage || activeTab,
            totalBatches: batches.length,
            totalExamples: batches.reduce((acc, b) => acc + (b.examples?.length || 0), 0),
            approvedBatches: batches.filter(b => b.status === "Approved").length
          }
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response from chat assistant.");
      }

      const data = await response.json();
      const nextMessages = [...newMessages, { role: "assistant" as const, content: data.text || "Sorry, I encountered an issue." }];
      setExpertMessages(nextMessages);
      persistGuideMessages(nextMessages);
    } catch (error: any) {
      const nextMessages = [...newMessages, { role: "assistant" as const, content: "Unable to complete your request. Please try again." }];
      setExpertMessages(nextMessages);
      persistGuideMessages(nextMessages);
    } finally {
      setIsExpertSending(false);
    }
  };

  // Clear chat history
  const handleClearChat = () => {
    setExpertMessages([]);
  };

  // Auto-scroll chat assistant to bottom on new messages
  useEffect(() => {
    if (activeTab === "expert") {
      chatMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [expertMessages, isExpertSending, activeTab]);

  // Create new SFT project modal trigger
  const handleCreateNewProject = () => {
    setNewProjName(`SFT Project ${userProjects.length + 1}`);
    setNewProjPreset(PresetType.GENERAL_USE);
    setNewProjFormat(ProjectFormat.CONVERSATION);
    setNewProjInstructTemplate(InstructTemplate.CHATML);
    setShowNewProjectModal(true);
  };

  // Confirm creation of new SFT project without overloading DB/API
  const handleConfirmCreateNewProject = () => {
    const finalName = newProjName.trim() || `SFT Project ${userProjects.length + 1}`;
    const newProjId = `project-${Date.now()}`;
    
    const presetConfig = PROJECT_PRESETS[newProjPreset] || PROJECT_PRESETS[PresetType.GENERAL_USE];
    
    const exemplarMap: Record<string, { prompt: string; completion: string }> = {
      [InstructTemplate.CHATML]: {
        prompt: "Explain why the sky appears blue.",
        completion: "The sky appears blue because molecules in Earth's atmosphere scatter shorter wavelengths of sunlight more strongly than longer wavelengths."
      },
      [InstructTemplate.ALPACA]: {
        prompt: "### Instruction:\nExplain why the sky appears blue.\n\n### Input:\nContext: Atmospheric light scattering.",
        completion: "### Response:\nThe sky appears blue because molecules in Earth's atmosphere scatter shorter wavelengths of sunlight more strongly than longer wavelengths."
      },
      [InstructTemplate.MISTRAL]: {
        prompt: "[INST] Explain why the sky appears blue. [/INST]",
        completion: "The sky appears blue because molecules in Earth's atmosphere scatter shorter wavelengths of sunlight more strongly than longer wavelengths."
      }
    };

    const isInstruction = newProjFormat === ProjectFormat.INSTRUCTION;
    const defaultSettings: ProjectSettings = {
      name: finalName,
      systemPrompt: presetConfig.systemPrompt,
      targetTask: presetConfig.targetTask,
      constraints: presetConfig.constraints,
      selectedPreset: newProjPreset,
      projectFormat: newProjFormat,
      templateType: isInstruction ? TemplateType.INSTRUCTION_TEMPLATE : TemplateType.SINGLE_TURN,
      instructTemplate: newProjInstructTemplate,
      customInstructionFormat: "### Instruction:\n{instruction}\n\n### Input:\n{input}\n\n### Response:\n{response}",
      representativePrompt: isInstruction ? (exemplarMap[newProjInstructTemplate]?.prompt || "") : (presetConfig.examples[0]?.prompt || ""),
      representativeCompletion: isInstruction ? (exemplarMap[newProjInstructTemplate]?.completion || "") : (presetConfig.examples[0]?.completion || ""),
    };
    
    // Clear active workspace and synthesis states immediately
    setReports({});
    setSelectedBatchId("");
    setEditingExampleIndex(null);
    setEditingExampleBatchId(null);
    setEditingMessages([]);
    setExportedPreview("");
    
    // Set active project states
    setSelectedProjectId(newProjId);
    setIsFieldsUnlocked(true);
    setBatchRecommendations([]);
    setCompletedRecommendedBatches([]);
    setActiveRecommendedBatchIndex(0);
    setGuidePage(null);
    setExpertMessages([]);
    setProject(defaultSettings);
    setShowProjectOnboarding(true);
    setBatches([]);
    initSelectedRegistryBatches([]);

    const userIdToUse = auth.currentUser ? auth.currentUser.uid : getDeviceId();

    // Optimistically insert project into state and cache immediately (no DB query roundtrip / zero UI freeze)
    const newProjectRecord = {
      id: newProjId,
      userId: userIdToUse,
      name: finalName,
      settings: defaultSettings,
      batches: [],
      batchCount: 0,
      totalExamples: 0,
      updatedAt: new Date().toISOString()
    };

    setUserProjects(prev => [newProjectRecord, ...prev.filter(p => p.id !== newProjId)]);

    // Update local storage cache
    try {
      const list = [newProjectRecord, ...userProjects.filter(p => p.id !== newProjId && p.userId === userIdToUse)];
      localStorage.setItem(`cached_projects_${userIdToUse}`, JSON.stringify(list));
      localStorage.setItem("local_sft_project", JSON.stringify(newProjectRecord));
    } catch (e) {
      console.warn("LocalStorage cache update notice:", e);
    }

    // Close modal & notify
    setShowNewProjectModal(false);
    setNotification({ text: `Created and opened "${finalName}"!`, type: "success" });

    // Non-blocking background save to database (one single write, no re-fetching all projects)
    projectApiFetch("/api/sql/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: newProjId,
        userId: userIdToUse,
        name: finalName,
        settings: defaultSettings,
        batches: []
      })
    }).catch(err => {
      console.warn("Background project save notice:", err);
    });
  };

  // Delete project from Postgres / local state
  const handleConfirmDeleteProject = async (id: string) => {
    const projToDelete = userProjects.find(p => p.id === id);
    if (!projToDelete) {
      setProjectToDelete(null);
      return;
    }

    // Clean SFT states when active project deletes
    setReports({});
    setEditingExampleIndex(null);
    setEditingExampleBatchId(null);
    setEditingMessages([]);
    setExportedPreview("");

    const userIdToUse = auth.currentUser ? auth.currentUser.uid : getDeviceId();

    // Optimistically remove from state and cache
    const remaining = userProjects.filter(p => p.id !== id);
    setUserProjects(remaining);
    try {
      localStorage.setItem(`cached_projects_${userIdToUse}`, JSON.stringify(remaining));
    } catch (e) {}

    setProjectToDelete(null);
    setNotification({ text: `Deleted SFT Project "${projToDelete.name}"`, type: "success" });

    if (remaining.length > 0) {
      await handleSelectProject(remaining[0].id);
    } else {
      const fallbackId = `project-${Date.now()}`;
      const defaultSettings: ProjectSettings = {
        name: PROJECT_PRESETS[PresetType.GENERAL_USE].name,
        systemPrompt: PROJECT_PRESETS[PresetType.GENERAL_USE].systemPrompt,
        targetTask: PROJECT_PRESETS[PresetType.GENERAL_USE].targetTask,
        constraints: PROJECT_PRESETS[PresetType.GENERAL_USE].constraints,
        selectedPreset: PresetType.GENERAL_USE,
        projectFormat: ProjectFormat.CONVERSATION,
        templateType: TemplateType.SINGLE_TURN,
        instructTemplate: InstructTemplate.CHATML,
        representativePrompt: PROJECT_PRESETS[PresetType.GENERAL_USE].examples[0]?.prompt || "",
        representativeCompletion: PROJECT_PRESETS[PresetType.GENERAL_USE].examples[0]?.completion || "",
      };
      setSelectedProjectId(fallbackId);
      setProject(defaultSettings);
      setBatches(DEFAULT_INITIAL_BATCHES);
      initSelectedRegistryBatches(DEFAULT_INITIAL_BATCHES);
      setSelectedBatchId("");
      setUserProjects([{
        id: fallbackId,
        userId: userIdToUse,
        name: defaultSettings.name,
        settings: defaultSettings,
        batches: [],
        batchCount: 0,
        totalExamples: 0,
        updatedAt: new Date().toISOString()
      }]);
    }

    // Background delete from database
    try {
      await projectApiFetch(`/api/sql/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch (sqlErr) {
      console.warn("Postgres delete notice:", sqlErr);
    }
  };

  // Enforce document title on mount
  useEffect(() => {
    document.title = "SFT Studio Pro | TRiAD AI by TRiADiC Intelligence Labs";
  }, []);

  // Auth Subscription
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        setCurrentUser(user);
        if (user) {
          // Sign-in starts an unsaved, editable workspace; saved projects remain in the picker.
          projectLoadVersion.current += 1;
          setSelectedProjectId(null);
          setIsFieldsUnlocked(true);
          setProject({
            name: PROJECT_PRESETS[PresetType.GENERAL_USE].name,
            systemPrompt: PROJECT_PRESETS[PresetType.GENERAL_USE].systemPrompt,
            targetTask: PROJECT_PRESETS[PresetType.GENERAL_USE].targetTask,
            constraints: PROJECT_PRESETS[PresetType.GENERAL_USE].constraints,
            selectedPreset: PresetType.GENERAL_USE,
            projectFormat: ProjectFormat.CONVERSATION,
            templateType: TemplateType.SINGLE_TURN,
            instructTemplate: InstructTemplate.CHATML,
            customInstructionFormat: "### Instruction:\n{instruction}\n\n### Input:\n{input}\n\n### Response:\n{response}",
            representativePrompt: PROJECT_PRESETS[PresetType.GENERAL_USE].examples[0]?.prompt || "",
            representativeCompletion: PROJECT_PRESETS[PresetType.GENERAL_USE].examples[0]?.completion || "",
          });
          setBatches([]);
          initSelectedRegistryBatches([]);
          setReports({});
          setSelectedBatchId("");
          setEditingExampleIndex(null);
          setEditingExampleBatchId(null);
          setEditingMessages([]);
          setExportedPreview("");
          setBatchDesc(PROJECT_PRESETS[PresetType.GENERAL_USE].batchDesc);
          setBatchInstructions(PROJECT_PRESETS[PresetType.GENERAL_USE].batchInstructions);
          setBatchTempConstraints(PROJECT_PRESETS[PresetType.GENERAL_USE].batchTempConstraints);
          setBatchTemplate(TemplateType.SINGLE_TURN);
          setBatchSize(5);
          setDocName("");
          setDocContent("");
          setLatestConvertedDocBatchId(null);
          setExpertMessages([]);
          setExpertInput("");
          setActiveTab("define");
          setNotification({ text: `Welcome, ${user.displayName || user.email}!`, type: "success" });
          await loadUserProfile(user.uid);
          
          await loadUserProjects(user.uid);
        } else {
          // Load projects from Postgres using deviceId for guest/unauthenticated users
          try {
            await loadUserProjects(getDeviceId());
            if (auth.currentUser) return;
            // Saved projects remain selectable, but never reopen one automatically.
            setSelectedProjectId(null);
            setBatches(DEFAULT_INITIAL_BATCHES);
            initSelectedRegistryBatches(DEFAULT_INITIAL_BATCHES);
          } catch (e) {
            console.warn("Guest projects lookup notice:", e);
          }
          setUserProfile(null);
          setIsTeacherVerified(false);
        }
      } catch (err) {
        console.warn("Auth state changed notice:", err);
      } finally {
        setIsAuthLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Auto clear notification
  useEffect(() => {
    if (notification) {
      const t = setTimeout(() => setNotification(null), 8000);
      return () => clearTimeout(t);
    }
  }, [notification]);

  // Sync preset changes
  const handlePresetSelect = (preset: PresetType) => {
    const defaults = PROJECT_PRESETS[preset];
    setProject(prev => ({
      name: defaults.name,
      systemPrompt: defaults.systemPrompt,
      targetTask: defaults.targetTask,
      constraints: defaults.constraints,
      selectedPreset: preset,
      projectFormat: prev.projectFormat || ProjectFormat.CONVERSATION,
      templateType: prev.projectFormat === ProjectFormat.INSTRUCTION ? TemplateType.INSTRUCTION_TEMPLATE : (prev.templateType || TemplateType.SINGLE_TURN),
      customInstructionFormat: prev.customInstructionFormat || "### Instruction:\n{instruction}\n\n### Input:\n{input}\n\n### Response:\n{response}",
      representativePrompt: defaults.examples[0]?.prompt || "",
      representativeCompletion: defaults.examples[0]?.completion || "",
    }));
    // Prefill the batch simulator fields on the first tab
    setBatchDesc(defaults.batchDesc);
    setBatchInstructions(defaults.batchInstructions);
    setBatchTempConstraints(defaults.batchTempConstraints);

    setNotification({
      text: `Loaded defaults and simulator parameters for: ${preset}`,
      type: "success"
    });
  };

  // Check if a batch is approved in the registry. 
  // If approved, larger batch sizes are unlocked (10, 25, 50, 100)
  const isScalingUnlocked = useMemo(() => {
    return batches.some(b => b.status === "Approved");
  }, [batches]);

  // Find the latest batch from the Generator for inline review
  const latestGeneratorBatch = useMemo(() => {
    return batches.find(b => b.source === "Generator" || b.source?.includes("Generator"));
  }, [batches]);

  // Find the latest batch from Document Conversion for inline review
  const latestDocBatch = useMemo(() => {
    if (latestConvertedDocBatchId) {
      const found = batches.find(b => b.id === latestConvertedDocBatchId);
      if (found) return found;
    }
    return batches.find(b => 
      b.source === "Doc Conversion" || 
      b.source?.includes("Doc") || 
      b.source?.includes("Transcript") || 
      b.name?.toLowerCase().includes("doc") || 
      b.name?.toLowerCase().includes("transcript")
    );
  }, [batches, latestConvertedDocBatchId]);

  // Find the latest batch from TRiAD Alignment for inline review
  const latestTriadBatch = useMemo(() => {
    return batches.find(b => b.source === "TRiAD Alignment" || b.source?.includes("TRiAD"));
  }, [batches]);

  // Handler to clear uploaded document and input states
  const handleClearDocument = () => {
    setDocName("");
    setDocContent("");
    setDocConversionProgress(null);
    setLiteratureTheme("");
    setDocSuggestionExplanation("");
    setDocCount(8);
    setConverterInstructions("");
    const fileInput = document.getElementById("doc-file-input") as HTMLInputElement;
    if (fileInput) fileInput.value = "";
    setNotification({ text: "Document upload and content cleared.", type: "info" });
  };

  // Total examples counts
  const registryStats = useMemo(() => {
    let total = 0;
    let pending = 0;
    let approved = 0;
    let approvedExamples = 0;

    batches.forEach(b => {
      total += b.examplesCount;
      if (b.status === "Pending") pending += b.examplesCount;
      if (b.status === "Approved") {
        approved += b.examplesCount;
        approvedExamples += b.examples.length;
      }
    });

    return { total, pending, approved, approvedExamples };
  }, [batches]);

  // Total account-wide examples count across ALL user projects
  const accountTotalGenerations = useMemo(() => {
    let count = 0;

    // Sum active batches in memory for current project
    batches.forEach(b => {
      count += (b.examplesCount || b.examples?.length || 0);
    });

    // Sum batches from other projects in userProjects
    userProjects.forEach(p => {
      if (p.id !== selectedProjectId) {
        if (Array.isArray(p.batches)) {
          p.batches.forEach((b: any) => {
            count += (b.examplesCount || b.examples?.length || 0);
          });
        }
      }
    });

    return count;
  }, [batches, userProjects, selectedProjectId]);

  // Handle synthetic generation with high-reliability client-side chunking for large batches
  const handleSyntheticGenerate = async () => {
    if (isGenerating) return;
    if (isFieldsUnlocked || !selectedProjectId) {
      setNotification({ text: "Project definition must be saved and locked before generation.", type: "error" });
      return;
    }

    if (!await checkExampleAllowance(batchSize)) return;
    const generationProjectId = selectedProjectId;
    setIsGenerating(true);
    setGenerationProgress({ current: 0, total: batchSize, percent: 0 });
    setGenerationStage("Processing batch request");
    setNotification({ text: `Synthesizing ${batchSize} examples. Please wait...`, type: "info" });
    
    try {
      // Keep the selected batch intact; the API server schedules concurrent ten-model waves.
      const clientChunkSize = batchSize;
      const subChunkCounts: number[] = [];
      let remaining = batchSize;
      while (remaining > 0) {
        const cSize = Math.min(remaining, clientChunkSize);
        subChunkCounts.push(cSize);
        remaining -= cSize;
      }

      let accumulatedExamples: any[] = [];
      let hasPartialResult = false;
      let lastSource = "Generator";
      let serverBatchId: string | null = null;
      let generationHasStarted = false;
      const progressByChunk = new Map<number, number>();
      let completedProgressCount = 0;

      const updateJobProgress = (subChunkIdx: number, completedCount: number) => {
        const nextCount = Math.min(subChunkCounts[subChunkIdx], Math.max(0, completedCount));
        const previousCount = progressByChunk.get(subChunkIdx) || 0;
        progressByChunk.set(subChunkIdx, nextCount);
        completedProgressCount = Math.max(0, completedProgressCount + nextCount - previousCount);
        setGenerationProgress({
          current: Math.min(batchSize, completedProgressCount),
          total: batchSize,
          percent: Math.min(100, Math.round((completedProgressCount / batchSize) * 100))
        });
      };

      const clearJobProgress = (subChunkIdx: number) => {
        completedProgressCount = Math.max(0, completedProgressCount - (progressByChunk.get(subChunkIdx) || 0));
        progressByChunk.delete(subChunkIdx);
        setGenerationProgress({
          current: Math.min(batchSize, completedProgressCount),
          total: batchSize,
          percent: Math.min(100, Math.round((completedProgressCount / batchSize) * 100))
        });
      };

      // Execute sub-chunks (concurrency 2 for high reliability and rapid throughput)
      const chunkConcurrency = Math.min(2, subChunkCounts.length);
      let chunkIdx = 0;

      const runSubChunk = async (countToGen: number, currentSubIdx: number): Promise<any[]> => {
        try {
            const res = await projectApiFetch("/api/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                projectName: project.name,
                systemPrompt: project.systemPrompt,
                targetTask: project.targetTask,
                constraints: project.constraints,
                batchDescription: `${batchDesc} (Part ${currentSubIdx + 1}/${subChunkCounts.length})`,
                specialInstructions: batchInstructions,
                temporaryConstraints: batchTempConstraints,
                templateType: batchTemplate,
                instructTemplate: project.projectFormat === ProjectFormat.INSTRUCTION ? (project.instructTemplate || InstructTemplate.CHATML) : undefined,
                isInstruction: project.projectFormat === ProjectFormat.INSTRUCTION,
                representativePrompt: project.representativePrompt,
                representativeCompletion: project.representativeCompletion,
                count: countToGen,
                jobMode: true
              })
            });

            const startData = await res.json();
             if (res.status === 402) setShowExamplePaygate(true);
            if (!res.ok || !startData?.success) {
              throw new Error(startData?.error || `Generation request failed (${res.status}).`);
            }
            if (startData.status !== "running" || typeof startData.jobId !== "string") {
              throw new Error("Generation server did not return a valid job.");
            }
            if (typeof startData.batchId === "string" && startData.batchId) {
              serverBatchId = startData.batchId;
            }
            if (!generationHasStarted) setGenerationStage("Preparing generation");

            let data: any;
            while (true) {
              await new Promise(resolve => setTimeout(resolve, 2000));
              const statusRes = await fetch(`/api/generate/jobs/${encodeURIComponent(startData.jobId)}`, {
                cache: "no-store"
              });
              const statusData = await statusRes.json();

              if (!statusRes.ok || !statusData?.success) {
                throw new Error(statusData?.error || `Generation status check failed (${statusRes.status}).`);
              }
              if (statusData.progress && Number.isFinite(Number(statusData.progress.completed))) {
                updateJobProgress(currentSubIdx, Number(statusData.progress.completed));
              }
              if (statusData.phase === "generating" && !generationHasStarted) {
                generationHasStarted = true;
                setGenerationStage(null);
              }
              if (statusData.status === "error") {
                throw new Error(statusData.error || "Generation failed.");
              }
              if (statusData.status === "complete" || statusData.status === "partial") {
                data = statusData.result;
                if (typeof statusData.batchId === "string" && statusData.batchId) {
                  serverBatchId = statusData.batchId;
                }
                break;
              }
              if (statusData.status !== "running") {
                throw new Error("Generation server returned an unknown job status.");
              }
            }

            if (data?.success && Array.isArray(data.examples) && data.examples.length > 0) {
              if (data.source) lastSource = data.source;
              if ((data.batchId || data.id) && !serverBatchId) {
                serverBatchId = data.batchId || data.id;
              }
              if (data.partial === true) {
                hasPartialResult = true;
              }
              return data.examples;
            } else {
              throw new Error(data?.error || "Sub-batch returned empty response");
            }
        } catch (err: any) {
          clearJobProgress(currentSubIdx);
          throw err;
        }
      };

      const workers = Array.from({ length: chunkConcurrency }, async () => {
        while (chunkIdx < subChunkCounts.length) {
          const index = chunkIdx++;
          const count = subChunkCounts[index];
          const results = await runSubChunk(count, index);
          if (results.length > 0) {
            accumulatedExamples.push(...results);
            const currentCount = Math.max(completedProgressCount, accumulatedExamples.length);
            setGenerationProgress({
              current: Math.min(batchSize, currentCount),
              total: batchSize,
              percent: Math.min(100, Math.round((currentCount / batchSize) * 100))
            });
          }
        }
      });

      await Promise.all(workers);

      if (!hasPartialResult && accumulatedExamples.length !== batchSize) {
        throw new Error(`Generation returned ${accumulatedExamples.length} of ${batchSize} requested examples. The incomplete batch was not saved.`);
      }
      if (accumulatedExamples.length === 0) {
        throw new Error("Generation did not return any examples to save.");
      }
      if (accumulatedExamples.some(ex => !Array.isArray(ex?.messages)
        || !["user", "assistant"].every(role => ex.messages.some((m: any) =>
          m?.role === role && typeof m.content === "string" && m.content.trim().length > 0)))) {
        throw new Error("Generation returned an invalid or empty example. The batch was not saved.");
      }

      // Format unique IDs for generated items
      const finalExamples = accumulatedExamples.slice(0, batchSize).map((ex, idx) => ({
        ...ex,
        id: `synth-${Date.now()}-${idx}`
      }));

      const generatedBatchId = serverBatchId || `batch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      const newBatch: SFTBatch = {
        id: generatedBatchId,
        batchId: generatedBatchId,
        name: batchDesc.trim() || `Synthetic Batch #${batches.length + 1}`,
        source: "Generator",
        generationSettings: { ...project },
        templateType: batchTemplate,
        examplesCount: finalExamples.length,
        examples: finalExamples,
        status: "Pending",
        ...(hasPartialResult ? {
          partial: true,
          requestedExamples: batchSize
        } : {}),
        timestamp: new Date().toISOString().replace("T", " "),
        description: batchDesc,
        specialInstructions: batchInstructions,
        temporaryConstraints: batchTempConstraints
      };

      if (activeProjectId.current === generationProjectId) {
        setBatches(prev => [newBatch, ...prev]);
        setSelectedBatchId(newBatch.id);
      }
      const saved = await saveBatch(generationProjectId, newBatch);
      if (saved) {
        setNotification({
          text: hasPartialResult
            ? `Saved a partial batch with ${finalExamples.length}/${batchSize} examples to "${project.name}". Review the completed examples below.${activeProjectId.current !== generationProjectId ? " Open that project to review the batch." : ""}`
            : `Generated ${finalExamples.length}/${batchSize} examples and saved to "${project.name}".${activeProjectId.current !== generationProjectId ? " Open that project to review the batch." : ""}`,
          type: hasPartialResult ? "info" : "success"
        });
      }
    } catch {
    } finally {
      setIsGenerating(false);
      setGenerationStage(null);
      setTimeout(() => setGenerationProgress(null), 3000);
    }
  };

  // Suggest & Analyze Document SFT examples count and type based on content
  const handleSuggestDocCount = async (contentToAnalyze?: string, nameToAnalyze?: string) => {
    const content = contentToAnalyze !== undefined ? contentToAnalyze : docContent;
    const name = nameToAnalyze !== undefined ? nameToAnalyze : docName;

    if (!content || !content.trim()) return;
    setIsAnalyzingDoc(true);
    setDocSuggestionExplanation("Analyzing document structure, length, and narrative depth with AI...");

    try {
      const res = await fetch("/api/analyze-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentContent: content,
          documentName: name || docName || "Inline Document",
          docType,
          extractionModel
        })
      });
      const data = await res.json();
      if (data.success) {
        if (typeof data.estimatedCount === "number") {
          setDocCount(data.estimatedCount);
        }
        if (data.explanation) {
          setDocSuggestionExplanation(data.explanation);
        }
        if (data.recommendedDocType && ["knowledge_base", "transcript", "literature"].includes(data.recommendedDocType)) {
          setDocType(data.recommendedDocType as "knowledge_base" | "transcript" | "literature");
        }
        if (data.titleOrTheme) {
          setLiteratureTheme(`tell me the story of ${data.titleOrTheme}`);
        } else if (name) {
          setLiteratureTheme(`tell me the story of ${name.replace(/\.[^/.]+$/, "")}`);
        }
        setNotification({
          text: `AI Document Analysis Complete: Estimated ${data.estimatedCount || docCount} examples.`,
          type: "success"
        });
      } else {
        throw new Error(data.error || "Document analysis failed");
      }
    } catch (err: any) {
      console.warn("Document analysis fallback:", err);
      const words = content.trim().split(/\s+/).length;
      const count = Math.max(3, Math.min(30, Math.ceil(words / 250)));
      setDocCount(count);
      setDocSuggestionExplanation(`Analyzed ~${words} words. Estimated ${count} SFT examples for optimal coverage.`);
    } finally {
      setIsAnalyzingDoc(false);
    }
  };

  // Process uploaded document file (PDF, DOCX, Image, Text)
  const processUploadedDoc = async (file: File) => {
    setDocConversionProgress(null);
    const fileNameLower = file.name.toLowerCase();
    const isDocx = file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || fileNameLower.endsWith(".docx");
    const isPdf = file.type === "application/pdf" || fileNameLower.endsWith(".pdf");
    const isImage = file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|tiff)$/i.test(fileNameLower);

    let resolvedMime = file.type;
    if (isPdf) {
      resolvedMime = "application/pdf";
    } else if (isImage && !resolvedMime) {
      if (fileNameLower.endsWith(".png")) resolvedMime = "image/png";
      else if (fileNameLower.endsWith(".webp")) resolvedMime = "image/webp";
      else resolvedMime = "image/jpeg";
    }

    if (isPdf) {
      setNotification({ text: `Parsing and extracting full text from PDF "${truncateFileName(file.name, 30)}"...`, type: "info" });
      setIsConverting(true);

      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target?.result as string;
        try {
          const res = await fetch("/api/parse-pdf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileBase64: base64, fileName: file.name })
          });
          const data = await res.json();
          if (data.success && data.text) {
            setDocContent(data.text);
            setDocName(file.name);
            setNotification({
              text: `Successfully extracted ${data.pageCount ? `${data.pageCount} pages of ` : "full "}text from "${truncateFileName(file.name, 28)}" (${data.text.length.toLocaleString()} chars)!`,
              type: "success"
            });
            handleSuggestDocCount(data.text, file.name);
          } else {
            throw new Error(data.error || "PDF text extraction failed");
          }
        } catch (err: any) {
          const errMsg = err.message === "Load failed" || err.message === "Failed to fetch"
            ? "File processing or network timed out."
            : (err.message || err);
          setNotification({ text: `PDF extraction failed: ${errMsg}`, type: "error" });
        } finally {
          setIsConverting(false);
        }
      };
      reader.onerror = () => {
        setNotification({ text: "Could not read PDF file from disk.", type: "error" });
        setIsConverting(false);
      };
      reader.readAsDataURL(file);
    } else if (isDocx) {
      setNotification({ text: `Parsing Word document "${truncateFileName(file.name, 30)}"...`, type: "info" });
      setIsConverting(true);

      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target?.result as string;
        try {
          const res = await fetch("/api/parse-docx", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileBase64: base64 })
          });
          const data = await res.json();
          if (data.success) {
            setDocContent(data.text);
            setDocName(file.name);
            setNotification({ text: `Successfully extracted text from "${truncateFileName(file.name, 28)}"!`, type: "success" });
            handleSuggestDocCount(data.text, file.name);
          } else {
            throw new Error(data.error || "DOCX text extraction failed");
          }
        } catch (err: any) {
          const errMsg = err.message === "Load failed" || err.message === "Failed to fetch"
            ? "Network interrupted during file transfer."
            : (err.message || err);
          setNotification({ text: `DOCX extraction failed: ${errMsg}`, type: "error" });
        } finally {
          setIsConverting(false);
        }
      };
      reader.readAsDataURL(file);
    } else if (isImage) {
      setNotification({ text: `Running OCR text extraction on image "${truncateFileName(file.name, 30)}"...`, type: "info" });
      setIsConverting(true);
      
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target?.result as string;
        try {
          const res = await fetch("/api/ocr", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageBase64: base64,
              mimeType: resolvedMime || "image/png"
            })
          });
          const data = await res.json();
          if (data.success) {
            setDocContent(data.text);
            setDocName(file.name);
            setNotification({ text: `OCR text extraction complete for "${truncateFileName(file.name, 28)}"!`, type: "success" });
            handleSuggestDocCount(data.text, file.name);
          } else {
            throw new Error(data.error || "OCR failed");
          }
        } catch (err: any) {
          const errMsg = err.message === "Load failed" || err.message === "Failed to fetch"
            ? "Network interrupted during file transfer."
            : (err.message || err);
          setNotification({ text: `OCR extraction failed: ${errMsg}`, type: "error" });
        } finally {
          setIsConverting(false);
        }
      };
      reader.readAsDataURL(file);
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setDocContent(text);
        setDocName(file.name);
        setNotification({ text: `Successfully imported "${truncateFileName(file.name, 28)}" (${text.length} chars). Ready to parse.`, type: "success" });
        handleSuggestDocCount(text, file.name);
      };
      reader.readAsText(file);
    }
  };

  // Handle File upload input change
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processUploadedDoc(file);
    e.target.value = "";
  };

  // Trigger document file upload - checks session file access permission first
  const handleTriggerDocUpload = () => {
    if (!isUploadPermitted) {
      setShowUploadAccessModal(true);
    } else {
      docFileInputRef.current?.click();
    }
  };

  // Handle Accept for document uploader access
  const handleAcceptUpload = () => {
    setIsUploadPermitted(true);
    try {
      sessionStorage.setItem("triad_upload_access_granted", "true");
    } catch (e) {
      console.error(e);
    }
    setShowUploadAccessModal(false);
    if (pendingDroppedFile) {
      processUploadedDoc(pendingDroppedFile);
      setPendingDroppedFile(null);
    } else {
      setTimeout(() => {
        docFileInputRef.current?.click();
      }, 80);
    }
  };

  // Handle Decline for document uploader access
  const handleDeclineUpload = () => {
    setShowUploadAccessModal(false);
    setPendingDroppedFile(null);
    setNotification({ text: "File access request declined. Upload canceled.", type: "info" });
  };

  // Handle Drag & Drop on document upload dropzone
  const handleDropDoc = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingDoc(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (!isUploadPermitted) {
      setPendingDroppedFile(file);
      setShowUploadAccessModal(true);
    } else {
      processUploadedDoc(file);
    }
  };

  // Import custom JSON/JSONL dataset to the SFT registry
  const handleImportDataset = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      let content = event.target?.result as string;
      if (!content || !content.trim()) {
        setNotification({ text: "The uploaded file is empty.", type: "error" });
        return;
      }

      // Strip UTF-8 BOM if present
      content = content.replace(/^\uFEFF/, "");

      let parsedExamples: SFTExample[] = [];
      const lines = content.split("\n").map(l => l.trim()).filter(Boolean);

      // 1. Try JSON lines first with robust checking
      let parsedAsJsonLines = false;
      const jsonLinesList: any[] = [];
      let validJsonCount = 0;
      let invalidJsonCount = 0;

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;
        try {
          const parsed = JSON.parse(trimmedLine);
          if (parsed && typeof parsed === "object") {
            jsonLinesList.push(parsed);
            validJsonCount++;
          } else {
            invalidJsonCount++;
          }
        } catch (e) {
          invalidJsonCount++;
        }
      }

      if (validJsonCount > 0 && validJsonCount >= invalidJsonCount) {
        parsedAsJsonLines = true;
      }

      let rawItems = parsedAsJsonLines && jsonLinesList.length > 0 ? jsonLinesList : null;

      // 2. Try single JSON array if JSON Lines failed
      if (!rawItems) {
        try {
          const data = JSON.parse(content);
          if (Array.isArray(data)) {
            rawItems = data;
          } else if (data && typeof data === "object") {
            rawItems = [data];
          }
        } catch (err) {
          // not valid single JSON
        }
      }

      if (!rawItems || rawItems.length === 0) {
        setNotification({ text: "Could not parse file as JSON/JSONL. Parsing line-by-line as raw prompts.", type: "info" });
        rawItems = lines.map(line => ({
          prompt: line,
          response_helpful: "Default system-aligned response template."
        }));
      }

      // Convert rawItems to SFTExample format
      parsedExamples = rawItems.map((item, idx) => {
        if (item.messages && Array.isArray(item.messages)) {
          return {
            id: `imported-${idx}-${Date.now()}`,
            messages: item.messages.map((m: any) => ({
              role: m.role || "user",
              content: m.content || "",
              reasoning: m.reasoning || undefined
            }))
          };
        } else {
          const prompt = item.prompt || item.instruction || item.input || `Imported Prompt #${idx + 1}`;
          const response = item.response_helpful || item.response || item.output || item.helpful || "No response provided.";
          return {
            id: `imported-${idx}-${Date.now()}`,
            messages: [
              { role: "system", content: project.systemPrompt || "You are SFT Studio Pro, a helpful assistant." },
              { role: "user", content: prompt },
              { role: "assistant", content: response }
            ]
          };
        }
      });

      if (parsedExamples.length === 0) {
        setNotification({ text: "No valid examples extracted from the file.", type: "error" });
        return;
      }

      if (!checkGenerationLimit(parsedExamples.length)) {
        e.target.value = "";
        return;
      }

      const newBatchId = `imported-batch-${Date.now()}`;
      const newBatch: SFTBatch = {
        id: newBatchId,
        batchId: newBatchId,
        name: file.name.replace(/\.[^/.]+$/, "") + " (Imported)",
        source: "Dataset Import",
        templateType: TemplateType.SINGLE_TURN,
        examplesCount: parsedExamples.length,
        examples: parsedExamples,
        status: "Pending",
        timestamp: new Date().toISOString().replace("T", " ").substring(0, 16),
        description: `Manually imported from "${file.name}" for review.`
      };

      setBatches(prev => [newBatch, ...prev]);
      setSelectedBatchId(newBatchId);
      if (selectedProjectId) {
        saveBatch(selectedProjectId, newBatch);
      }

      setNotification({
        text: `Successfully imported "${file.name}" with ${parsedExamples.length} examples. Saved to database. Review and approve in Assessor to add to Registry.`,
        type: "success"
      });

      e.target.value = "";
    };

    reader.onerror = () => {
      setNotification({ text: "Failed to read the uploaded file.", type: "error" });
    };

    reader.readAsText(file);
  };

  // Convert uploaded document
  const handleConvertDocument = async () => {
    if (isFieldsUnlocked || !selectedProjectId) {
      setNotification({ text: "Project definition must be saved and locked before converting documents.", type: "error" });
      return;
    }
    if (!docContent.trim()) {
      setNotification({ text: "Please provide document content or upload a text-based file first.", type: "error" });
      return;
    }
    if (!await checkExampleAllowance(docType === "transcript" ? 1 : docCount)) return;

    const tracksGenerationProgress = docType === "knowledge_base" || docType === "literature";
    setDocConversionProgress(tracksGenerationProgress ? { completed: 0, total: docCount } : null);
    setIsConverting(true);
    setNotification({ text: "Processing document and converting to structured SFT examples...", type: "info" });

    try {
      const effectiveTemplate = docTemplate;

      const conversionProjectId = selectedProjectId;
      const res = await projectApiFetch("/api/convert-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentName: docName || "Inline Document",
          async: true,
          documentContent: docContent,
          templateType: effectiveTemplate,
          instructTemplate: project.projectFormat === ProjectFormat.INSTRUCTION ? (project.instructTemplate || InstructTemplate.CHATML) : undefined,
          isInstruction: project.projectFormat === ProjectFormat.INSTRUCTION,
          count: docCount,
          extractionModel,
          projectName: project.name,
          systemPrompt: project.systemPrompt,
          targetTask: project.targetTask,
          constraints: project.constraints,
          docType,
          isTranscript: docType === "transcript",
          transcriptLayout,
          userTag: userTag.trim(),
          assistantTag: assistantTag.trim(),
          fixedUserPrompt,
          literatureTheme,
          converterInstructions: converterInstructions.trim()
        })
      });

      let data: any = {};
      try {
        data = await res.json();
      } catch (jsonErr) {
        throw new Error(`Server returned status ${res.status}: unable to parse response.`);
      }

      if (res.status === 402) setShowExamplePaygate(true);
      if (!res.ok) throw new Error(data.error || `Conversion request failed (${res.status}).`);
      if (res.status === 202) {
        if (typeof data.jobId !== "string") throw new Error("Conversion job ID is missing.");
        const jobId = data.jobId;
        while (true) {
          await new Promise(resolve => setTimeout(resolve, 1500));
          const statusResponse = await projectApiFetch(`/api/convert-document/jobs/${encodeURIComponent(jobId)}`);
          const status = await statusResponse.json();
          if (!statusResponse.ok) throw new Error(status.error || "Unable to retrieve conversion results.");
          if (tracksGenerationProgress && Number.isFinite(status.completed) && Number.isFinite(status.total)) {
            setDocConversionProgress({
              completed: Math.max(0, Math.min(status.completed, status.total)),
              total: status.total
            });
          }
          if (status.status === "running") continue;
          if (!status.result) throw new Error("Conversion returned no result.");
          data = status.result;
          break;
        }
      }

      if (data.success && Array.isArray(data.examples) && data.examples.length > 0) {
        if (tracksGenerationProgress) {
          setDocConversionProgress({
            completed: data.examples.length,
            total: data.requestedCount || docCount
          });
        }
        const truncatedDocName = truncateFileName(docName, 32);
        const generatedBatchId = data.batchId || data.id || `batch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const newBatch: SFTBatch = {
          id: generatedBatchId,
          batchId: generatedBatchId,
          name: `Doc (${docType === "transcript" ? "Transcript" : docType.toUpperCase()}): ${truncatedDocName || "Extract"}`,
          source: data.source || (docType === "transcript" ? "Verbatim Transcript Conversion" : "Doc Conversion"),
          templateType: data.templateType || effectiveTemplate,
          examplesCount: data.examples.length,
          examples: data.examples,
          partial: Boolean(data.partial),
          requestedExamples: data.requestedCount || docCount,
          status: "Pending",
          timestamp: new Date().toISOString().slice(0, 16).replace("T", " "),
          description: `Extracted from "${truncatedDocName || "Raw Text"}" • Format: ${project.projectFormat === ProjectFormat.INSTRUCTION ? `Instruction (${project.instructTemplate || "ChatML"})` : "Conversation"}`
        };

        setBatches(prev => [newBatch, ...prev]);
        setSelectedBatchId(newBatch.id);
        setLatestConvertedDocBatchId(newBatch.id);
        if (conversionProjectId) {
          const saved = await saveBatch(conversionProjectId, newBatch);
          if (!saved) {
            setNotification({ text: "Conversion completed. Examples are available below and cached locally, but the server save failed.", type: "error" });
            return;
          }
        }
        setNotification({ text: data.partial
          ? `Partial conversion: ${data.examples.length} of ${data.requestedCount || docCount} examples completed and displayed below for review.`
          : `Converted successfully! ${data.examples.length} examples extracted and displayed below for review & approval.`, type: data.partial ? "info" : "success" });
        setTimeout(() => {
          document.getElementById("doc-conversion-review-card")?.scrollIntoView({ behavior: "smooth" });
        }, 150);
      } else {
        throw new Error(data.error || "Unknown conversion error");
      }
    } catch (err: any) {
      setNotification({ text: `Conversion failed: ${err.message}`, type: "error" });
    } finally {
      setIsConverting(false);
    }
  };

  // Handle TRiAD alignment import
  const handleTriadImport = async () => {
    if (isFieldsUnlocked || !selectedProjectId) {
      setNotification({ text: "Project definition must be saved and locked before importing TRiAD datasets.", type: "error" });
      return;
    }
    const datasetUrl = triadUrls[triadSize]?.trim();
    if (!datasetUrl) {
      setNotification({ text: "Enter a dataset URL before importing.", type: "error" });
      return;
    }
    setIsTriadImporting(true);
    setNotification({ text: `Importing up to ${triadSize} examples from the dataset URL...`, type: "info" });

    try {
      const res = await fetch("/api/triad-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt: project.systemPrompt,
          size: triadSize,
          customUrl: datasetUrl
        })
      });

      const data = await res.json();
      if (data.success) {
        const generatedBatchId = data.batchId || data.id || `batch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const newBatch: SFTBatch = {
          id: generatedBatchId,
          batchId: generatedBatchId,
          name: `TRiAD Alignment Dataset (${data.examples.length}x)`,
          source: "TRiAD Alignment",
          templateType: triadTemplate,
          examplesCount: data.examples.length,
          examples: data.examples,
          status: "Approved", // TRiAD goes straight in
          timestamp: new Date().toISOString().slice(0, 16).replace("T", " "),
          description: "Imported from an external dataset URL."
        };

        setBatches(prev => [...prev, newBatch]);
        setSelectedRegistryBatches(prev => ({ ...prev, [newBatch.id]: true }));
        if (selectedProjectId) {
          saveBatch(selectedProjectId, newBatch);
        }
        setNotification({ text: `TRiAD alignment imported successfully. Added directly to Registry. Prompt: "${project.systemPrompt.slice(0, 40)}..."`, type: "success" });
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      setNotification({ text: `TRiAD import failed: ${err.message}`, type: "error" });
    } finally {
      setIsTriadImporting(false);
    }
  };

  // Run SFT Quality Assessment
  const handleAnalyzeQuality = async (batchId: string) => {
    const targetBatch = batches.find(b => b.id === batchId);
    if (!targetBatch) return;

    setIsAssessing(true);
    setNotification({ text: `Auditing batch "${targetBatch.name}" with SFT validator...`, type: "info" });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);

      const res = await fetch("/api/analyze-quality", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          examples: targetBatch.examples,
          systemPrompt: project.systemPrompt,
          targetTask: project.targetTask,
          constraints: project.constraints,
          templateType: targetBatch.templateType || project.templateType,
          instructTemplate: project.projectFormat === ProjectFormat.INSTRUCTION ? project.instructTemplate : undefined
        })
      });

      clearTimeout(timeoutId);

      const data = await res.json();
      if (data.success) {
        setReports(prev => ({
          ...prev,
          [batchId]: data.report
        }));
        const reviewedBatch = { ...targetBatch, qualityReport: data.report };
        setBatches(prev => prev.map(b => b.id === batchId ? reviewedBatch : b));
        setSelectedRegistryBatches(prev => ({ ...prev, [batchId]: true }));
        if (selectedProjectId) await saveBatch(selectedProjectId, reviewedBatch);
        setNotification({ text: `AI Audit Complete. Quality Score: ${data.report.overallScore}/100.`, type: "success" });
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      setNotification({ text: `Audit analysis failed: ${err.message}`, type: "error" });
    } finally {
      setIsAssessing(false);
    }
  };

  // Regenerate flagged examples based on quality assessment feedback
  const handleRegenerateFlagged = async (batchId: string) => {
    const targetBatch = batches.find(b => b.id === batchId);
    const targetReport = reports[batchId] || targetBatch?.qualityReport;
    if (!targetBatch || !targetReport) {
      setNotification({ text: "Please run an AI Quality Audit first before regenerating flagged examples.", type: "info" });
      return;
    }

    // Find all issues associated with specific examples
    const issuesByIndex = new Map<number, QualityIssue[]>();
    (targetReport.issues || []).forEach(iss => {
      if (iss.exampleIndex >= 0 && iss.exampleIndex < targetBatch.examples.length) {
        const existing = issuesByIndex.get(iss.exampleIndex) || [];
        existing.push(iss);
        issuesByIndex.set(iss.exampleIndex, existing);
      }
    });

    if (issuesByIndex.size === 0) {
      setNotification({ text: "No flagged examples found in the current audit report.", type: "info" });
      return;
    }

    const flaggedItems = Array.from(issuesByIndex.entries()).map(([exampleIndex, issues]) => ({
      exampleIndex,
      example: targetBatch.examples[exampleIndex],
      issues
    }));

    setIsRegeneratingFlagged(true);
    setQaRepairProgress({ completed: 0, total: flaggedItems.length, saving: false });
    setNotification({
      text: `Regenerating ${flaggedItems.length} flagged example(s) with AI using QA feedback...`,
      type: "info"
    });

    try {
      const repairProjectId = selectedProjectId;
      const originalSettings = targetBatch.generationSettings || project;
      const res = await projectApiFetch("/api/regenerate-flagged", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flaggedItems,
          jobMode: true,
          suggestions: targetReport.suggestions || [],
          systemPrompt: originalSettings.systemPrompt,
          targetTask: originalSettings.targetTask,
          constraints: originalSettings.constraints,
          templateType: targetBatch.templateType,
          batchDescription: targetBatch.description,
          specialInstructions: targetBatch.specialInstructions,
          temporaryConstraints: targetBatch.temporaryConstraints,
          instructTemplate: originalSettings.projectFormat === ProjectFormat.INSTRUCTION ? originalSettings.instructTemplate : undefined,
          representativePrompt: originalSettings.representativePrompt,
          representativeCompletion: originalSettings.representativeCompletion
        })
      });

      let data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to regenerate flagged examples.");
      }
      if (res.status === 202) {
        if (typeof data.jobId !== "string") throw new Error("QA repair job ID is missing.");
        const jobId = data.jobId;
        while (true) {
          await new Promise(resolve => setTimeout(resolve, 1500));
          const statusRes = await projectApiFetch(`/api/regenerate-flagged/jobs/${encodeURIComponent(jobId)}`);
          const status = await statusRes.json();
          if (!statusRes.ok) throw new Error(status.error || "Unable to retrieve QA repairs.");
          setQaRepairProgress({ completed: status.completed, total: status.total, saving: false });
          if (status.status === "running") {
            setNotification({ text: `Repairing flagged responses: ${status.completed}/${status.total} processed...`, type: "info" });
            continue;
          }
          data = status.result;
          if (!data?.success) throw new Error(data?.error || "QA repair failed.");
          break;
        }
      }

      const regeneratedList: { exampleIndex: number; messages: SFTMessage[] }[] = data.regeneratedExamples || [];
      if (regeneratedList.length === 0) {
        throw new Error("No regenerated examples were returned by the AI engine.");
      }
      if (regeneratedList.some(item => !issuesByIndex.has(item.exampleIndex) || !item.messages?.length)
        || new Set(regeneratedList.map(item => item.exampleIndex)).size !== regeneratedList.length) {
        throw new Error("QA repair returned unexpected or duplicate example indices.");
      }

      // Map new examples into the batch
      setQaRepairProgress({ completed: flaggedItems.length, total: flaggedItems.length, saving: true });
      const newExamples = [...targetBatch.examples];
      const regeneratedIndices = new Set(regeneratedList.map(r => r.exampleIndex));
      regeneratedList.forEach(item => {
        if (item.exampleIndex >= 0 && item.exampleIndex < newExamples.length) {
          newExamples[item.exampleIndex] = {
            ...newExamples[item.exampleIndex],
            messages: item.messages
          };
        }
      });

      const remainingIssues = targetReport.issues.filter(issue => !regeneratedIndices.has(issue.exampleIndex));
      const remainingFlagged = new Set(remainingIssues.map(issue => issue.exampleIndex)).size;
      const updatedReport: QualityReport = {
        ...targetReport,
        overallScore: Math.round((newExamples.length - remainingFlagged) / newExamples.length * 100),
        issues: remainingIssues,
        suggestions: remainingIssues.length ? targetReport.suggestions : [],
        duplicateCheck: remainingIssues.length ? targetReport.duplicateCheck : {
          duplicatesFound: 0, duplicatesList: [], deduplicatedLength: newExamples.length
        },
        stats: { totalExamples: newExamples.length, flaggedCount: remainingFlagged, passedCount: newExamples.length - remainingFlagged }
      };
      const updatedBatch: SFTBatch = {
        ...targetBatch,
        examples: newExamples,
        examplesCount: newExamples.length,
        qualityReport: updatedReport
      };

      // Persist to database / local storage if within a selected project
      if (repairProjectId) {
        const saved = await saveBatch(repairProjectId, updatedBatch);
        if (!saved) {
          setBatches(prev => prev.map(b => b.id === batchId ? { ...updatedBatch, qualityReport: targetReport } : b));
          throw new Error("Responses repaired locally, but saving failed. The QA score has not been cleared.");
        }
      }
      if (activeProjectId.current === repairProjectId) {
        setBatches(prev => prev.map(b => (b.id === batchId ? updatedBatch : b)));
        setReports(prev => ({ ...prev, [batchId]: updatedReport }));
      }

      setNotification({
        text: remainingFlagged
          ? `Repaired ${regeneratedList.length} flagged examples. ${remainingFlagged} remain flagged; successful repairs were saved.`
          : `All ${regeneratedList.length} flagged examples repaired and saved. QA score: 100%.`,
        type: remainingFlagged ? "info" : "success"
      });
    } catch (err: any) {
      setNotification({ text: `Regeneration failed: ${err.message}`, type: "error" });
    } finally {
      setIsRegeneratingFlagged(false);
      setQaRepairProgress(null);
    }
  };

  // Deduplicate examples and remove ALL flagged items inside batch
  const handleDeduplicate = (batchId: string) => {
    const targetBatch = batches.find(b => b.id === batchId);
    if (!targetBatch) return;

    const targetReport = reports[batchId] || targetBatch.qualityReport;
    const flaggedIndices = new Set<number>(
      (targetReport?.issues || []).map(iss => iss.exampleIndex)
    );

    if (!confirm(`Are you sure you want to deduplicate this batch AND delete ALL flagged examples (${flaggedIndices.size} flagged items)? This cannot be undone.`)) {
      return;
    }
    
    const uniqueExamples: SFTExample[] = [];
    const seenPrompts = new Set<string>();

    targetBatch.examples.forEach((ex, exIdx) => {
      // Delete ALL flagged examples (High, Medium, Low severity)
      if (flaggedIndices.has(exIdx)) return;

      const userMsg = ex.messages.find(m => m.role === "user");
      const p = userMsg ? userMsg.content.trim().toLowerCase() : "";
      if (!p || !seenPrompts.has(p)) {
        if (p) seenPrompts.add(p);
        uniqueExamples.push(ex);
      }
    });

    const removedCount = targetBatch.examples.length - uniqueExamples.length;
    const updatedReport: QualityReport | undefined = targetReport
      ? {
          ...targetReport,
          overallScore: 100,
          issues: [],
          suggestions: [],
          duplicateCheck: {
            duplicatesFound: 0,
            duplicatesList: [],
            deduplicatedLength: uniqueExamples.length
          },
          stats: {
            totalExamples: uniqueExamples.length,
            flaggedCount: 0,
            passedCount: uniqueExamples.length
          }
        }
      : undefined;
    const updatedTargetBatch: SFTBatch = {
      ...targetBatch,
      examples: uniqueExamples,
      examplesCount: uniqueExamples.length,
      ...(updatedReport ? { qualityReport: updatedReport } : {})
    };

    setBatches(prev => prev.map(b => (b.id === batchId ? updatedTargetBatch : b)));
    if (updatedReport) {
      setReports(prev => ({ ...prev, [batchId]: updatedReport }));
    }

    if (selectedProjectId) {
      saveBatch(selectedProjectId, updatedTargetBatch);
    }

    setNotification({
      text: `Deduplicated batch: deleted all ${flaggedIndices.size} flagged items & duplicates. Removed ${removedCount} items total. Clean batch: ${uniqueExamples.length} examples. Please run an AI Quality Audit to verify.`,
      type: "success"
    });

    // Clear stale audit report so the user is prompted to run a fresh audit on the deduplicated batch
    setReports(prev => {
      const next = { ...prev };
      delete next[batchId];
      return next;
    });
  };

  // Update batch approval status
  const handleUpdateBatchStatus = (batchId: string, status: "Approved" | "Rejected" | "Pending") => {
    let targetName = "";
    setBatches(prev => prev.map(b => {
      if (b.id === batchId) {
        targetName = b.name;
        const updated = { ...b, status };
        if (selectedProjectId) {
          saveBatch(selectedProjectId, updated);
        }
        if (status === "Approved") {
          setSelectedRegistryBatches(prevReg => ({ ...prevReg, [batchId]: true }));
        } else {
          setSelectedRegistryBatches(prevReg => ({ ...prevReg, [batchId]: false }));
        }
        return updated;
      }
      return b;
    }));

    setNotification({
      text: status === "Approved"
        ? `Batch "${targetName || batchId}" approved! Saved to database & added to Registry.`
        : `Batch "${targetName || batchId}" marked as ${status} (saved to database).`,
      type: "success"
    });
  };

  // Delete an entire batch
  const handleDeleteBatch = async (batchId: string) => {
    const target = batches.find(b => b.id === batchId);
    setBatches(prev => prev.filter(b => b.id !== batchId));
    if (selectedBatchId === batchId) {
      const remaining = batches.filter(b => b.id !== batchId);
      setSelectedBatchId(remaining.length > 0 ? remaining[0].id : "");
    }
    if (selectedProjectId) {
      await deleteBatch(selectedProjectId, batchId);
    }
    setNotification({ text: `Batch "${target?.name || batchId}" deleted.`, type: "success" });
  };

  // SFT Example Editing logic
  const handleStartEditExample = (batchId: string, index: number, example: SFTExample) => {
    setEditingExampleBatchId(batchId);
    setEditingExampleIndex(index);
    setEditingMessages(JSON.parse(JSON.stringify(example.messages)));
  };

  const handleUpdateMessageContent = (msgIdx: number, newContent: string) => {
    setEditingMessages(prev => prev.map((m, idx) => idx === msgIdx ? { ...m, content: newContent } : m));
  };

  const handleUpdateMessageReasoning = (msgIdx: number, newReasoning: string) => {
    setEditingMessages(prev => prev.map((m, idx) => idx === msgIdx ? { ...m, reasoning: newReasoning } : m));
  };

  const handleSaveEditedExample = () => {
    if (!editingExampleBatchId || editingExampleIndex === null) return;
    const targetBatch = batches.find(b => b.id === editingExampleBatchId);
    if (!targetBatch) return;

    const updatedExamples = [...targetBatch.examples];
    updatedExamples[editingExampleIndex] = {
      messages: editingMessages
    };
    const updatedTargetBatch: SFTBatch = {
      ...targetBatch,
      examples: updatedExamples,
      examplesCount: updatedExamples.length
    };

    setBatches(prev => prev.map(b => (b.id === editingExampleBatchId ? updatedTargetBatch : b)));

    if (selectedProjectId) {
      saveBatch(selectedProjectId, updatedTargetBatch);
    }

    setNotification({ text: "SFT example updated successfully.", type: "success" });
    setEditingExampleBatchId(null);
    setEditingExampleIndex(null);
  };

  const handleDeleteExample = (batchId: string, index: number) => {
    const targetBatch = batches.find(b => b.id === batchId);
    if (!targetBatch) return;

    const remainingExamples = targetBatch.examples.filter((_, idx) => idx !== index);
    const updatedTargetBatch: SFTBatch = {
      ...targetBatch,
      examples: remainingExamples,
      examplesCount: remainingExamples.length
    };

    setBatches(prev => prev.map(b => (b.id === batchId ? updatedTargetBatch : b)));

    if (selectedProjectId) {
      saveBatch(selectedProjectId, updatedTargetBatch);
    }

    // Update active report state: remove issues on deleted example and decrement subsequent issues
    setReports(prev => {
      const currentRep = prev[batchId];
      if (!currentRep) return prev;

      const updatedIssues = (currentRep.issues || [])
        .filter(iss => iss.exampleIndex !== index)
        .map(iss => {
          if (iss.exampleIndex > index) {
            return { ...iss, exampleIndex: iss.exampleIndex - 1 };
          }
          return iss;
        });

      const total = remainingExamples.length;
      const flaggedIndices = new Set(updatedIssues.map(i => i.exampleIndex));
      const flaggedCount = flaggedIndices.size;
      const passedCount = Math.max(0, total - flaggedCount);
      const overallScore = total > 0 ? Math.round((passedCount / total) * 100) : 100;

      return {
        ...prev,
        [batchId]: {
          ...currentRep,
          overallScore,
          issues: updatedIssues,
          stats: {
            ...currentRep.stats,
            totalExamples: total,
            flaggedCount,
            passedCount
          }
        }
      };
    });

    setNotification({ text: "Removed training example from batch.", type: "success" });
  };

  // Registry Batch selections
  const isRegistryEligible = (batch: SFTBatch) =>
    batch.status !== "Rejected"
    && (batch.source === "TRiAD Alignment" || Boolean(reports[batch.id] || batch.qualityReport));

  const toggleSelectRegistryBatch = (batchId: string) => {
    const batch = batches.find(b => b.id === batchId);
    if (!batch || !isRegistryEligible(batch)) return;
    setSelectedRegistryBatches(prev => ({
      ...prev,
      [batchId]: prev[batchId] === false
    }));
  };

  // Compiled Approved Datasets & Validator Generator logic
  const selectedApprovedBatches = useMemo(() => {
    return batches.filter(b => isRegistryEligible(b) && selectedRegistryBatches[b.id] !== false);
  }, [batches, selectedRegistryBatches, reports]);

  useEffect(() => {
    setExportedPreview("");
  }, [selectedApprovedBatches, exportTemplateFormat]);

  const compiledDataset = useMemo(() => {
    const allExamples: SFTExample[] = [];
    selectedApprovedBatches.forEach(b => {
      allExamples.push(...b.examples);
    });

    const totalCount = allExamples.length;
    if (totalCount === 0) {
      return { trainingSet: [], validationSet: [] };
    }

    // Validation set is exactly ~10%
    const validatorCount = Math.max(1, Math.round(totalCount * 0.1));
    
    const trainingSet: SFTExample[] = [];
    const validationSet: SFTExample[] = [];

    if (totalCount === 1) {
      // If there is only 1 item, put it in both sets so neither is empty or greyed out
      trainingSet.push(allExamples[0]);
      validationSet.push(allExamples[0]);
    } else {
      allExamples.forEach((ex, idx) => {
        // Simple partition: put the first validatorCount items into the validationSet, remainder in trainingSet
        if (idx < validatorCount) {
          validationSet.push(ex);
        } else {
          trainingSet.push(ex);
        }
      });
    }

    return { trainingSet, validationSet };
  }, [selectedApprovedBatches]);

  // Helper to format SFT examples according to target template format (ChatML, Alpaca, Maestro, DeepSeek, OpenAI o1/o3, ShareGPT, Prompt/Response)
  const formatExampleForExport = (ex: SFTExample, targetFormat: string) => {
    if (!ex || !Array.isArray(ex.messages) || ex.messages.length === 0) return ex;

    // Helper to sanitize any stray or accidental "/n" string artifacts into clean newlines
    const cleanExportText = (text: any): string => {
      if (text === null || text === undefined) return "";
      let str = typeof text === "string" ? text : String(text);
      // Remove accidental literal "/n" artifacts (forward slash n) which should be clean newlines
      str = str.replace(/\\\/n/g, "\n");
      str = str.replace(/(?<=\s|^)\/n(?=\s|$)/g, "\n");
      str = str.replace(/(?<=[a-zA-Z0-9.,!?;:])\/n(?=[a-zA-Z0-9])/g, "\n");
      str = str.replace(/\s*\/n\s*/g, "\n");
      // Normalize Windows CRLF to standard \n
      str = str.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      return str.trim();
    };

    // Preserve exact messages array without destructive text regex mangling
    const rawMessages = ex.messages.map(m => ({
      role: m.role,
      content: cleanExportText(m.content),
      ...(m.reasoning ? { reasoning: cleanExportText(m.reasoning) } : {}),
      ...(m.reasoning_content ? { reasoning_content: cleanExportText(m.reasoning_content) } : {})
    }));

    // Detect example structural metadata
    const userCount = rawMessages.filter(m => m.role === "user").length;
    const assistantCount = rawMessages.filter(m => m.role === "assistant").length;
    const isMultiTurn = userCount > 1 || assistantCount > 1;

    // 1. Regular ChatML Conversation Format (messages: [{ role, content }])
    if (targetFormat === "chatml" || targetFormat === "openai") {
      return {
        messages: rawMessages.map(m => {
          const cleanMsg: Record<string, any> = { role: m.role, content: cleanExportText(m.content) };
          const reasoningVal = m.reasoning || m.reasoning_content;
          if (m.role === "assistant" && reasoningVal) {
            cleanMsg.reasoning_content = cleanExportText(reasoningVal);
          }
          return cleanMsg;
        })
      };
    }

    // 1b. ChatML Instruction Variant (<|im_start|> / <|im_end|> raw tokenized text)
    if (targetFormat === "chatml_token" || targetFormat === "chatml_tokens" || targetFormat === "chatml_raw" || targetFormat === "chatml_instruction") {
      const parts: string[] = [];
      rawMessages.forEach(m => {
        let content = cleanExportText(m.content || "");
        const reasoningVal = m.reasoning || m.reasoning_content;
        if (m.role === "assistant" && reasoningVal) {
          const thinkBlock = `<think>\n${cleanExportText(reasoningVal)}\n</think>\n\n`;
          content = content.startsWith("<think>") ? content : `${thinkBlock}${content}`;
        }
        parts.push(`<|im_start|>${m.role}\n${content}\n<|im_end|>`);
      });
      return {
        text: parts.join("\n")
      };
    }

    // 2. Alpaca Instruction Format (instruction, input, output)
    if (targetFormat === "alpaca") {
      const sysMsg = rawMessages.find(m => m.role === "system");
      const userMsgs = rawMessages.filter(m => m.role === "user");
      const assistantMsgs = rawMessages.filter(m => m.role === "assistant");

      let instruction = "";
      let input = "";
      const primaryUserContent = cleanExportText(userMsgs[0]?.content || "");

      if (primaryUserContent.includes("### Instruction:") || primaryUserContent.includes("### Response:")) {
        const instMatch = primaryUserContent.match(/### Instruction:\s*([\s\S]*?)(?=### Input:|### Response:|$)/i);
        const inputMatch = primaryUserContent.match(/### Input:\s*([\s\S]*?)(?=### Response:|$)/i);
        instruction = cleanExportText(instMatch ? instMatch[1].trim() : primaryUserContent.replace(/### Instruction:\s*/i, "").trim());
        input = cleanExportText(inputMatch ? inputMatch[1].trim() : "");
      } else {
        instruction = cleanExportText(userMsgs[0]?.content || (sysMsg ? sysMsg.content : ""));
        if (isMultiTurn) {
          instruction = cleanExportText(sysMsg?.content || "Follow the conversation dialogue below:");
          input = userMsgs.map((m, idx) => `[User Turn ${idx + 1}]: ${cleanExportText(m.content)}`).join("\n\n");
        } else if (sysMsg && userMsgs.length > 0) {
          input = "";
        }
      }

      const output = assistantMsgs.map(m => {
        let val = cleanExportText(m.content || "");
        if (val.startsWith("### Response:\n") || val.startsWith("### Response:")) {
          val = val.replace(/^### Response:\s*/i, "").trim();
        }
        const reasoningVal = m.reasoning || m.reasoning_content;
        if (reasoningVal) {
          const thinkBlock = `<think>\n${cleanExportText(reasoningVal)}\n</think>\n\n`;
          val = val.startsWith("<think>") ? val : `${thinkBlock}${val}`;
        }
        return cleanExportText(val);
      }).join("\n\n");

      return {
        ...(sysMsg && !isMultiTurn ? { system: cleanExportText(sysMsg.content) } : {}),
        instruction,
        input,
        output
      };
    }

    // 3. Maestro Format (system, instruction, input, response)
    if (targetFormat === "maestro") {
      const sysMsg = rawMessages.find(m => m.role === "system");
      const userMsgs = rawMessages.filter(m => m.role === "user");
      const assistantMsgs = rawMessages.filter(m => m.role === "assistant");

      let instruction = "";
      let input = "";
      const primaryUserContent = cleanExportText(userMsgs[0]?.content || "");

      if (primaryUserContent.includes("### Instruction:") || primaryUserContent.includes("### Response:")) {
        const instMatch = primaryUserContent.match(/### Instruction:\s*([\s\S]*?)(?=### Input:|### Response:|$)/i);
        const inputMatch = primaryUserContent.match(/### Input:\s*([\s\S]*?)(?=### Response:|$)/i);
        instruction = cleanExportText(instMatch ? instMatch[1].trim() : primaryUserContent.replace(/### Instruction:\s*/i, "").trim());
        input = cleanExportText(inputMatch ? inputMatch[1].trim() : "");
      } else {
        instruction = cleanExportText(userMsgs[0]?.content || "");
        if (isMultiTurn) {
          input = userMsgs.slice(1).map((m, idx) => `[User Turn ${idx + 2}]: ${cleanExportText(m.content)}`).join("\n\n");
        }
      }

      const response = assistantMsgs.map(m => {
        let val = cleanExportText(m.content || "");
        if (val.startsWith("### Response:\n") || val.startsWith("### Response:")) {
          val = val.replace(/^### Response:\s*/i, "").trim();
        }
        const reasoningVal = m.reasoning || m.reasoning_content;
        if (reasoningVal) {
          const thinkBlock = `<think>\n${cleanExportText(reasoningVal)}\n</think>\n\n`;
          val = val.startsWith("<think>") ? val : `${thinkBlock}${val}`;
        }
        return cleanExportText(val);
      }).join("\n\n");

      const systemContent = cleanExportText(sysMsg ? sysMsg.content : (project.systemPrompt || ""));

      return {
        system: systemContent,
        instruction,
        input: input || "",
        response
      };
    }

    // 4. OpenAI o1/o3 Reasoning Format (System prompts are NOT supported in OpenAI reasoning fine-tuning)
    if (targetFormat === "openai_o1_o3") {
      return {
        messages: rawMessages
          .filter(m => m.role !== "system")
          .map(m => {
            const cleanMsg: Record<string, any> = { role: m.role, content: cleanExportText(m.content) };
            const reasoningVal = m.reasoning || m.reasoning_content;
            if (m.role === "assistant" && reasoningVal) {
              cleanMsg.reasoning_content = cleanExportText(reasoningVal);
            }
            return cleanMsg;
          })
      };
    }

    // 5. DeepSeek R1 / Reasoning (<think> Tags inside Assistant Content)
    if (targetFormat === "deepseek") {
      return {
        messages: rawMessages.map(m => {
          const reasoningVal = m.reasoning || m.reasoning_content;
          if (m.role === "assistant") {
            let mainContent = cleanExportText(m.content || "");
            let reasoningText = reasoningVal ? cleanExportText(reasoningVal) : "";

            // If mainContent already has <think>...</think> tags embedded inside it
            const thinkMatch = mainContent.match(/<think>([\s\S]*?)<\/think>/i);
            if (thinkMatch) {
              if (!reasoningText) {
                reasoningText = cleanExportText(thinkMatch[1]);
              }
              // strip the existing <think> block from mainContent to avoid double-wrapping
              mainContent = cleanExportText(mainContent.replace(/<think>[\s\S]*?<\/think>/gi, ""));
            }

            if (reasoningText) {
              const formattedContent = `<think>\n${reasoningText}\n</think>\n\n${mainContent}`;
              return {
                role: "assistant",
                content: formattedContent.trim()
              };
            }

            return {
              role: "assistant",
              content: mainContent
            };
          }
          return { role: m.role, content: cleanExportText(m.content) };
        })
      };
    }

    // 6. ShareGPT Multi-Turn & Reasoning Format
    if (targetFormat === "sharegpt") {
      return {
        conversations: rawMessages.map(m => {
          const from = m.role === "system" ? "system" : m.role === "user" ? "human" : "gpt";
          let value = cleanExportText(m.content || "");
          const reasoningVal = m.reasoning || m.reasoning_content;
          if (m.role === "assistant" && reasoningVal) {
            const thinkBlock = `<think>\n${cleanExportText(reasoningVal)}\n</think>\n\n`;
            value = value.startsWith("<think>") ? value : `${thinkBlock}${value}`;
          }
          return { from, value: cleanExportText(value) };
        })
      };
    }

    // 7. Prompt / Response Format
    if (targetFormat === "prompt_response") {
      let promptText = "";
      const sysMsg = rawMessages.find(m => m.role === "system");

      if (isMultiTurn) {
        const parts: string[] = [];
        if (sysMsg) parts.push(`[System]: ${cleanExportText(sysMsg.content)}`);
        rawMessages.forEach(m => {
          if (m.role === "user") parts.push(`[User]: ${cleanExportText(m.content)}`);
          if (m.role === "assistant" && m !== rawMessages[rawMessages.length - 1]) {
            parts.push(`[Assistant]: ${cleanExportText(m.content)}`);
          }
        });
        promptText = parts.join("\n\n");
      } else {
        const promptParts = rawMessages
          .filter(m => m.role === "system" || m.role === "user")
          .map(m => cleanExportText(m.content || ""));
        promptText = promptParts.join("\n\n");
      }
      
      const lastAssistant = [...rawMessages].reverse().find(m => m.role === "assistant");
      let responseText = cleanExportText(lastAssistant?.content || "");
      const reasoningVal = lastAssistant?.reasoning || lastAssistant?.reasoning_content;
      if (reasoningVal) {
        const thinkBlock = `<think>\n${cleanExportText(reasoningVal)}\n</think>\n\n`;
        responseText = responseText.startsWith("<think>") ? responseText : `${thinkBlock}${responseText}`;
      }

      return {
        prompt: promptText,
        response: responseText
      };
    }

    return { messages: rawMessages };
  };

  // Helper to trigger clean client-side file download via Blob URL
  const triggerFileDownload = (content: string, fileName: string, mimeType: string) => {
    try {
      const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1000);
    } catch (err) {
      console.error("Blob download failed, using Data URI fallback:", err);
      const encodedData = `data:${mimeType};charset=utf-8,` + encodeURIComponent(content);
      const a = document.createElement("a");
      a.href = encodedData;
      a.download = fileName;
      a.setAttribute("download", fileName);
      a.target = "_blank";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
      }, 1000);
    }
  };

  // Export utility for JSONL files
  const checkRegistryOutput = (records: unknown[], format: string) => {
    const error = validateRegistryOutput(records, format);
    if (error) setNotification({ text: error, type: "error" });
    return !error;
  };

  const downloadJSONL = (dataset: SFTExample[], fileName: string) => {
    if (dataset.length === 0) {
      setNotification({ text: "No compiled examples to download.", type: "error" });
      return;
    }
    const records = dataset.map(ex => formatExampleForExport(ex, exportTemplateFormat));
    if (!checkRegistryOutput(records, exportTemplateFormat)) return;
    const lines = records.map(record => JSON.stringify(record)).join("\n");
    triggerFileDownload(lines, fileName, "application/x-jsonlines");
    setNotification({ text: `Exported ${fileName} successfully in [${exportTemplateFormat.toUpperCase()}] template format!`, type: "success" });
  };

  // Export utility for standard JSON files (as a JSON array)
  const downloadJSON = (dataset: SFTExample[], fileName: string) => {
    if (dataset.length === 0) {
      setNotification({ text: "No compiled examples to download.", type: "error" });
      return;
    }
    const sanitizedData = dataset.map(ex => formatExampleForExport(ex, exportTemplateFormat));
    if (!checkRegistryOutput(sanitizedData, exportTemplateFormat)) return;
    const jsonString = JSON.stringify(sanitizedData, null, 2);
    triggerFileDownload(jsonString, fileName, "application/json");
    setNotification({ text: `Exported ${fileName} successfully in [${exportTemplateFormat.toUpperCase()}] template format!`, type: "success" });
  };

  // Request file export with session permission check
  const handleRequestExport = (format: "json" | "jsonl", dataset: SFTExample[], fileName: string) => {
    if (dataset.length === 0) {
      setNotification({ text: "No compiled examples to download.", type: "error" });
      return;
    }
    if (!isExportPermitted) {
      setPendingExport({ format, dataset, fileName });
      setShowExportAccessModal(true);
    } else {
      if (format === "json") {
        downloadJSON(dataset, fileName);
      } else {
        downloadJSONL(dataset, fileName);
      }
    }
  };

  // Accept file export access request
  const handleAcceptExport = () => {
    setIsExportPermitted(true);
    try {
      sessionStorage.setItem("triad_export_access_granted", "true");
    } catch (e) {
      console.error(e);
    }
    setShowExportAccessModal(false);
    if (pendingExport) {
      if (pendingExport.format === "json") {
        downloadJSON(pendingExport.dataset, pendingExport.fileName);
      } else {
        downloadJSONL(pendingExport.dataset, pendingExport.fileName);
      }
      setPendingExport(null);
    }
  };

  // Decline file export access request
  const handleDeclineExport = () => {
    setShowExportAccessModal(false);
    setPendingExport(null);
    setNotification({ text: "File access request declined. File export canceled.", type: "info" });
  };

  // Dedicated Handler: Format Dataset to Selected Template (ChatML, Alpaca, Maestro, DeepSeek, etc.)
  const handleFormatDataset = (formatToApply?: string) => {
    const fmt = formatToApply || exportTemplateFormat;
    
    const currentBatches = selectedApprovedBatches;

    const allExamples = currentBatches.flatMap(b => b.examples);
    
    if (allExamples.length === 0) {
      setNotification({ text: "No examples available in dataset registry to format.", type: "error" });
      return;
    }

    // Format all examples for training and validation set
    const formattedTraining = compiledDataset.trainingSet.length > 0 
      ? compiledDataset.trainingSet.map(ex => formatExampleForExport(ex, fmt))
      : allExamples.map(ex => formatExampleForExport(ex, fmt));
      
    const formattedValidation = compiledDataset.validationSet.length > 0 
      ? compiledDataset.validationSet.map(ex => formatExampleForExport(ex, fmt))
      : [];

    if (!checkRegistryOutput([...formattedTraining, ...formattedValidation], fmt)) {
      setExportedPreview("");
      return;
    }
    const sampleItems = formattedTraining.slice(0, 3);
    
    const previewPayload = {
      targetSchemaFormat: fmt,
      totalFormattedExamples: allExamples.length,
      trainingSetCount: formattedTraining.length,
      validationSetCount: formattedValidation.length,
      sampleFormattedRecords: sampleItems,
      fullDatasetJsonPreview: formattedTraining
    };

    const formatLabels: Record<string, string> = {
      chatml: "ChatML Conversation (messages)",
      chatml_token: "ChatML Instruction (<|im_start|>)",
      chatml_instruction: "ChatML Instruction (<|im_start|>)",
      openai: "ChatML Conversation (messages)",
      alpaca: "Alpaca Instruction Format (instruction, input, output)",
      maestro: "Maestro Instruction Format (system, instruction, input, response)",
      prompt_response: "Prompt & Response Pair",
      openai_o1_o3: "OpenAI o1/o3 Reasoning Conversation (reasoning_content)",
      deepseek: "DeepSeek R1 / Reasoning Conversation (<think>)",
      sharegpt: "ShareGPT Multi-Turn Conversation (conversations)"
    };

    const label = formatLabels[fmt] || fmt;
    setFormattedFormatBadge(label);
    setExportedPreview(JSON.stringify(previewPayload, null, 2));

    setNotification({
      text: `Dataset successfully formatted to [${label}]! (${formattedTraining.length} training items, ${formattedValidation.length} validation items formatted). Output preview updated!`,
      type: "success"
    });

    // Auto-scroll to preview block
    setTimeout(() => {
      document.getElementById("dataset-formatted-preview")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  // Convert active batch examples permanently in state
  const handleTransformBatchExamplesToFormat = (fmt: string) => {
    const formatLabels: Record<string, string> = {
      chatml: "ChatML Conversation",
      chatml_token: "ChatML Instruction (<|im_start|>)",
      chatml_instruction: "ChatML Instruction (<|im_start|>)",
      openai: "ChatML Conversation",
      alpaca: "Alpaca Format",
      maestro: "Maestro Format",
      prompt_response: "Prompt & Response",
      openai_o1_o3: "OpenAI o1/o3 Reasoning",
      deepseek: "DeepSeek R1 / Reasoning (<think>)",
      sharegpt: "ShareGPT Multi-Turn"
    };

    let convertedCount = 0;
    const newBatches = batches.map(b => {
      if (!isRegistryEligible(b) || selectedRegistryBatches[b.id] === false) return b;
      const updatedExamples = b.examples.map(ex => {
        convertedCount++;
        if (fmt === "deepseek") {
          const updatedMsgs = ex.messages.map(m => {
            if (m.role === "assistant") {
              const r = m.reasoning || m.reasoning_content || "";
              let mainContent = m.content || "";
              let reasoningText = r;

              const thinkMatch = mainContent.match(/<think>([\s\S]*?)<\/think>/i);
              if (thinkMatch) {
                if (!reasoningText) reasoningText = thinkMatch[1].trim();
                mainContent = mainContent.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
              }

              if (reasoningText) {
                return {
                  ...m,
                  content: `<think>\n${reasoningText.trim()}\n</think>\n\n${mainContent.trim()}`.trim()
                };
              }
            }
            return m;
          });
          return { ...ex, messages: updatedMsgs };
        }
        return ex;
      });
      return { ...b, examples: updatedExamples };
    });

    setBatches(newBatches);
    handleFormatDataset(fmt);
    const label = formatLabels[fmt] || fmt;
    setNotification({ text: `Transformed ${convertedCount} example(s) in active batches to [${label}] format!`, type: "success" });
  };

  // Preview compile
  useEffect(() => {
    if (compiledDataset.trainingSet.length > 0) {
      const trainSampleClean = formatExampleForExport(compiledDataset.trainingSet[0], exportTemplateFormat);
      const jsonlSample = JSON.stringify(trainSampleClean);
      const jsonPrettySample = JSON.stringify(trainSampleClean, null, 2);

      const valSampleClean = compiledDataset.validationSet.length > 0 
        ? JSON.stringify(formatExampleForExport(compiledDataset.validationSet[0], exportTemplateFormat))
        : "None";

      setExportedPreview(
        `// SELECTED EXPORT TEMPLATE: [${exportTemplateFormat.toUpperCase()}]\n` +
        `// === JSONL SINGLE-LINE RECORD PREVIEW ===\n${jsonlSample}\n\n` +
        `// === PRETTY JSON STRUCTURE ===\n${jsonPrettySample}\n\n` +
        `// === VALIDATION DATASET JSONL RECORD PREVIEW ===\n${valSampleClean}`
      );
    } else {
      setExportedPreview("");
    }
  }, [compiledDataset, exportTemplateFormat]);

  // Handle active batch selection & memoized inspector pagination
  const currentBatch = batches.find(b => b.id === selectedBatchId) || batches[0];
  const activeReport = currentBatch ? reports[currentBatch.id] || currentBatch.qualityReport : null;

  const displayedInspectorItems = useMemo<{
    example: SFTExample;
    originalIndex: number;
    issues: QualityIssue[];
    isFlagged: boolean;
  }[]>(() => {
    if (!currentBatch || !currentBatch.examples) return [];
    const all = currentBatch.examples.map((ex, originalIndex) => {
      const issues = activeReport
        ? (activeReport.issues || []).filter(iss => iss.exampleIndex === originalIndex)
        : [];
      return {
        example: ex,
        originalIndex,
        issues,
        isFlagged: issues.length > 0
      };
    });

    if (inspectorFilter === "flagged") {
      return all.filter(item => item.isFlagged);
    }
    return all;
  }, [currentBatch, activeReport, inspectorFilter]);

  const totalInspectorPages = useMemo(() => {
    if (!currentBatch || !currentBatch.examples) return 1;
    return Math.max(1, Math.ceil(currentBatch.examples.length / inspectorPageSize));
  }, [currentBatch, inspectorPageSize]);

  const paginatedInspectorExamples = useMemo(() => {
    if (!currentBatch || !currentBatch.examples) return [];
    const startIndex = (inspectorPage - 1) * inspectorPageSize;
    return currentBatch.examples.slice(startIndex, startIndex + inspectorPageSize).map((ex, relativeIdx) => ({
      ex,
      exIdx: startIndex + relativeIdx
    }));
  }, [currentBatch, inspectorPage, inspectorPageSize]);

  const totalGeneratorPages = useMemo(() => {
    if (!latestGeneratorBatch || !latestGeneratorBatch.examples) return 1;
    return Math.max(1, Math.ceil(latestGeneratorBatch.examples.length / generatorPageSize));
  }, [latestGeneratorBatch, generatorPageSize]);

  const paginatedGeneratorExamples = useMemo(() => {
    if (!latestGeneratorBatch || !latestGeneratorBatch.examples) return [];
    const startIndex = (generatorPage - 1) * generatorPageSize;
    return latestGeneratorBatch.examples.slice(startIndex, startIndex + generatorPageSize).map((ex, relativeIdx) => ({
      ex,
      exIdx: startIndex + relativeIdx
    }));
  }, [latestGeneratorBatch, generatorPage, generatorPageSize]);

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-4 max-w-sm text-center px-6">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-green-500/10 blur-xl animate-pulse" />
            <div className="relative h-16 w-16 rounded-2xl bg-gradient-to-tr from-green-500 to-emerald-600 flex items-center justify-center shadow-2xl shadow-green-500/20">
              <Sparkles className="h-8 w-8 text-white animate-spin" style={{ animationDuration: '3s' }} />
            </div>
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">SFT Studio Pro</h2>
            <p className="text-xs text-slate-400 mt-1">Initializing secure credentials workspace...</p>
          </div>
          <div className="flex items-center gap-2 mt-4 text-[11px] font-mono text-slate-500">
            <RefreshCw className="h-3.5 w-3.5 animate-spin text-green-500" />
            <span>Establishing connection to Firestore</span>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser && !isGuestMode) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between font-sans selection:bg-green-500/20 selection:text-green-300">
        {/* Decorative ambient blobs */}
        <div className="fixed top-0 left-1/4 w-96 h-96 bg-green-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="fixed bottom-0 right-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 z-10">
          <div className="w-full max-w-md bg-slate-950 border border-slate-800/80 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
            
            {/* Top Border Glow line */}
            <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-green-500/50 to-transparent" />

            {/* Logo Header */}
            <div className="flex flex-col items-center text-center mb-8">
              <img 
                src="/favicon.svg" 
                alt="TRiADiC Emblem" 
                className="h-16 w-16 rounded-2xl border border-emerald-500/30 shadow-xl shadow-emerald-500/20 mb-4 object-cover" 
              />
              <h1 className="text-3xl font-black text-white tracking-tight">
                SFT Studio Pro
              </h1>
              <p className="text-sm text-slate-400 max-w-sm mt-2 leading-relaxed">
                Sign in or sign up to create custom, high quality fine tuning data sets.
              </p>

              {/* Try for free without sign up */}
              <div className="mt-4 w-full">
                <button
                  type="button"
                  onClick={() => setIsGuestMode(true)}
                  className="w-full py-2.5 px-4 bg-amber-400/15 hover:bg-amber-400/25 text-amber-200 hover:text-amber-100 border border-amber-400/50 hover:border-amber-400/80 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-2 shadow-sm shadow-amber-400/10"
                >
                  <span>Try for free</span>
                  <ArrowRight className="h-3.5 w-3.5 text-amber-300" />
                </button>
              </div>
            </div>

            {/* Login Form Container */}
            <div className="space-y-4">

              {/* Notification Banner Inside Modal */}
              {notification && !notification.text.toLowerCase().includes("loaded") && !notification.text.toLowerCase().includes("project") && (
                <div className={`p-4 rounded-2xl border flex items-start gap-2.5 text-xs animate-fadeIn ${
                  notification.type === "success" 
                    ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-300" 
                    : notification.type === "error"
                    ? "bg-red-950/40 border-red-800/60 text-red-300"
                    : "bg-blue-950/40 border-blue-800/60 text-blue-300"
                }`}>
                  {notification.type === "success" ? (
                    <CheckCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                  ) : notification.type === "error" ? (
                    <XCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                  ) : (
                    <Info className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                  )}
                  <p className="leading-relaxed text-xs">{notification.text}</p>
                </div>
              )}

              {/* Replit sign-in */}
              <button
                type="button"
                onClick={login}
                className="w-full py-3 kk-primary rounded-xl font-bold text-sm transition cursor-pointer select-none shadow-lg shadow-green-500/10 flex items-center justify-center gap-1.5"
              >
                <span>Log in</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>

              {isSigningIn && !["Registering", "Signing In"].includes(isSigningIn) && (
                <div className="flex items-center justify-center gap-2 text-sm text-green-400 font-medium py-1 animate-pulse">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Awaiting credentials from {isSigningIn}...</span>
                </div>
              )}
            </div>

            {/* Secure Laboratories Notice */}
            <div className="mt-8 pt-6 border-t border-slate-900">
              <div className="flex gap-2.5 text-xs text-slate-500 leading-relaxed text-left">
                <ShieldAlert className="h-4.5 w-4.5 text-emerald-500/60 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-400">Enterprise Security:</span> All dataset configurations, training batches, and fine-tuning parameters are isolated and encrypted for your workspace.
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Footer info */}
        <footer className="py-6 px-4 text-center text-xs text-slate-500 border-t border-slate-900/60 bg-slate-950/40">
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 mb-3 font-semibold text-slate-400">
            <button onClick={() => setShowDocsModal(true)} className="hover:text-emerald-400 transition cursor-pointer">
              Docs &amp; Specs
            </button>
            <span className="text-slate-700">•</span>
            <button onClick={() => setShowCustomPackageModal(true)} className="hover:text-emerald-400 transition cursor-pointer flex items-center gap-1">
              <HelpCircle className="h-3 w-3 text-emerald-400" />
              Support
            </button>
            <span className="text-slate-700">•</span>
            <button onClick={() => setShowCustomPackageModal(true)} className="hover:text-emerald-400 transition cursor-pointer">
              Custom Packages
            </button>
            <span className="text-slate-700">•</span>
            <button onClick={() => setShowAboutModal(true)} className="hover:text-emerald-400 transition cursor-pointer">
              About Platform
            </button>
            <span className="text-slate-700">•</span>
            <a href="https://triadai.agency" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300 font-bold transition flex items-center gap-1">
              triadai.agency <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <p>© 2026 TRiADiC Intelligence Labs. All rights reserved.</p>
        </footer>

        {/* Modals for Sign-In Page */}
        <AboutModal isOpen={showAboutModal} onClose={() => setShowAboutModal(false)} />
        <CustomPackageModal 
          isOpen={showCustomPackageModal} 
          onClose={() => setShowCustomPackageModal(false)} 
          currentGenerations={accountTotalGenerations}
          limit={userProfile?.limit || 5000}
        />
        <DocsModal isOpen={showDocsModal} onClose={() => setShowDocsModal(false)} />
        <AccountModal
          isOpen={showAccountModal}
          onClose={() => setShowAccountModal(false)}
          currentUser={currentUser}
          userProfile={userProfile}
          accountTotalGenerations={accountTotalGenerations}
        />
      </div>
    );
  }

  if (showProjectOnboarding || showBatchRecommendationInterview) {
    return (
      <ProjectOnboarding
        startAtBatchInterview={showBatchRecommendationInterview}
        initialProjectSettings={showBatchRecommendationInterview ? project : undefined}
        onSkip={() => {
          if (showBatchRecommendationInterview) {
            setShowBatchRecommendationInterview(false);
            setActiveTab("synthesizer");
          } else {
            setActiveTab("define");
            setShowProjectOnboarding(false);
          }
        }}
        onComplete={(settings, recommendations, trainingModel) => {
          if (!showBatchRecommendationInterview) {
            setTrainerHandoff({
              model: trainingModel || "Qwen3.5 9 Base",
              template: `${settings.instructTemplate || "ChatML"} (<|im_start|>)`,
            });
          }
          if (showBatchRecommendationInterview) {
            setBatchRecommendations(recommendations ?? []);
            setCompletedRecommendedBatches([]);
            setActiveRecommendedBatchIndex(0);
            setShowBatchRecommendationInterview(false);
            setActiveTab("synthesizer");
            return;
          }
          setProject(settings);
          setIsFieldsUnlocked(true);
          setBatchTemplate(settings.templateType || TemplateType.SINGLE_TURN);
          setDocTemplate(settings.templateType || TemplateType.SINGLE_TURN);
          setTriadTemplate(settings.templateType || TemplateType.SINGLE_TURN);
          const previousGuideState = selectedProjectId ? readGuideState(selectedProjectId) : {};
          const completedRecommendations = recommendations ?? (
            Array.isArray(previousGuideState.recommendations) ? previousGuideState.recommendations : []
          );
          setBatchRecommendations(completedRecommendations);
          const completedTopics = Array.isArray(previousGuideState.completedRecommendedBatches)
            ? previousGuideState.completedRecommendedBatches
            : [];
          setCompletedRecommendedBatches(completedTopics);
          setActiveRecommendedBatchIndex(0);
          if (selectedProjectId && recommendations !== undefined) {
            writeGuideState(selectedProjectId, { recommendations, completedRecommendedBatches: [] });
          }
          setActiveTab("define");
          setNotification({
            text: "Congratulations—Project Definition is complete. Review the prefilled page and Save & Lock it when ready. Use the menu or purple arrow to open Batch Synthesizer, then AI Guide for Section 2.",
            type: "success"
          });
          setShowProjectOnboarding(false);
          window.scrollTo({ top: 0 });
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* Top Banner Navigation */}
      <header className="kk-header border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
          
          <div className="flex items-center justify-between md:justify-start gap-3">
            <div className="flex items-center gap-2.5">
              <img 
                src="/favicon.svg" 
                alt="TRiADiC Emblem" 
                className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl border border-emerald-500/30 shadow-lg shadow-emerald-500/10 shrink-0 object-cover" 
              />
              <div>
                <h1 className="text-base sm:text-xl font-bold tracking-tight text-white flex items-center gap-1.5 sm:gap-2">
                  SFT Studio Pro
                  <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 font-mono">
                    v1.0
                  </span>
                </h1>
                <p className="text-[10px] sm:text-xs text-slate-400 hidden xs:block">Supervised Fine-Tuning Synthesis Workspace</p>
              </div>
            </div>

            {/* Quick Navigation Links */}
            <nav className="hidden lg:flex items-center gap-3 text-xs font-semibold text-slate-300 ml-3 border-l border-slate-800 pl-3">
              <button onClick={() => setShowDocsModal(true)} className="hover:text-emerald-400 transition cursor-pointer">
                Docs
              </button>
              <button 
                onClick={() => setShowCustomPackageModal(true)} 
                className="hover:text-emerald-300 transition cursor-pointer flex items-center gap-1.5 text-emerald-400 font-semibold"
                title="Contact Support"
              >
                <HelpCircle className="h-3.5 w-3.5" />
                <span>Support</span>
              </button>
              <button onClick={() => setShowCustomPackageModal(true)} className="hover:text-emerald-400 transition cursor-pointer">
                Custom Packages
              </button>
              <button onClick={() => setShowAboutModal(true)} className="hover:text-emerald-400 transition cursor-pointer">
                About
              </button>
              <a href="https://triadai.agency" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300 font-bold transition flex items-center gap-1">
                triadai.agency <ExternalLink className="h-3 w-3" />
              </a>
            </nav>

          </div>

          {/* Real-time Project Status Hub & Controls Panel */}
          <div className="bg-slate-900/60 p-2 sm:p-2.5 rounded-xl border border-slate-800/80 w-full md:w-auto">
            <div className="flex flex-col gap-2">
              
              {/* Row 1 (Top): Project Selector with expanded horizontal space & live stats */}
              <div className="flex items-center justify-between gap-3 text-xs">
                {/* Left: Live example stats */}
                <div className="flex items-center gap-1.5 shrink-0 text-[11px]">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <span className="kk-neon-example-count">{registryStats.total}</span>
                  <span className="text-slate-500">ex.</span>
                </div>

                {/* Right: Project Dropdown with generous horizontal space & Delete Icon */}
                <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-lg text-xs flex-1 min-w-[200px] sm:min-w-[280px]">
                  <FolderOpen className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                  <select
                    id="project-selector"
                    key={dropdownKey}
                    value={selectedProjectId || ""}
                    onChange={(e) => handleSelectProject(e.target.value)}
                    className="bg-slate-950 text-slate-200 outline-none w-full font-medium cursor-pointer truncate text-[11px] py-0.5"
                  >
                    <option value="" disabled className="bg-slate-950 text-white font-bold">Select Project</option>
                    <option value="NEW_PROJECT" className="bg-slate-950 text-emerald-400 font-semibold">+ New Project...</option>
                    {userProjects.map((p) => (
                      <option key={p.id} value={p.id} className="bg-slate-950 text-slate-200">
                        {p.name}
                      </option>
                    ))}
                  </select>
                  {selectedProjectId && (
                    <button
                      onClick={() => setProjectToDelete(selectedProjectId)}
                      title="Delete SFT Project"
                      className="p-0.5 hover:bg-red-500/15 text-slate-500 hover:text-red-400 rounded transition shrink-0 cursor-pointer ml-1"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Row 2 (Middle): Plus/New and Save buttons in the center with increased size */}
              <div className="flex justify-center items-center gap-2.5">
                <button
                  onClick={handleCreateNewProject}
                  title="Create New SFT Project"
                  className="flex items-center justify-center gap-2 px-5 h-8.5 text-xs font-bold bg-green-500/15 hover:bg-green-500/25 text-green-400 border border-green-500/30 rounded-lg transition cursor-pointer shadow-sm"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  <span>New</span>
                </button>

                <button
                  onClick={() => handleSaveProject()}
                  disabled={isSaving}
                  title="Save Project State"
                  className={`flex items-center justify-center gap-2 px-5 h-8.5 text-xs font-bold rounded-lg border transition cursor-pointer shadow-sm ${
                    isSaving
                      ? "bg-blue-500/10 border-blue-500/20 text-blue-400"
                      : "bg-blue-500 hover:bg-blue-600 text-slate-950 border-blue-400 hover:border-blue-500"
                  }`}
                >
                  <Save className={`h-4 w-4 shrink-0 ${isSaving ? "animate-spin" : ""}`} />
                  <span>{isSaving ? "Saving..." : "Save"}</span>
                </button>
              </div>

              {/* Row 3 (Bottom): The remaining 3 buttons spaced out evenly (Support on bottom left) */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                {/* 1. Contact Support Button (bottom left) */}
                <button
                  onClick={() => setShowCustomPackageModal(true)}
                  title="Contact Support"
                  className="flex items-center justify-center gap-1.5 px-2.5 h-7.5 text-xs font-semibold text-slate-200 hover:text-emerald-400 hover:bg-slate-950 bg-slate-950/80 border border-slate-800 hover:border-emerald-500/40 rounded-lg transition cursor-pointer w-full"
                >
                  <HelpCircle className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span className="truncate">Support</span>
                </button>

                {/* 2. Account Button (bottom middle) */}
                <button
                  onClick={() => setShowAccountModal(true)}
                  title="Account Details & Settings"
                  className="flex items-center justify-center gap-1.5 px-2.5 h-7.5 text-xs font-semibold text-slate-200 hover:text-blue-400 hover:bg-slate-950 bg-slate-950/80 border border-slate-800 hover:border-blue-500/40 rounded-lg transition cursor-pointer w-full"
                >
                  <User className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                  <span className="truncate">Account</span>
                </button>

                {/* 3. Auth User Session / Sign In Button (bottom right) */}
                {currentUser ? (
                  <div className="flex items-center justify-between bg-slate-950/80 px-2 h-7.5 rounded-lg border border-slate-800 w-full">
                    {currentUser.photoURL ? (
                      <img
                        src={currentUser.photoURL}
                        alt={currentUser.displayName || "User"}
                        referrerPolicy="no-referrer"
                        className="h-5 w-5 rounded-full ring-1 ring-slate-700 object-cover shrink-0"
                      />
                    ) : (
                      <div className="h-5 w-5 rounded-full bg-slate-800 flex items-center justify-center shrink-0">
                        <User className="h-3 w-3 text-slate-400" />
                      </div>
                    )}
                    <button
                      onClick={() => signOut(auth)}
                      title="Sign Out"
                      className="p-1 hover:bg-slate-900 text-slate-400 hover:text-red-400 rounded transition cursor-pointer shrink-0"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsGuestMode(false)}
                    className="flex items-center justify-center gap-1 px-2.5 h-7.5 kk-primary font-bold text-xs rounded-lg border border-green-400 transition cursor-pointer w-full"
                  >
                    <span className="truncate">Sign In</span>
                  </button>
                )}
              </div>

            </div>
          </div>

        </div>
      </header>

      {/* Global Notifications */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-slate-950 border-b border-slate-800 px-4 py-2 text-center text-xs flex items-center justify-center gap-2"
          >
            {notification.type === "success" && <CheckCircle className="h-4 w-4 text-green-400" />}
            {notification.type === "error" && <XCircle className="h-4 w-4 text-red-400" />}
            {notification.type === "info" && <RefreshCw className="h-4 w-4 text-blue-400 animate-spin" />}
            <span className="text-slate-300 font-mono">{notification.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <main className={`flex-1 ${["define", "convert", "assess"].includes(activeTab) ? "max-w-[1920px]" : "max-w-[1720px]"} mx-auto w-full px-4 sm:px-6 lg:px-8 py-5`}>
        <div className="mb-3 lg:hidden">
          <button
            type="button"
            data-testid="button-open-mobile-navigation"
            aria-controls="sft-mobile-navigation"
            aria-expanded={isMobileNavOpen}
            onClick={() => setIsMobileNavOpen(true)}
            className="flex w-full items-center justify-center rounded-xl border border-violet-500/40 bg-slate-200 px-3.5 py-2.5 text-sm font-bold text-black shadow-sm transition hover:border-violet-400/70 hover:bg-white"
          >
            Menu
          </button>
        </div>
        <div className={`kk-workspace-panel grid grid-cols-1 lg:grid-cols-12 gap-5 ${["define", "convert", "assess"].includes(activeTab) ? "kk-compact-examples" : ""}`}>
        
        {/* Tab Sidebar Navigation (Desktop) & Tabs bar (Mobile) */}
        <div
          id="sft-mobile-navigation"
          className={`${isMobileNavOpen ? "fixed inset-0 z-50 flex bg-black/60 lg:static lg:inset-auto lg:z-auto lg:bg-transparent" : "hidden lg:flex"} lg:col-span-3 xl:col-span-2 flex-col gap-3`}
        >
          {isMobileNavOpen && (
            <button
              type="button"
              data-testid="button-dismiss-mobile-navigation"
              aria-label="Close navigation menu"
              onClick={() => setIsMobileNavOpen(false)}
              className="absolute inset-0 bg-black/60 lg:hidden"
            />
          )}
          <div className={`${isMobileNavOpen ? "relative z-10 h-full w-[min(18rem,88vw)] overflow-y-auto border-r border-violet-500/30 bg-slate-950 p-3 shadow-2xl" : ""} flex flex-col gap-3 lg:h-auto lg:w-auto lg:overflow-visible lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none`}>
          <div className="bg-slate-950/30 border border-slate-800/60 p-2 rounded-xl flex flex-col gap-1 custom-scrollbar">
            {isMobileNavOpen && (
              <div className="mb-2 flex items-center justify-between border-b border-slate-800 px-2 pb-2 lg:hidden">
                <span className="text-sm font-semibold text-slate-100">Navigation</span>
                <button
                  type="button"
                  data-testid="button-close-mobile-navigation"
                  aria-label="Close navigation menu"
                  onClick={() => setIsMobileNavOpen(false)}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}
            
            <button
              id="tab-define"
              onClick={() => {
                setActiveTab("define");
                setIsMobileNavOpen(false);
              }}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 shrink-0 ${
                activeTab === "define"
                  ? "kk-tab-active shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
              }`}
            >
              <Settings className="h-4 w-4 shrink-0" />
              <span>1. Project Definition</span>
            </button>

            <button
              id="tab-synthesizer"
              onClick={() => {
                setActiveTab("synthesizer");
                setIsMobileNavOpen(false);
              }}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 shrink-0 ${
                activeTab === "synthesizer"
                  ? "kk-tab-active shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
              }`}
            >
              <Sparkles className="h-4 w-4 shrink-0" />
              <span>2. Batch Synthesizer</span>
            </button>

            <button
              id="tab-convert"
              disabled={!selectedProjectId}
              onClick={() => {
                if (!selectedProjectId) {
                  setNotification({ text: "Please enter your SFT Project Name and click 'Save Work' to unlock the rest of SFT Studio.", type: "error" });
                  return;
                }
                setActiveTab("convert");
                setIsMobileNavOpen(false);
              }}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 shrink-0 group ${
                !selectedProjectId
                  ? "opacity-45 cursor-not-allowed text-slate-500 hover:text-slate-500 hover:bg-transparent"
                  : activeTab === "convert"
                  ? "bg-green-500/15 text-green-400 border border-green-500/25 shadow-sm cursor-pointer"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 cursor-pointer"
              }`}
            >
              {!selectedProjectId ? <Lock className="h-4 w-4 shrink-0 text-slate-500/80 group-hover:text-red-400 transition" /> : <FileText className="h-4 w-4 shrink-0" />}
              <span>3. Document to SFT</span>
              {!selectedProjectId && <span className="ml-auto text-[9px] text-slate-600 uppercase font-bold tracking-wider">Locked</span>}
            </button>

            <button
              id="tab-triad"
              disabled={!selectedProjectId}
              onClick={() => {
                if (!selectedProjectId) {
                  setNotification({ text: "Please enter your SFT Project Name and click 'Save Work' to unlock the rest of SFT Studio.", type: "error" });
                  return;
                }
                setActiveTab("triad");
                setIsMobileNavOpen(false);
              }}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 shrink-0 group ${
                !selectedProjectId
                  ? "opacity-45 cursor-not-allowed text-slate-500 hover:text-slate-500 hover:bg-transparent"
                  : activeTab === "triad"
                  ? "bg-amber-500/15 text-amber-400 border border-amber-500/25 shadow-sm cursor-pointer"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 cursor-pointer"
              }`}
            >
              {!selectedProjectId ? <Lock className="h-4 w-4 shrink-0 text-slate-500/80 group-hover:text-red-400 transition" /> : <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" />}
              <span>4. TRiAD Alignment</span>
              {!selectedProjectId && <span className="ml-auto text-[9px] text-slate-600 uppercase font-bold tracking-wider">Locked</span>}
            </button>

            <button
              id="tab-assess"
              disabled={!selectedProjectId}
              onClick={() => {
                if (!selectedProjectId) {
                  setNotification({ text: "Please enter your SFT Project Name and click 'Save Work' to unlock the rest of SFT Studio.", type: "error" });
                  return;
                }
                setActiveTab("assess");
                setIsMobileNavOpen(false);
              }}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 shrink-0 group ${
                !selectedProjectId
                  ? "opacity-45 cursor-not-allowed text-slate-500 hover:text-slate-500 hover:bg-transparent"
                  : activeTab === "assess"
                  ? "bg-green-500/15 text-green-400 border border-green-500/25 shadow-sm cursor-pointer"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 cursor-pointer"
              }`}
            >
              {!selectedProjectId ? <Lock className="h-4 w-4 shrink-0 text-slate-500/80 group-hover:text-red-400 transition" /> : <Search className="h-4 w-4 shrink-0" />}
              <span>5. AI Quality Assessment</span>
              {selectedProjectId && batches.filter(b => b.status === "Pending").length > 0 ? (
                <span className="ml-auto bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] px-1.5 py-0.5 rounded font-mono">
                  {batches.filter(b => b.status === "Pending").length}
                </span>
              ) : !selectedProjectId ? (
                <span className="ml-auto text-[9px] text-slate-600 uppercase font-bold tracking-wider">Locked</span>
              ) : null}
            </button>

            <button
              id="tab-registry"
              disabled={!selectedProjectId}
              onClick={() => {
                if (!selectedProjectId) {
                  setNotification({ text: "Please enter your SFT Project Name and click 'Save Work' to unlock the rest of SFT Studio.", type: "error" });
                  return;
                }
                setActiveTab("registry");
                setIsMobileNavOpen(false);
              }}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 shrink-0 group ${
                !selectedProjectId
                  ? "opacity-45 cursor-not-allowed text-slate-500 hover:text-slate-500 hover:bg-transparent"
                  : activeTab === "registry"
                  ? "bg-green-500/15 text-green-400 border border-green-500/25 shadow-sm cursor-pointer"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 cursor-pointer"
              }`}
            >
              {!selectedProjectId ? <Lock className="h-4 w-4 shrink-0 text-slate-500/80 group-hover:text-red-400 transition" /> : <Database className="h-4 w-4 shrink-0" />}
              <span>6. Data Registry</span>
              {selectedProjectId && batches.filter(b => b.status === "Approved").length > 0 ? (
                <span className="ml-auto bg-green-500/15 text-green-400 border border-green-500/20 text-[10px] px-1.5 py-0.5 rounded font-mono font-bold">
                  {batches.filter(b => b.status === "Approved").length}
                </span>
              ) : !selectedProjectId ? (
                <span className="ml-auto text-[9px] text-slate-600 uppercase font-bold tracking-wider">Locked</span>
              ) : null}
            </button>

            <button
              id="tab-expert"
              onClick={() => {
                setActiveTab("expert");
                setIsMobileNavOpen(false);
              }}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 shrink-0 group ${
                activeTab === "expert"
                  ? "bg-green-500/15 text-green-400 border border-green-500/25 shadow-sm cursor-pointer"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 cursor-pointer"
              }`}
            >
              <MessageSquare className="h-4 w-4 shrink-0" />
              <span>7. App Support</span>
            </button>

            <button
              id="tab-trainer"
              onClick={() => {
                setActiveTab("trainer");
                setIsMobileNavOpen(false);
              }}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 shrink-0 ${
                activeTab === "trainer"
                  ? "bg-blue-500/15 text-blue-300 border border-blue-500/25 shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
              }`}
            >
              <Cpu className="h-4 w-4 shrink-0" />
              <span>8. Automated Trainer</span>
            </button>

            <button
              id="tab-model-chat"
              onClick={() => {
                setActiveTab("modelChat");
                setIsMobileNavOpen(false);
              }}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 shrink-0 ${
                activeTab === "modelChat"
                  ? "bg-blue-500/15 text-blue-300 border border-blue-500/25 shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
              }`}
            >
              <MessageSquare className="h-4 w-4 shrink-0" />
              <span>9. Model Chat</span>
            </button>

          </div>

          <div className="rounded-xl border border-slate-800/60 bg-slate-950/30 p-3">
            <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Resources
            </h3>
            <div className="flex flex-col gap-1">
              {RESOURCE_LINKS.map((resource) => (
                <button
                  key={resource.id}
                  type="button"
                  data-testid={`button-open-resource-${resource.id}`}
                  onClick={() => {
                    setActiveResourcePage(resource);
                    setIsMobileNavOpen(false);
                  }}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-medium text-slate-300 transition hover:bg-slate-900/70 hover:text-white"
                >
                  <BookOpen className="h-4 w-4 shrink-0 text-violet-300" aria-hidden="true" />
                  <span>{resource.title}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Consolidated Sidebar Overview Panel (Replaces 3 redundant separate bordered cards) */}
          <div className="bg-slate-950/30 border border-slate-800/60 p-3.5 rounded-xl hidden lg:flex flex-col gap-3.5 text-xs">
            {/* Quick Metrics */}
            <div>
              <h3 className="font-semibold text-slate-300 mb-2 flex items-center gap-2 text-xs">
                <TrendingUp className="h-3.5 w-3.5 text-green-400" />
                Registry Overview
              </h3>
              <div className="space-y-1.5 font-mono text-[11px]">
                <div className="flex justify-between text-slate-400">
                  <span>Total Examples:</span>
                  <span className="kk-neon-example-count">{registryStats.total}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Pending Approval:</span>
                  <span className="text-amber-400 font-bold">{registryStats.pending}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Approved:</span>
                  <span className="text-green-400 font-bold">{registryStats.approvedExamples}</span>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-800/60" />

            {/* Subscription & Plan Status */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5 text-xs">
                  <Sparkles className="h-3.5 w-3.5 text-green-400" />
                  Plan & Limits
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wider ${
                  (userProfile?.subscriptionStatus === "Owner")
                    ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    : (userProfile?.subscriptionStatus === "Student") 
                    ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                    : (userProfile?.subscriptionStatus === "Premium")
                    ? "bg-green-500/10 text-green-400 border-green-500/20"
                    : "bg-slate-500/10 text-slate-400 border-slate-500/20"
                }`}>
                  {userProfile?.subscriptionStatus || "Free"}
                </span>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-[10px]">
                  <span className="text-slate-400 font-medium">Usage</span>
                  <span className="text-slate-300 font-mono">
                    {userProfile?.subscriptionStatus === "Owner" 
                      ? `${accountTotalGenerations} / Unlimited`
                      : `${accountTotalGenerations} / ${(userProfile?.limit || 5000).toLocaleString()}`}
                  </span>
                </div>
                
                {/* Progress bar */}
                <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${
                      userProfile?.subscriptionStatus === "Owner"
                        ? "bg-amber-500"
                        : (accountTotalGenerations / (userProfile?.limit || 5000)) >= 0.9
                        ? "bg-red-500"
                        : (accountTotalGenerations / (userProfile?.limit || 5000)) >= 0.7
                        ? "bg-amber-500"
                        : "bg-green-500"
                    }`}
                    style={{ 
                      width: `${userProfile?.subscriptionStatus === "Owner" 
                        ? 100 
                        : Math.min(100, (accountTotalGenerations / (userProfile?.limit || 5000)) * 100)}%` 
                    }}
                  />
                </div>

                <button
                  onClick={() => {
                    setShowBillingModal(true);
                    if (currentUser) {
                      loadTeacherCodes();
                    }
                  }}
                  className="w-full py-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-lg text-[11px] font-semibold text-slate-300 hover:text-white transition cursor-pointer select-none text-center"
                >
                  Manage Codes & Tier
                </button>
              </div>
            </div>

            <div className="border-t border-slate-800/60" />

            {/* Synthesis Engine status */}
            <div className="text-[11px] text-slate-400">
              <div className="flex items-center gap-1.5 text-slate-300 font-semibold mb-1">
                <Cpu className="h-3 w-3 text-emerald-400" />
                <span>Synthesis Engine</span>
              </div>
              <p className="text-[10px] text-slate-500 leading-snug">
                Streaming SFT synthesis with automated quality validation.
              </p>
            </div>
          </div>
          </div>

        </div>

        {/* Tab Contents Frame */}
        <div className="lg:col-span-9 xl:col-span-10 flex flex-col gap-6 min-w-0">
          <AnimatePresence mode="wait">
            
            {/* TAB 1: PROJECT DEFINITION */}
            {activeTab === "define" && (
              <motion.div
                key="define-tab"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-6"
              >
                {/* Preset Selection & Project Definition Card */}
                <div className="bg-slate-950/30 border border-slate-800/50 p-5 sm:p-6 rounded-xl">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800/70 pb-4 mb-6">
                    <div>
                      <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Settings className="h-5 w-5 text-green-400" />
                        SFT Project Definition
                      </h2>
                      <p className="text-xs text-slate-400">
                        Select a preset layout or edit fields directly to specify your model's base system prompt, task, and behaviors.
                      </p>
                    </div>

                    {/* Presets Selectors */}
                    <div className="flex flex-wrap gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800">
                      {Object.values(PresetType).map((pType) => (
                        <button
                          key={pType}
                          onClick={() => handlePresetSelect(pType)}
                          disabled={!!selectedProjectId && !isFieldsUnlocked}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            project.selectedPreset === pType
                              ? "bg-green-500 text-slate-950 font-semibold"
                              : "text-slate-400 hover:text-slate-200"
                          } ${!!selectedProjectId && !isFieldsUnlocked ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                        >
                          {pType}
                        </button>
                      ))}
                    </div>
                  </div>

                  {selectedProjectId && !isFieldsUnlocked && (
                    <div className="bg-blue-500/10 border border-blue-500/20 px-4 py-3 rounded-xl flex items-center gap-2.5 text-xs text-blue-400 mb-6 font-sans">
                      <Lock className="h-4 w-4 shrink-0 text-blue-400" />
                      <div>
                        <span className="font-bold">Project Core Instructions Permanently Locked:</span> The system prompt, target task, negative constraints, and representative example are locked into this project definition. This guarantees data integrity for all synthetic batch runs.
                      </div>
                    </div>
                  )}

                  {selectedProjectId && isFieldsUnlocked && (
                    <div className="bg-amber-500/10 border border-amber-500/20 px-4 py-3 rounded-xl flex items-center gap-2.5 text-xs text-amber-400 mb-6 font-sans">
                      <Unlock className="h-4 w-4 shrink-0 text-amber-400" />
                      <div>
                        <span className="font-bold">New Project Setup:</span> Configure the system prompt, target task, and negative constraints below. Once saved, these instructions will be locked permanently.
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Project Name Field */}
                    <div className="col-span-2">
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">Project Name</label>
                      <input
                        type="text"
                        value={project.name}
                        onChange={(e) => setProject(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:border-green-500/50 outline-none transition font-semibold"
                        placeholder="My SFT Custom Assistant"
                      />
                    </div>

                    {/* System Prompt Field */}
                    <div className="col-span-2">
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                        <span>System Prompt <span className="text-[10px] text-slate-500 font-normal">(Injected as standard context)</span></span>
                        {selectedProjectId && !isFieldsUnlocked && <span className="text-[10px] text-blue-400 font-mono flex items-center gap-1">🔒 Locked</span>}
                        {selectedProjectId && isFieldsUnlocked && <span className="text-[10px] text-amber-400 font-mono flex items-center gap-1 animate-pulse">🔓 Editing</span>}
                      </label>
                      <textarea
                        value={project.systemPrompt}
                        onChange={(e) => setProject(prev => ({ ...prev, systemPrompt: e.target.value }))}
                        rows={3}
                        disabled={!!selectedProjectId && !isFieldsUnlocked}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:border-green-500/50 outline-none transition font-mono leading-relaxed disabled:opacity-75 disabled:cursor-not-allowed disabled:bg-slate-950/40"
                        placeholder="You are a helpful assistant..."
                      />
                    </div>

                    {/* Target Task Field */}
                    <div className="col-span-2">
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                        <span>Target Task & Model Persona</span>
                        {selectedProjectId && !isFieldsUnlocked && <span className="text-[10px] text-blue-400 font-mono flex items-center gap-1">🔒 Locked</span>}
                        {selectedProjectId && isFieldsUnlocked && <span className="text-[10px] text-amber-400 font-mono flex items-center gap-1 animate-pulse">🔓 Editing</span>}
                      </label>
                      <textarea
                        value={project.targetTask}
                        onChange={(e) => setProject(prev => ({ ...prev, targetTask: e.target.value }))}
                        rows={3}
                        disabled={!!selectedProjectId && !isFieldsUnlocked}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:border-green-500/50 outline-none transition leading-relaxed disabled:opacity-75 disabled:cursor-not-allowed disabled:bg-slate-950/40"
                        placeholder="Explain target task in detail..."
                      />
                    </div>

                    {/* Constraints & Instructions Field */}
                    <div className="col-span-2">
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                        <span>Constraints & Instructions</span>
                        {selectedProjectId && !isFieldsUnlocked && <span className="text-[10px] text-blue-400 font-mono flex items-center gap-1">🔒 Locked</span>}
                        {selectedProjectId && isFieldsUnlocked && <span className="text-[10px] text-amber-400 font-mono flex items-center gap-1 animate-pulse">🔓 Editing</span>}
                      </label>
                      <textarea
                        value={project.constraints}
                        onChange={(e) => setProject(prev => ({ ...prev, constraints: e.target.value }))}
                        rows={3}
                        disabled={!!selectedProjectId && !isFieldsUnlocked}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:border-green-500/50 outline-none transition leading-relaxed disabled:opacity-75 disabled:cursor-not-allowed disabled:bg-slate-950/40"
                        placeholder="List negative constraints, guidelines, format mandates..."
                      />
                    </div>

                    {/* Dataset Format: Conversation vs Instruction Format */}
                    <div className="col-span-2 border-t border-slate-800 pt-5 mt-2">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wide">
                          <Code className="h-3.5 w-3.5 text-blue-400" />
                          <span>Project Dataset Format Standard</span>
                        </label>
                        {selectedProjectId && !isFieldsUnlocked && (
                          <span className="text-[10px] text-blue-400 font-mono flex items-center gap-1">
                            🔒 Locked: {project.projectFormat || ProjectFormat.CONVERSATION}
                          </span>
                        )}
                        {selectedProjectId && isFieldsUnlocked && (
                          <span className="text-[10px] text-amber-400 font-mono flex items-center gap-1 animate-pulse">
                            🔓 Selecting Format
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mb-3 leading-normal">
                        Select the top-level dataset format locked for this project. In a <strong>Conversation</strong> project, individual batches can freely use or mix Single-Turn, Multi-Turn, and Reasoning turns. In an <strong>Instruction</strong> project, the user chooses the template (Mistral, Alpaca, or ChatML) ahead of time and locks it with the project definition so all examples transfer cleanly.
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                        {/* Option 1: Conversation */}
                        {(() => {
                          const isConv = (project.projectFormat || ProjectFormat.CONVERSATION) === ProjectFormat.CONVERSATION;
                          const isLocked = !!selectedProjectId && !isFieldsUnlocked;
                          return (
                            <button
                              type="button"
                              disabled={isLocked}
                              onClick={() => {
                                setProject(prev => ({
                                  ...prev,
                                  projectFormat: ProjectFormat.CONVERSATION,
                                  templateType: TemplateType.SINGLE_TURN,
                                  ...(prev.representativePrompt?.startsWith("### Instruction:\n") || prev.representativePrompt?.startsWith("<|im_start|>") || prev.representativePrompt?.startsWith("[INST]") ? {
                                    representativePrompt: PROJECT_PRESETS[prev.selectedPreset as PresetType || PresetType.GENERAL_USE]?.examples[0]?.prompt || "",
                                    representativeCompletion: PROJECT_PRESETS[prev.selectedPreset as PresetType || PresetType.GENERAL_USE]?.examples[0]?.completion || ""
                                  } : {})
                                }));
                                setBatchTemplate(TemplateType.SINGLE_TURN);
                                setDocTemplate(TemplateType.SINGLE_TURN);
                                setTriadTemplate(TemplateType.SINGLE_TURN);
                              }}
                              className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between gap-2 ${
                                isConv
                                  ? "bg-blue-600/20 border-blue-500 text-white font-bold shadow-md shadow-blue-500/10"
                                  : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                              } ${isLocked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                            >
                              <div className="flex items-center justify-between w-full">
                                <span className="text-xs font-bold text-slate-200 flex items-center gap-2">
                                  <MessageSquare className="h-4 w-4 text-blue-400" />
                                  Conversation Template
                                </span>
                                <span className="text-[9px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded font-mono uppercase">
                                  Flexible Turns
                                </span>
                              </div>
                              <p className="text-[11px] font-normal text-slate-400 leading-relaxed">
                                Standard chat messages format (<code className="text-slate-300 font-mono text-[10px]">role: system/user/assistant</code>). Allows mixing <strong>Single-Turn</strong>, <strong>Multi-Turn</strong>, and <strong>Reasoning (CoT)</strong> across batches.
                              </p>
                            </button>
                          );
                        })()}

                        {/* Option 2: Instruction */}
                        {(() => {
                          const isInst = project.projectFormat === ProjectFormat.INSTRUCTION;
                          const isLocked = !!selectedProjectId && !isFieldsUnlocked;
                          return (
                            <button
                              type="button"
                              disabled={isLocked}
                              onClick={() => {
                                const currentTmpl = project.instructTemplate || InstructTemplate.CHATML;
                                const exemplarMap: Record<string, { prompt: string; completion: string }> = {
                                  [InstructTemplate.CHATML]: {
                                    prompt: "Explain why the sky appears blue.",
                                    completion: "The sky appears blue because molecules in Earth's atmosphere scatter shorter wavelengths of sunlight more strongly than longer wavelengths."
                                  },
                                  [InstructTemplate.ALPACA]: {
                                    prompt: "### Instruction:\nExplain why the sky appears blue.\n\n### Input:\nContext: Atmospheric light scattering.",
                                    completion: "### Response:\nThe sky appears blue because molecules in Earth's atmosphere scatter shorter wavelengths of sunlight more strongly than longer wavelengths."
                                  },
                                  [InstructTemplate.MISTRAL]: {
                                    prompt: "[INST] Explain why the sky appears blue. [/INST]",
                                    completion: "The sky appears blue because molecules in Earth's atmosphere scatter shorter wavelengths of sunlight more strongly than longer wavelengths."
                                  }
                                };
                                setProject(prev => ({
                                  ...prev,
                                  projectFormat: ProjectFormat.INSTRUCTION,
                                  templateType: TemplateType.INSTRUCTION_TEMPLATE,
                                  instructTemplate: prev.instructTemplate || InstructTemplate.CHATML,
                                  representativePrompt: exemplarMap[currentTmpl]?.prompt || "Explain why the sky appears blue.",
                                  representativeCompletion: exemplarMap[currentTmpl]?.completion || "The sky appears blue because molecules in Earth's atmosphere scatter shorter wavelengths of sunlight more strongly than longer wavelengths."
                                }));
                                setBatchTemplate(TemplateType.INSTRUCTION_TEMPLATE);
                                setDocTemplate(TemplateType.INSTRUCTION_TEMPLATE);
                                setTriadTemplate(TemplateType.INSTRUCTION_TEMPLATE);
                              }}
                              className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between gap-2 ${
                                isInst
                                  ? "bg-purple-600/20 border-purple-500 text-white font-bold shadow-md shadow-purple-500/10"
                                  : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                              } ${isLocked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                            >
                              <div className="flex items-center justify-between w-full">
                                <span className="text-xs font-bold text-slate-200 flex items-center gap-2">
                                  <Code className="h-4 w-4 text-purple-400" />
                                  Instruction Template
                                </span>
                                <span className="text-[9px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded font-mono uppercase">
                                  Strict Schema
                                </span>
                              </div>
                              <p className="text-[11px] font-normal text-slate-400 leading-relaxed">
                                Strict instruction format (<strong>Mistral</strong>, <strong>Alpaca</strong>, or <strong>ChatML</strong>). Locked ahead of time with the project definition.
                              </p>
                            </button>
                          );
                        })()}
                      </div>

                      {project.projectFormat === ProjectFormat.INSTRUCTION && (
                        <div className="p-3.5 bg-purple-950/30 border border-purple-800/40 rounded-xl space-y-3 text-xs overflow-hidden min-w-0">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-bold text-purple-300 flex items-center gap-1.5 shrink-0">
                              <Code className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                              Instruction Format Standard
                            </span>
                            <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded font-mono shrink-0">
                              Locked with Project Definition
                            </span>
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
                              Choose Instruct Template (Mistral, Alpaca, or ChatML):
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              {[
                                { id: InstructTemplate.MISTRAL, name: "Mistral", desc: "<s>[INST]...[/INST]</s>" },
                                { id: InstructTemplate.ALPACA, name: "Alpaca", desc: "### Instruction:" },
                                { id: InstructTemplate.CHATML, name: "ChatML", desc: "<|im_start|> tags" }
                              ].map((tmpl) => {
                                const isSelected = (project.instructTemplate || InstructTemplate.CHATML) === tmpl.id;
                                const isLocked = !!selectedProjectId && !isFieldsUnlocked;
                                return (
                                  <button
                                    key={tmpl.id}
                                    type="button"
                                    disabled={isLocked}
                                    onClick={() => {
                                      const exemplarMap: Record<string, { prompt: string; completion: string }> = {
                                        [InstructTemplate.CHATML]: {
                                          prompt: "Explain why the sky appears blue.",
                                          completion: "The sky appears blue because molecules in Earth's atmosphere scatter shorter wavelengths of sunlight more strongly than longer wavelengths."
                                        },
                                        [InstructTemplate.ALPACA]: {
                                          prompt: "### Instruction:\nExplain why the sky appears blue.\n\n### Input:\nContext: Atmospheric light scattering.",
                                          completion: "### Response:\nThe sky appears blue because molecules in Earth's atmosphere scatter shorter wavelengths of sunlight more strongly than longer wavelengths."
                                        },
                                        [InstructTemplate.MISTRAL]: {
                                          prompt: "[INST] Explain why the sky appears blue. [/INST]",
                                          completion: "The sky appears blue because molecules in Earth's atmosphere scatter shorter wavelengths of sunlight more strongly than longer wavelengths."
                                        }
                                      };
                                      setProject(prev => ({
                                        ...prev,
                                        instructTemplate: tmpl.id,
                                        representativePrompt: exemplarMap[tmpl.id].prompt,
                                        representativeCompletion: exemplarMap[tmpl.id].completion
                                      }));
                                    }}
                                    className={`p-2.5 rounded-lg border text-left transition flex flex-col justify-between min-w-0 overflow-hidden ${
                                      isSelected
                                        ? "bg-purple-600/30 border-purple-400 text-white font-bold shadow-sm"
                                        : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                                    } ${isLocked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                                  >
                                    <div className="flex items-center justify-between w-full gap-1">
                                      <span className="text-xs font-bold text-slate-200 truncate">{tmpl.name}</span>
                                      {isSelected && <Check className="h-3.5 w-3.5 text-purple-400 shrink-0" />}
                                    </div>
                                    <span className="text-[10px] text-slate-400 font-mono mt-1 truncate block w-full">{tmpl.desc}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="bg-slate-950/80 p-3 rounded-lg font-mono text-[11px] text-slate-300 leading-relaxed border border-slate-800 space-y-1.5 overflow-hidden min-w-0">
                            <div className="text-[10px] uppercase font-bold text-slate-400 mb-1 border-b border-slate-800 pb-1.5 flex flex-wrap items-center justify-between gap-1">
                              <span className="truncate">{(project.instructTemplate || InstructTemplate.CHATML)} Format Schema</span>
                              <span className="text-purple-400 font-sans shrink-0 text-[10px]">Strict Standard</span>
                            </div>
                            <div className="bg-slate-900/60 p-2.5 rounded border border-slate-800/80 max-h-48 overflow-y-auto overflow-x-hidden min-w-0">
                              {(project.instructTemplate || InstructTemplate.CHATML) === InstructTemplate.CHATML && (
                                <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-slate-300 text-[11px] leading-relaxed font-mono min-w-0">
                                  <div className="text-purple-400 font-bold break-all">&lt;|im_start|&gt;system</div>
                                  <div className="pl-2 text-slate-300 break-words [overflow-wrap:anywhere]">{project.systemPrompt || "You are a helpful assistant."}<span className="text-purple-400 font-bold">&lt;|im_end|&gt;</span></div>
                                  <div className="text-blue-400 font-bold mt-1.5 break-all">&lt;|im_start|&gt;user</div>
                                  <div className="pl-2 text-slate-300 break-words [overflow-wrap:anywhere]">Explain why the sky appears blue.<span className="text-blue-400 font-bold">&lt;|im_end|&gt;</span></div>
                                  <div className="text-emerald-400 font-bold mt-1.5 break-all">&lt;|im_start|&gt;assistant</div>
                                  <div className="pl-2 text-slate-300 break-words [overflow-wrap:anywhere]">The sky appears blue because molecules in Earth's atmosphere scatter shorter wavelengths of sunlight more strongly than longer wavelengths.<span className="text-emerald-400 font-bold">&lt;|im_end|&gt;</span></div>
                                </div>
                              )}
                              {(project.instructTemplate) === InstructTemplate.ALPACA && (
                                <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-slate-300 text-[11px] leading-relaxed font-mono min-w-0">
                                  <div><span className="text-purple-400 font-bold">### Instruction:</span></div>
                                  <div className="pl-2 text-slate-300 break-words [overflow-wrap:anywhere]">&lt;Explicit instruction detailing the task to perform&gt;</div>
                                  <div className="mt-1.5"><span className="text-blue-400 font-bold">### Input:</span></div>
                                  <div className="pl-2 text-slate-300 break-words [overflow-wrap:anywhere]">&lt;Optional input context or background text&gt;</div>
                                  <div className="mt-1.5"><span className="text-emerald-400 font-bold">### Response:</span></div>
                                  <div className="pl-2 text-slate-300 break-words [overflow-wrap:anywhere]">&lt;High-quality target response adhering to the instruction&gt;</div>
                                </div>
                              )}
                              {(project.instructTemplate) === InstructTemplate.MISTRAL && (
                                <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-slate-300 text-[11px] leading-relaxed font-mono min-w-0">
                                  <div className="break-words [overflow-wrap:anywhere]">
                                    <span className="text-amber-400 font-bold">&lt;s&gt;[INST] </span>
                                    <span>Explain why the sky appears blue. </span>
                                    <span className="text-amber-400 font-bold">[/INST] </span>
                                    <span>The sky appears blue because molecules in Earth's atmosphere scatter shorter wavelengths of sunlight more strongly than longer wavelengths. </span>
                                    <span className="text-amber-400 font-bold">&lt;/s&gt;</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                          <p className="text-[11px] text-slate-400 leading-normal break-words [overflow-wrap:anywhere]">
                            All examples generated from <strong>Batch Synthesizer</strong>, <strong>Document Converter</strong>, and <strong>TRiAD Alignment</strong> will strictly conform to the locked <strong>{project.instructTemplate || InstructTemplate.CHATML}</strong> template so they transfer cleanly.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Representative SFT Example */}
                    <div className="col-span-2 border-t border-slate-800 pt-5 mt-2">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wide">
                          <FileText className="h-3.5 w-3.5 text-green-400" />
                          Representative SFT Example
                        </h4>
                        {selectedProjectId && !isFieldsUnlocked && <span className="text-[10px] text-blue-400 font-mono flex items-center gap-1">🔒 Locked</span>}
                        {selectedProjectId && isFieldsUnlocked && <span className="text-[10px] text-amber-400 font-mono flex items-center gap-1 animate-pulse">🔓 Editing</span>}
                      </div>
                      <p className="text-[11px] text-slate-400 mb-4 leading-normal">
                        This representative training pattern serves as the golden exemplar. It must be filled, is fully editable, and gets locked alongside system prompt guidelines when saving the SFT definition.
                      </p>
                      
                      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-4">
                        <div>
                          <label className="block text-[10px] uppercase font-bold tracking-wider text-indigo-400 mb-1.5">User Prompt Exemplar</label>
                          <textarea
                            value={project.representativePrompt || ""}
                            onChange={(e) => setProject(prev => ({ ...prev, representativePrompt: e.target.value }))}
                            disabled={!!selectedProjectId && !isFieldsUnlocked}
                            rows={2}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:border-green-500/50 outline-none transition font-medium disabled:opacity-75 disabled:cursor-not-allowed disabled:bg-slate-950/40"
                            placeholder="Enter the golden user query..."
                          />
                        </div>
                        <div className="border-t border-slate-800/60 pt-3">
                          <label className="block text-[10px] uppercase font-bold tracking-wider text-green-400 mb-1.5">Assistant Target Response</label>
                          <textarea
                            value={project.representativeCompletion || ""}
                            onChange={(e) => setProject(prev => ({ ...prev, representativeCompletion: e.target.value }))}
                            disabled={!!selectedProjectId && !isFieldsUnlocked}
                            rows={3}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:border-green-500/50 outline-none transition font-sans disabled:opacity-75 disabled:cursor-not-allowed disabled:bg-slate-950/40 whitespace-pre-wrap"
                            placeholder="Enter the perfect assistant response..."
                          />
                        </div>
                      </div>
                    </div>

                    {/* Action Bar / Save Button */}
                    <div className="col-span-2 bg-slate-900/40 border border-slate-800/60 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 mt-2">
                      <div className="flex items-start gap-2.5">
                        {!selectedProjectId ? (
                          <div className="h-6 w-6 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping" />
                          </div>
                        ) : (
                          <div className="h-6 w-6 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                            <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                          </div>
                        )}
                        <div>
                          <p className="text-xs font-bold text-slate-200">
                            {!selectedProjectId ? "Project Unsaved & Studio Locked" : "Project Saved & Studio Unlocked"}
                          </p>
                          <p className="text-[11px] text-slate-400 leading-normal">
                            {!selectedProjectId 
                              ? "Please save this project definition to unlock the synthetic generators, assessment pipes, and companion tools." 
                              : "This active SFT instruction set is locked to guarantee training data consistency. Reset or create new in top panel if desired."}
                          </p>
                        </div>
                      </div>

                      <div className="shrink-0">
                        {!selectedProjectId ? (
                          <button
                            onClick={() => handleSaveProject()}
                            disabled={!project.name || project.name.trim() === "" || isSaving}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition shadow-lg shrink-0 cursor-pointer ${
                              !project.name || project.name.trim() === "" || isSaving
                                ? "bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed"
                                : "bg-gradient-to-r from-green-400 to-emerald-500 hover:from-green-500 hover:to-emerald-600 text-slate-950 shadow-green-500/10"
                            }`}
                          >
                            <Save className={`h-4 w-4 ${isSaving ? "animate-spin" : ""}`} />
                            <span>{isSaving ? "Saving..." : "Save & Lock Project"}</span>
                          </button>
                        ) : isFieldsUnlocked ? (
                          <button
                            onClick={() => handleSaveProject(selectedProjectId)}
                            disabled={!project.name || project.name.trim() === "" || isSaving}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition shadow-lg shrink-0 cursor-pointer ${
                              !project.name || project.name.trim() === "" || isSaving
                                ? "bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed"
                                : "bg-gradient-to-r from-green-400 to-emerald-500 hover:from-green-500 hover:to-emerald-600 text-slate-950 shadow-green-500/10"
                            }`}
                          >
                            <Save className={`h-4 w-4 ${isSaving ? "animate-spin" : ""}`} />
                            <span>{isSaving ? "Saving..." : "Save & Lock Project"}</span>
                          </button>
                        ) : (
                          <div className="flex items-center gap-1.5 px-4 py-2 bg-slate-800/80 border border-slate-700/60 text-slate-300 text-xs font-semibold rounded-xl shrink-0 cursor-not-allowed">
                            <Lock className="h-3.5 w-3.5 text-blue-400" />
                            <span>Definition Permanently Locked</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

              </motion.div>
            )}

            {/* TAB 2: BATCH SYNTHESIZER */}
            {activeTab === "synthesizer" && (
              <motion.div
                key="synthesizer-tab"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-6"
              >
                {/* Batch Generator Settings Card */}
                <div className="kk-synthetic-generator-card bg-slate-950/40 border border-slate-800/80 p-6 rounded-2xl relative overflow-hidden">
                  <div className="border-b border-slate-800 pb-4 mb-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-green-400" />
                        Synthetic SFT Batch Generator
                      </h2>
                      <button
                        type="button"
                        onClick={() => setShowBatchRecommendationInterview(true)}
                        className="kk-guide-trigger rounded-lg border border-purple-400 bg-purple-300 px-4 py-2 text-sm font-bold text-black hover:bg-purple-200"
                      >
                        AI Guide
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                      Synthesize training examples modeled against your active project settings. Customize batch modifiers below.
                    </p>
                  </div>

                  {batchRecommendations.length > 0 && (
                    <details id="batch-recommendations" className="mb-6 rounded-xl border border-purple-500/30 bg-purple-950/20">
                      <summary className="cursor-pointer rounded-t-xl bg-purple-300 px-4 py-3 text-sm font-bold text-black">
                        Recommended batches ({completedRecommendedBatches.length}/{batchRecommendations.length} checked)
                      </summary>
                      <div className="space-y-3 border-t border-purple-500/20 px-4 py-4">
                        {activeRecommendedBatch && (
                          <button
                            type="button"
                            className="rounded border border-purple-300 bg-purple-300 px-3 py-1.5 text-xs font-semibold !text-[#000000] hover:bg-purple-200"
                            onClick={() => {
                              setBatchDesc(activeRecommendedBatch.topic);
                              setBatchInstructions(activeRecommendedBatch.specialInstructions);
                              setBatchTempConstraints(activeRecommendedBatch.temporaryConstraints);
                              setNotification({ text: "Batch instructions copied", type: "success" });
                            }}
                          >
                            Copy to Synthesizer
                          </button>
                        )}
                        {activeRecommendedBatch && (
                          <>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                aria-label="Previous recommended batch"
                                disabled={activeRecommendedBatchIndex === 0}
                                onClick={() => setActiveRecommendedBatchIndex(index => Math.max(0, index - 1))}
                                className="rounded border border-purple-300 bg-purple-300 p-2 text-black disabled:opacity-40"
                              >
                                <ArrowLeft className="h-4 w-4" />
                              </button>
                              <select
                                aria-label="Choose a recommended batch"
                                value={activeRecommendedBatchIndex}
                                onChange={event => setActiveRecommendedBatchIndex(Number(event.target.value))}
                                className="min-w-0 flex-1 rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                              >
                                {batchRecommendations.map((recommendation, index) => (
                                  <option key={`${recommendation.topic}-${index}`} value={index}>{index + 1}. {recommendation.topic}</option>
                                ))}
                              </select>
                              <button
                                type="button"
                                aria-label="Next recommended batch"
                                disabled={activeRecommendedBatchIndex >= batchRecommendations.length - 1}
                                onClick={() => setActiveRecommendedBatchIndex(index => Math.min(batchRecommendations.length - 1, index + 1))}
                                className="rounded border border-purple-300 bg-purple-300 p-2 text-black disabled:opacity-40"
                              >
                                <ArrowRight className="h-4 w-4" />
                              </button>
                            </div>
                            <p className="text-center text-xs text-slate-400">
                              Recommendation {activeRecommendedBatchIndex + 1} of {batchRecommendations.length}
                            </p>
                            <div key={activeRecommendedBatch.topic} className="flex items-start gap-3 rounded-lg border border-slate-700 bg-slate-900/70 p-3">
                            <input
                              type="checkbox"
                              aria-label={`Mark ${activeRecommendedBatch.topic} as generated`}
                              checked={completedRecommendedBatches.includes(activeRecommendedBatch.topic)}
                              onChange={event => setCompletedRecommendedBatches(current =>
                                event.target.checked
                                  ? [...current, activeRecommendedBatch.topic]
                                  : current.filter(topic => topic !== activeRecommendedBatch.topic)
                              )}
                              className="mt-1 accent-purple-400"
                            />
                            <div className="min-w-0 flex-1">
                              <h3 className="text-sm font-semibold text-slate-100">{activeRecommendedBatch.topic}</h3>
                              <div className="mt-3 space-y-3">
                                {([
                                  ["topic", "Batch Description", activeRecommendedBatch.topic],
                                  ["instructions", "Special Instructions", activeRecommendedBatch.specialInstructions],
                                  ["constraints", "Temporary Constraints", activeRecommendedBatch.temporaryConstraints],
                                ] as const).map(([section, title, text]) => {
                                  return (
                                    <section key={section} className="border-t border-slate-700 pt-2">
                                      <h3 className="text-xs font-bold text-slate-200">{title}</h3>
                                      <p className="mt-1 whitespace-pre-wrap text-xs text-slate-300">{text}</p>
                                    </section>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                          </>
                        )}
                      </div>
                    </details>
                  )}

                  {/* Batch specific inputs (Temporary constraints) */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">Batch Description</label>
                      <input
                        type="text"
                        value={batchDesc}
                        onChange={(e) => setBatchDesc(e.target.value)}
                        placeholder="Enter a training topic"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:border-green-500/50 outline-none transition"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">Special Batch Instructions</label>
                      <input
                        type="text"
                        value={batchInstructions}
                        onChange={(e) => setBatchInstructions(e.target.value)}
                        placeholder="Enter topic specific instructions"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:border-green-500/50 outline-none transition"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">Temporary Constraints</label>
                      <input
                        type="text"
                        value={batchTempConstraints}
                        onChange={(e) => setBatchTempConstraints(e.target.value)}
                        placeholder="Enter topic specific restrictions"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:border-green-500/50 outline-none transition"
                      />
                    </div>
                  </div>

                  {/* Template selector & Batch Size */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center border-t border-slate-800 pt-6">
                    <div>
                      {project.projectFormat === ProjectFormat.INSTRUCTION ? (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-semibold text-slate-300">Instruct Template Layout ({project.instructTemplate || "ChatML"})</label>
                            <span className="text-[10px] text-purple-400 font-mono flex items-center gap-1">
                              <Code className="h-3 w-3" /> Instruction Format
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            {[
                              { type: TemplateType.SINGLE_TURN, label: "Single Turn", sub: "Instruction Pair" },
                              { type: TemplateType.REASONING, label: "Reasoning", sub: "<think> CoT" },
                              { type: TemplateType.MULTI_TURN, label: "Multi Turn", sub: "Multi-turn Dialogue" },
                            ].map(({ type, label, sub }) => {
                              const isSelected = batchTemplate === type;
                              return (
                                <button
                                  key={type}
                                  type="button"
                                  onClick={() => setBatchTemplate(type)}
                                  className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col items-center gap-0.5 transition-all cursor-pointer ${
                                    isSelected
                                      ? "bg-purple-500/20 border-purple-500/50 text-purple-300 font-bold shadow-sm"
                                      : "bg-slate-900/50 border-slate-800 text-slate-400 hover:text-slate-300 hover:border-slate-700"
                                  }`}
                                >
                                  <Code className="h-3.5 w-3.5" />
                                  <span className="text-[11px] leading-tight text-center">{label}</span>
                                  <span className="text-[9px] text-slate-500">{sub}</span>
                                </button>
                              );
                            })}
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                            Instruction format ({project.instructTemplate || "ChatML"}) supporting Single-turn, Reasoning, and Multi-turn layouts.
                          </p>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-semibold text-slate-300">Batch Template Layout</label>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            {[
                              { type: TemplateType.SINGLE_TURN, label: "Single Turn", sub: "Q&A Pair" },
                              { type: TemplateType.REASONING, label: "Reasoning", sub: "CoT Thoughts" },
                              { type: TemplateType.MULTI_TURN, label: "Multi Turn", sub: "Dialogue" },
                            ].map(({ type, label, sub }) => {
                              const isSelected = batchTemplate === type;
                              return (
                                <button
                                  key={type}
                                  type="button"
                                  onClick={() => setBatchTemplate(type)}
                                  className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col items-center gap-0.5 transition-all cursor-pointer ${
                                    isSelected
                                      ? "bg-green-500/10 border-green-500/40 text-green-400 font-bold shadow-sm"
                                      : "bg-slate-900/50 border-slate-800 text-slate-400 hover:text-slate-300 hover:border-slate-700"
                                  }`}
                                >
                                  <Code className="h-3.5 w-3.5" />
                                  <span className="text-[11px] leading-tight text-center">{label}</span>
                                  <span className="text-[9px] text-slate-500">{sub}</span>
                                </button>
                              );
                            })}
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                            Single turn, reasoning, and multi-turn layouts are available for this batch.
                          </p>
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-semibold text-slate-300">Batch Generation Size</label>
                        {!isScalingUnlocked && (
                          <span className="text-[10px] text-amber-400 flex items-center gap-1 font-mono">
                            <Info className="h-3 w-3" /> Locked: Approve 1st batch
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {/* Always available 5 */}
                        <button
                          onClick={() => setBatchSize(5)}
                          className={`flex-1 py-3 px-2 rounded-xl border text-xs font-mono font-bold transition-all ${
                            batchSize === 5
                              ? "bg-green-500 text-slate-950 border-transparent shadow-md shadow-green-500/10"
                              : "bg-slate-900/50 border-slate-800 text-slate-400"
                          }`}
                        >
                          5
                        </button>

                        {/* Sizes unlocked only once approved */}
                        {[10, 25, 50, 100, 200, 250].map((size) => {
                          const isGreyedOutInGuestMode = !currentUser && (size === 200 || size === 250);
                          const isDisabled = !isScalingUnlocked || isGreyedOutInGuestMode;
                          return (
                            <button
                              key={size}
                              disabled={isDisabled}
                              onClick={() => setBatchSize(size)}
                              className={`flex-1 py-3 px-1.5 rounded-xl border text-xs font-mono font-bold transition-all ${
                                isDisabled 
                                  ? "opacity-30 cursor-not-allowed bg-slate-950/20 border-slate-900/50 text-slate-600"
                                  : batchSize === size
                                    ? "bg-green-500 text-slate-950 border-transparent shadow-md"
                                    : "bg-slate-900/50 border-slate-800 text-slate-400 hover:text-slate-200"
                              }`}
                            >
                              {size}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Live Progress Bar for Large Batches */}
                  {generationProgress && (
                    <div className="mt-6 p-4 rounded-xl bg-slate-900/80 border border-green-500/30 space-y-2 animate-fadeIn">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-green-400 flex items-center gap-2">
                          <RefreshCw className="h-3.5 w-3.5 animate-spin text-green-400" />
                          {generationStage || `Synthesizing Batch: ${generationProgress.current} / ${generationProgress.total} examples completed`}
                        </span>
                        <span className="font-mono font-bold text-green-300">
                          {generationProgress.percent}%
                        </span>
                      </div>
                      <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                        <div 
                          className="h-full bg-gradient-to-r from-green-500 via-emerald-400 to-teal-300 transition-all duration-300 rounded-full shadow-[0_0_12px_rgba(34,197,94,0.4)]"
                          style={{ width: `${Math.max(5, generationProgress.percent)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                        <span>Dataset Synthesis</span>
                        <span>In Progress...</span>
                      </div>
                    </div>
                  )}

                  {/* Generate Button trigger */}
                  <div className="mt-8 flex justify-end border-t border-slate-800/80 pt-6">
                    <button
                      id="btn-generate"
                      disabled={isGenerating || isFieldsUnlocked || !selectedProjectId}
                      onClick={handleSyntheticGenerate}
                      className={`px-6 py-3 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                        isFieldsUnlocked || !selectedProjectId
                          ? "bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed opacity-60"
                          : "bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-slate-950 shadow-lg shadow-green-500/15 cursor-pointer disabled:opacity-50"
                      }`}
                    >
                      {isGenerating ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin text-slate-950" />
                          <span>Generating ({generationProgress ? `${generationProgress.percent}%` : "In Progress..."})</span>
                        </>
                      ) : (isFieldsUnlocked || !selectedProjectId) ? (
                        <>
                          <Lock className="h-4 w-4 text-slate-500" />
                          <span>Locked (Save & Lock Definition First)</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 text-slate-950" />
                          <span>Generate {batchSize} Examples</span>
                        </>
                      )}
                    </button>
                  </div>

                </div>

                {/* Batch Generator Review & Approval Card */}
                <div className="bg-slate-950/30 border border-slate-800/50 p-5 sm:p-6 rounded-xl space-y-4">
                  <div className="border-b border-slate-800/70 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <CheckCircle className="h-5 w-5 text-green-400" />
                        Batch Generator Review & Approval
                      </h2>
                      <p className="text-xs text-slate-400">
                        Review the generated examples below. Approve this batch to add it to the active SFT registry and unlock larger generation scales.
                      </p>
                    </div>
                    {latestGeneratorBatch && (
                      <span className={`px-2.5 py-1 rounded text-xs font-mono font-bold self-start sm:self-center border ${
                        latestGeneratorBatch.status === "Approved" ? "bg-green-500/10 text-green-400 border-green-500/20" :
                        latestGeneratorBatch.status === "Rejected" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                        "bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse"
                      }`}>
                        {latestGeneratorBatch.partial
                          ? `Partial · ${latestGeneratorBatch.examples.length}/${latestGeneratorBatch.requestedExamples || latestGeneratorBatch.examples.length} · ${latestGeneratorBatch.status}`
                          : `Status: ${latestGeneratorBatch.status}`}
                      </span>
                    )}
                  </div>

                  {latestGeneratorBatch ? (
                    <div className="space-y-4">
                      {/* Batch metadata bar */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-4 rounded-xl border border-slate-800 text-xs">
                        <div className="space-y-1">
                          <div className="text-slate-200 font-semibold">{latestGeneratorBatch.name}</div>
                          <div className="text-[10px] text-slate-500 font-mono">Timestamp: {latestGeneratorBatch.timestamp}</div>
                          {latestGeneratorBatch.partial && (
                            <div role="status" className="flex items-start gap-1.5 pt-1 text-[11px] text-amber-300">
                              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                              <span>
                                Saved {latestGeneratorBatch.examples.length} of {latestGeneratorBatch.requestedExamples || latestGeneratorBatch.examples.length} requested examples.
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {latestGeneratorBatch.status === "Pending" ? (
                            <>
                              <button
                                onClick={() => handleUpdateBatchStatus(latestGeneratorBatch.id, "Approved")}
                                className="px-4 py-2 kk-primary font-bold text-xs rounded-xl transition flex items-center gap-1 cursor-pointer"
                              >
                                <Check className="h-3.5 w-3.5 text-slate-950" />
                                Approve & Unlock Scale
                              </button>
                              <button
                                onClick={() => handleUpdateBatchStatus(latestGeneratorBatch.id, "Rejected")}
                                className="kk-reject-batch-button px-3 py-2 bg-slate-800 hover:bg-red-950 text-slate-400 hover:text-red-400 font-semibold text-xs rounded-xl border border-slate-750 transition flex items-center gap-1 cursor-pointer"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                Reject Batch
                              </button>
                            </>
                          ) : (
                            <div className="flex items-center gap-2">
                              {latestGeneratorBatch.status === "Approved" ? (
                                <span className="text-xs text-green-400 font-semibold flex items-center gap-1.5 bg-green-500/5 px-3 py-1.5 rounded-xl border border-green-500/20">
                                  <CheckCircle className="h-4 w-4" />
                                  Scale Unlocked (10, 25, 50, 100 available)
                                </span>
                              ) : (
                                <span className="text-xs text-red-400 font-semibold flex items-center gap-1.5 bg-red-500/5 px-3 py-1.5 rounded-xl border border-red-500/20">
                                  <XCircle className="h-4 w-4" />
                                  Batch Rejected
                                </span>
                              )}
                              <button
                                onClick={() => handleUpdateBatchStatus(latestGeneratorBatch.id, "Pending")}
                                className="px-2.5 py-1 text-[10px] font-semibold text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-lg transition"
                              >
                                Reset Status
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Informative scale unlock warning */}
                      {!isScalingUnlocked && (
                        <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/10 flex gap-2.5 items-start text-xs text-amber-400">
                          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold text-slate-200">Scale Locked at 5:</span> You must approve at least one generated batch to unlock higher generation sizes (10, 25, 50, 100). Review the examples below and click "Approve & Unlock Scale" above to activate.
                          </div>
                        </div>
                      )}

                      {/* SFT Examples scroll-through rendering list */}
                      <ProgressiveScrollList
                        key={latestGeneratorBatch.id}
                        items={latestGeneratorBatch.examples}
                        title="Generated SFT Examples"
                        renderItem={(ex: SFTExample, exIdx: number) => (
                          <div key={exIdx} className="bg-slate-900/50 border border-slate-800/70 rounded-xl p-3 sm:p-4 relative overflow-hidden group kk-example-card kk-synth-generated-example">
                            {/* Example Header with Controls */}
                            <div className="flex items-center justify-between gap-2 mb-2.5 pb-2 border-b border-slate-800/60">
                              <span className="font-mono text-xs font-bold kk-example-label">
                                Example #{exIdx + 1}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => handleStartEditExample(latestGeneratorBatch.id, exIdx, ex)}
                                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                                  title="Edit example"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteExample(latestGeneratorBatch.id, exIdx)}
                                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-950 text-slate-300 hover:text-red-400 transition cursor-pointer"
                                  title="Delete item"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Render dialog layout of training example taking 100% full width */}
                            <div className="space-y-2.5 w-full">
                              {ex.messages.map((m, mIdx) => (
                                <div key={mIdx} className="text-xs leading-relaxed">
                                  {/* Role display */}
                                  <div className="flex items-center gap-1.5 mb-1">
                                    {m.role === "system" && (
                                      <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/50">
                                        System Context
                                      </span>
                                    )}
                                    {m.role === "user" && (
                                      <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1">
                                        <User className="h-3 w-3" /> User Prompt
                                      </span>
                                    )}
                                    {m.role === "assistant" && (
                                      <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20 flex items-center gap-1">
                                        <Cpu className="h-3 w-3" /> Assistant Target
                                      </span>
                                    )}
                                  </div>

                                  {/* Reasoning trace details (rendered BEFORE content for thinking models) */}
                                  {m.role === "assistant" && (m.reasoning || (typeof m.content === "string" && m.content.includes("<think>"))) && (
                                    <div className="mb-2 ml-2 p-2.5 rounded-lg bg-slate-950/60 border border-slate-850 text-slate-400 font-mono text-[10px] leading-normal kk-reasoning-example">
                                      <span className="text-amber-400/90 block font-semibold uppercase tracking-wider mb-1 flex items-center gap-1">
                                        🧠 Train of Thought / Reasoning Trace:
                                      </span>
                                      {safeRenderText(
                                        m.reasoning || 
                                        (typeof m.content === "string" && m.content.match(/<think>([\s\S]*?)<\/think>/i)?.[1]?.trim()) || 
                                        ""
                                      )}
                                    </div>
                                  )}

                                  {/* Response content */}
                                  <div className="pl-2 border-l-2 border-slate-800 text-slate-300 font-sans whitespace-pre-line leading-relaxed">
                                    {safeRenderText(
                                      typeof m.content === "string"
                                        ? m.content
                                            .replace(/<think>[\s\S]*?<\/think>/gi, "")
                                            .replace(/^###\s*(Instruction|Response):\s*/i, "")
                                            .replace(/^\[INST\]\s*/i, "")
                                            .replace(/\s*\[\/INST\]$/i, "")
                                            .replace(/^<s>/i, "")
                                            .replace(/<\/s>$/i, "")
                                            .trim()
                                        : m.content
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      />
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl bg-slate-900/10">
                      <Sparkles className="h-8 w-8 text-slate-600 mx-auto mb-2 animate-pulse" />
                      <p className="font-semibold text-slate-400">No Generated SFT Examples Yet</p>
                      <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
                        Once you customize parameters and click "Generate 5 Examples" above, the synthetic dataset will load here for your review and approval.
                      </p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* TAB 2: DOCUMENT CONVERSION TO SFT */}
            {activeTab === "convert" && (
              <motion.div
                key="convert-tab"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-6 min-w-0"
              >
                {/* Document SFT pipeline */}
                <div className="bg-slate-950/30 border border-slate-800/50 p-5 sm:p-6 rounded-xl flex flex-col justify-between min-w-0">
                  <div>
                    <div className="border-b border-slate-800/70 pb-4 mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <h2 className="text-base font-bold text-white flex items-center gap-2">
                          <FileText className="h-5 w-5 text-blue-400" />
                          Document to SFT Converter
                        </h2>
                        <p className="text-xs text-slate-400">
                          Convert raw technical texts, manuals, literature, or transcripts into structured fine-tuning conversational logs.
                        </p>
                        <button
                          type="button"
                          onClick={() => openAiGuide("convert")}
                          className="kk-guide-trigger mt-3 rounded-lg border border-purple-400 bg-purple-300 px-4 py-2 text-sm font-bold text-black hover:bg-purple-200"
                        >
                          AI Guide
                        </button>
                      </div>
                      {(docName || docContent) && (
                        <button
                          type="button"
                          id="btn-clear-document"
                          onClick={handleClearDocument}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-red-950/60 text-slate-400 hover:text-red-400 border border-slate-800 hover:border-red-500/40 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer self-start sm:self-center shrink-0"
                          title="Clear uploaded document & text content"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Clear Upload</span>
                        </button>
                      )}
                    </div>

                        <DocumentGuideWorkspace
                          key={selectedProjectId || "draft"}
                          open={showDocumentGuide}
                          progress={documentGuideProgress}
                          onProgressChange={progress => {
                            setDocumentGuideProgress(progress);
                            if (selectedProjectId) writeGuideState(selectedProjectId, { documentWalkthrough: progress });
                          }}
                          onClose={() => setShowDocumentGuide(false)}
                          documents={documentGuideQueues[selectedProjectId || "draft"] || []}
                          setDocuments={update => {
                            const key = selectedProjectId || "draft";
                            setDocumentGuideQueues(current => ({
                              ...current,
                              [key]: typeof update === "function" ? update(current[key] || []) : update,
                            }));
                          }}
                          project={project}
                          uploadPermitted={isUploadPermitted}
                          onPermitUpload={() => {
                            setIsUploadPermitted(true);
                            sessionStorage.setItem("triad_upload_access_granted", "true");
                          }}
                          busy={isConverting || isAnalyzingDoc}
                          onLoad={document => {
                            setDocContent(document.text);
                            setDocName(document.file.name);
                            setDocType(document.type);
                            setHasUserManuallySetDocType(true);
                            setConverterInstructions(document.type === "transcript" ? "" : document.instructions);
                            setUserTag(document.type === "transcript" ? document.userTag : "");
                            setAssistantTag(document.type === "transcript" ? document.assistantTag : "");
                            setDocConversionProgress(null);
                            setDocSuggestionExplanation(document.type === "transcript"
                              ? "Transcript conversion retains the matched labeled dialogue."
                              : "Click Re-Analyze to estimate examples for this document before converting.");
                          }}
                        />

                    {selectedProjectId && !isFieldsUnlocked && (
                      <div className="bg-blue-500/10 border border-blue-500/20 px-4 py-3 rounded-xl flex items-center justify-between gap-3 text-xs text-blue-400 mb-6 font-sans">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Lock className="h-4 w-4 shrink-0 text-blue-400" />
                          <div className="truncate">
                            <span className="font-bold">Locked Project Definition Enforced:</span>{" "}
                            Document conversion strictly adopts the locked system prompt and Conversation format of{" "}
                            <span className="text-slate-200 font-semibold">{project.name || "Active Project"}</span>.
                          </div>
                        </div>
                        <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded font-mono shrink-0 uppercase font-bold">
                          Locked
                        </span>
                      </div>
                    )}

                    {/* File Drop & Paste Area */}
                    <div className="space-y-4 mb-6">
                      <div 
                        id="doc-upload-dropzone"
                        onClick={handleTriggerDocUpload}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setIsDraggingDoc(true);
                        }}
                        onDragLeave={() => setIsDraggingDoc(false)}
                        onDrop={handleDropDoc}
                        className={`border border-dashed rounded-xl p-4 text-center transition relative cursor-pointer ${
                          isDraggingDoc
                            ? "border-blue-400 bg-blue-500/10 shadow-lg shadow-blue-500/10"
                            : "border-slate-800/80 hover:border-blue-500/50 hover:bg-slate-900/40"
                        }`}
                      >
                        <input
                          ref={docFileInputRef}
                          id="doc-file-input"
                          type="file"
                          accept=".txt,.md,.json,.csv,.docx,.png,.jpg,.jpeg,.webp,.pdf"
                          onChange={handleFileChange}
                          className="hidden"
                        />
                        <FileText className="h-8 w-8 text-slate-500 mx-auto mb-2" />
                        <div className="text-xs font-semibold text-slate-300 flex items-center justify-center max-w-full px-2">
                          {docName ? (
                            <span className="inline-flex items-center justify-center gap-1.5 max-w-full overflow-hidden" title={docName}>
                              <span className="text-slate-400 shrink-0">Selected:</span>
                              <span className="truncate max-w-[200px] sm:max-w-xs md:max-w-md font-mono text-blue-300">
                                {truncateFileName(docName, 32)}
                              </span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-2">
                              <Upload className="h-4 w-4 text-blue-400" />
                              <span>Upload DOCX, Doc, PDF, or Image (OCR)</span>
                            </span>
                          )}
                        </div>
                        <span className="block text-[10px] text-slate-500 mt-1">
                          Click to select or drag and drop DOCX, Markdown, TXT, JSON, CSV, PDF, or Image (PNG/JPG/WebP)
                        </span>
                        {docName && (
                          <div className="mt-2.5 relative z-10 flex items-center justify-center gap-2 max-w-full px-2">
                            <span
                              className="text-[11px] text-blue-400 font-mono bg-blue-500/10 border border-blue-500/20 px-2.5 py-0.5 rounded truncate max-w-[180px] sm:max-w-xs md:max-w-sm inline-block"
                              title={docName}
                            >
                              {truncateFileName(docName, 26)}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleClearDocument();
                              }}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 px-2 py-0.5 rounded-md transition cursor-pointer shrink-0"
                              title="Clear uploaded document"
                            >
                              <Trash2 className="h-3 w-3" />
                              <span>Clear</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Text box for paste */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="block text-xs font-semibold text-slate-300">
                            Or Paste Raw Document Content Below:
                          </label>
                          {docContent && (
                            <span className="text-[10px] text-slate-500 font-mono">
                              ~{docWordCount} words • {docContent.length} chars
                            </span>
                          )}
                        </div>
                        <textarea
                          value={docContent}
                          onChange={(e) => setDocContent(e.target.value)}
                          rows={6}
                          placeholder="# SFT Technical Spec... Paste knowledge content or transcripts here to digest."
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 font-mono focus:border-blue-500/45 outline-none transition custom-scrollbar"
                        />
                      </div>
                    </div>

                      {/* Document Category Selection (3 Options) */}
                    <div className="mb-6">
                      <label className="block text-xs font-bold text-slate-200 mb-2">
                        Document Type Category:
                      </label>
                      <div className="grid grid-cols-3 gap-2.5">
                        <button
                          type="button"
                          onClick={() => {
                            setDocType("knowledge_base");
                            setHasUserManuallySetDocType(true);
                          }}
                          className={`p-3 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                            docType === "knowledge_base"
                              ? "bg-blue-600/15 border-blue-500 text-white shadow-lg shadow-blue-500/10"
                              : "bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <BookOpen className={`h-4 w-4 ${docType === "knowledge_base" ? "text-blue-400" : "text-slate-500"}`} />
                            {docType === "knowledge_base" && <div className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-200">Knowledge Base</div>
                            <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">Manuals, specs & docs</div>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setDocType("transcript");
                            setHasUserManuallySetDocType(true);
                            setDocTemplate(TemplateType.SINGLE_TURN);
                          }}
                          className={`p-3 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                            docType === "transcript"
                              ? "bg-blue-600/15 border-blue-500 text-white shadow-lg shadow-blue-500/10"
                              : "bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <MessageSquare className={`h-4 w-4 ${docType === "transcript" ? "text-blue-400" : "text-slate-500"}`} />
                            {docType === "transcript" && <div className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-200">Transcript</div>
                            <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">Direct cleaning & dialogue</div>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setDocType("literature");
                            setHasUserManuallySetDocType(true);
                            if (!literatureTheme) {
                              setLiteratureTheme(`tell me the story of ${docName ? docName.replace(/\.[^/.]+$/, "") : "this book"}`);
                            }
                          }}
                          className={`p-3 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                            docType === "literature"
                              ? "bg-blue-600/15 border-blue-500 text-white shadow-lg shadow-blue-500/10"
                              : "bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <BookMarked className={`h-4 w-4 ${docType === "literature" ? "text-blue-400" : "text-slate-500"}`} />
                            {docType === "literature" && <div className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-200">Literature</div>
                            <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">Books & storytelling</div>
                          </div>
                        </button>
                      </div>
                    </div>

                    {/* Output Turn Mode Selection (Single turn, Multi turn, Reasoning, Mixed) */}
                    <div className="mb-6">
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-xs font-semibold text-slate-300">
                          Dataset Turn Mode & Layout:
                        </label>
                      </div>
                      <div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {[
                            { type: TemplateType.SINGLE_TURN, label: "Single Turn", sub: "Q&A Pair" },
                            { type: TemplateType.MULTI_TURN, label: "Multi Turn", sub: "Dialogue" },
                          ].map(({ type, label, sub }) => {
                            const isSelected = docTemplate === type;
                            return (
                              <button
                                key={type}
                                type="button"
                                onClick={() => setDocTemplate(type)}
                                className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col items-center gap-0.5 transition-all cursor-pointer ${
                                  isSelected
                                    ? "bg-green-500/10 border-green-500/40 text-green-400 font-bold shadow-sm"
                                    : "bg-slate-900/50 border-slate-800 text-slate-400 hover:text-slate-300 hover:border-slate-700"
                                }`}
                              >
                                <Code className="h-3.5 w-3.5" />
                                <span className="text-[11px] leading-tight text-center">{label}</span>
                                <span className="text-[9px] text-slate-500">{sub}</span>
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                          Conversation format strictly adopting the locked project system prompt and constraints.
                        </p>
                      </div>
                    </div>

                    {/* AI Document Analysis & Example Count Estimation Readout */}
                    <div className="mb-6 p-4 bg-slate-900/80 border border-slate-800 rounded-2xl">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-blue-400" />
                          <span className="text-xs font-bold text-white">AI Example Estimation:</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSuggestDocCount()}
                          disabled={isAnalyzingDoc || !docContent.trim()}
                          className="px-2.5 py-1 bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition disabled:opacity-50 cursor-pointer"
                        >
                          <RefreshCw className={`h-3 w-3 ${isAnalyzingDoc ? "animate-spin" : ""}`} />
                          <span>{isAnalyzingDoc ? "Analyzing..." : "Re-Analyze"}</span>
                        </button>
                      </div>

                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-2xl font-black font-mono text-blue-400">{docCount}</span>
                        <span className="text-xs font-semibold text-slate-300">Optimal SFT Examples Estimated</span>
                      </div>

                      {docSuggestionExplanation ? (
                        <p className="text-[11px] text-slate-400 leading-relaxed mt-1">
                          {docSuggestionExplanation}
                        </p>
                      ) : (
                        <p className="text-[11px] text-slate-500 leading-relaxed mt-1">
                          AI automatically analyzes document length (~{docWordCount} words) and narrative depth to synthesize optimal training targets.
                        </p>
                      )}
                    </div>

                    {/* Context Specific Settings based on Document Type */}
                    <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 mb-6 space-y-4">
                      {/* Literature Prompt & Sanitization Info */}
                      {docType === "literature" && (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                              Literature User Prompt Pattern:
                            </label>
                            <input
                              type="text"
                              value={literatureTheme || `tell me the story of ${docName ? docName.replace(/\.[^/.]+$/, "") : "this book"}`}
                              onChange={(e) => setLiteratureTheme(e.target.value)}
                              placeholder="tell me the story of [book name or theme]"
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:border-blue-500/50 outline-none font-mono"
                            />
                            <p className="text-[10px] text-slate-500 mt-1">
                              User prompts will follow this pattern to prompt the AI for story narrative arcs.
                            </p>
                          </div>

                          <div className="px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
                            <span className="text-[11px] text-emerald-300">
                              Corrupted text sanitization enabled: Page numbers, chapter titles, line numbers, and scan headers are automatically stripped out.
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Transcript Tag Inputs & Direct Cleaning Controls */}
                      {docType === "transcript" && (
                        <div className="space-y-3">
                          <div className="p-3 bg-blue-950/25 border border-blue-500/25 rounded-xl flex items-start gap-2.5">
                            <Sparkles className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                            <div className="text-[11px] text-blue-200 leading-relaxed">
                              <span className="font-semibold text-white">Verbatim Transcript Conversion:</span> Copies dialogue using your speaker tags and removes transcript metadata. No AI rewriting or generated text. All matched dialogue is retained regardless of the example count.
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                                User / Speaker 1 Tag <span className="text-slate-500 font-normal">(Auto-detected if blank)</span>
                              </label>
                              <input
                                type="text"
                                value={userTag}
                                onChange={(e) => setUserTag(e.target.value)}
                                placeholder="Auto-detect (e.g. User, Human, Host)"
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:border-blue-500/50 outline-none font-mono"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                                Assistant / Speaker 2 Tag <span className="text-slate-500 font-normal">(Auto-detected if blank)</span>
                              </label>
                              <input
                                type="text"
                                value={assistantTag}
                                onChange={(e) => setAssistantTag(e.target.value)}
                                placeholder="Auto-detect (e.g. Assistant, Claude, Guest)"
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:border-blue-500/50 outline-none font-mono"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                              Transcript Dialogue Layout:
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => setTranscriptLayout("single_turn")}
                                className={`p-2 rounded-lg border text-left text-xs transition cursor-pointer ${
                                  transcriptLayout === "single_turn"
                                    ? "bg-blue-600/20 border-blue-500 text-blue-200 font-semibold"
                                    : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                                }`}
                              >
                                <div>Single-Turn Pairs (Q&A)</div>
                                <div className="text-[10px] text-slate-500 mt-0.5">Extract each question & answer as a distinct example</div>
                              </button>
                              <button
                                type="button"
                                onClick={() => setTranscriptLayout("multi_turn")}
                                className={`p-2 rounded-lg border text-left text-xs transition cursor-pointer ${
                                  transcriptLayout === "multi_turn"
                                    ? "bg-blue-600/20 border-blue-500 text-blue-200 font-semibold"
                                    : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                                }`}
                              >
                                <div>Multi-Turn Dialogue</div>
                                <div className="text-[10px] text-slate-500 mt-0.5">Group consecutive turns into episodic conversations</div>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Knowledge Base Focus Prompt */}
                      {docType === "knowledge_base" && (
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                            Optional Focus Prompt <span className="text-slate-500 font-normal">(Leave blank for AI-derived prompts)</span>
                          </label>
                          <input
                            type="text"
                            value={fixedUserPrompt}
                            onChange={(e) => setFixedUserPrompt(e.target.value)}
                            placeholder="e.g., Focus on troubleshooting steps or key parameter definitions"
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:border-blue-500/50 outline-none"
                          />
                        </div>
                      )}

                      {/* Custom Conversion & Style Instructions Box */}
                      <div className="pt-3 border-t border-slate-800/60 space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-semibold text-slate-200 flex items-center gap-1.5">
                            <Sparkles className="h-3.5 w-3.5 text-blue-400" />
                            <span>Custom Conversion & Style Instructions</span>
                            <span className="text-[10px] text-slate-400 font-normal">(Instruct the AI on response length, depth, detail, and filtering)</span>
                          </label>
                          {converterInstructions && (
                            <button
                              type="button"
                              onClick={() => setConverterInstructions("")}
                              className="text-[10px] text-slate-400 hover:text-slate-200 transition cursor-pointer"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                        <textarea
                          value={converterInstructions}
                          onChange={(e) => setConverterInstructions(e.target.value)}
                          rows={3}
                          placeholder="e.g., Provide long, comprehensive, multi-paragraph responses with rich explanations and practical context. Do not make responses short (avoid brief 2-3 sentence answers). Filter out meeting setup, greetings, and administrative banter."
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-blue-500/50 outline-none font-sans custom-scrollbar leading-relaxed"
                        />
                        {/* Quick Presets */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          <span className="text-[10px] text-slate-500 mr-1">Quick presets:</span>
                          <button
                            type="button"
                            onClick={() => setConverterInstructions(prev => prev ? prev + "\n- Provide long, comprehensive, multi-paragraph responses (>300 words). Do not create brief 2-3 sentence answers." : "Provide long, comprehensive, multi-paragraph responses (>300 words). Do not create brief 2-3 sentence answers.")}
                            className="px-2 py-0.5 rounded-md bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/50 text-[10px] text-blue-300 transition cursor-pointer"
                          >
                            + Long & Comprehensive Answers
                          </button>
                          <button
                            type="button"
                            onClick={() => setConverterInstructions(prev => prev ? prev + "\n- Exclude all meeting preamble, greetings, attendee check-ins, and administrative logistics. Focus strictly on core domain knowledge." : "Exclude all meeting preamble, greetings, attendee check-ins, and administrative logistics. Focus strictly on core domain knowledge.")}
                            className="px-2 py-0.5 rounded-md bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/50 text-[10px] text-amber-300 transition cursor-pointer"
                          >
                            + Filter Preamble & Logistics
                          </button>
                          <button
                            type="button"
                            onClick={() => setConverterInstructions(prev => prev ? prev + "\n- Structure assistant responses with step-by-step reasoning, bulleted takeaways, and actionable technical depth." : "Structure assistant responses with step-by-step reasoning, bulleted takeaways, and actionable technical depth.")}
                            className="px-2 py-0.5 rounded-md bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/50 text-[10px] text-emerald-300 transition cursor-pointer"
                          >
                            + Step-by-Step Technical Depth
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-800/60 pt-5 mt-6 flex flex-col gap-3">
                    {isConverting && docConversionProgress && (docType === "knowledge_base" || docType === "literature") && (
                      <div className="w-full space-y-1.5" role="status" aria-live="polite">
                        <div className="flex items-center justify-between text-[11px] text-slate-300">
                          <span>
                            Generating {docType === "literature" ? "literature" : "knowledge"} examples
                          </span>
                          <span className="font-mono text-blue-300">
                            {docConversionProgress.completed} / {docConversionProgress.total}
                          </span>
                        </div>
                        <div
                          className="h-2 w-full overflow-hidden rounded-full bg-slate-800"
                          role="progressbar"
                          aria-label="Document conversion progress"
                          aria-valuemin={0}
                          aria-valuemax={docConversionProgress.total}
                          aria-valuenow={docConversionProgress.completed}
                        >
                          <div
                            className="h-full rounded-full bg-blue-500 transition-[width] duration-300"
                            style={{
                              width: `${Math.min(100, Math.round((docConversionProgress.completed / Math.max(1, docConversionProgress.total)) * 100))}%`
                            }}
                          />
                        </div>
                      </div>
                    )}
                    <button
                      disabled={isConverting || !docContent.trim() || isFieldsUnlocked || !selectedProjectId}
                      onClick={handleConvertDocument}
                      className={`px-5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 self-end transition cursor-pointer ${
                        isFieldsUnlocked || !selectedProjectId
                          ? "bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed opacity-60"
                          : "bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40"
                      }`}
                    >
                      {isConverting ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          <span>Parsing & Converting...</span>
                        </>
                      ) : (isFieldsUnlocked || !selectedProjectId) ? (
                        <>
                          <Lock className="h-4 w-4 text-slate-500" />
                          <span>Convert Locked (Save & Lock Definition First)</span>
                        </>
                      ) : (
                        <>
                          <ArrowRight className="h-4 w-4" />
                          <span>Convert Document to SFT</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Document Conversion Review & Approval Card */}
                {latestDocBatch && (
                  <div id="doc-conversion-review-card" className="bg-slate-950/30 border border-slate-800/50 p-5 sm:p-6 rounded-xl space-y-4 scroll-mt-6">
                    <div className="border-b border-slate-800/70 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                          <CheckCircle className="h-5 w-5 text-blue-400" />
                          Document Conversion Review & Approval
                        </h2>
                        <p className="text-xs text-slate-400">
                          Review the converted examples below. Approve this batch to include it in the active SFT registry and training dataset.
                        </p>
                      </div>
                      <span className={`px-2.5 py-1 rounded text-xs font-mono font-bold self-start sm:self-center border ${
                        latestDocBatch.status === "Approved" ? "bg-green-500/10 text-green-400 border-green-500/20" :
                        latestDocBatch.status === "Rejected" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                        "bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse"
                      }`}>
                        Status: {latestDocBatch.status}
                      </span>
                    </div>

                    <div className="space-y-4">
                      {/* Batch metadata bar */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-4 rounded-xl border border-slate-800 text-xs min-w-0">
                        <div className="space-y-1 min-w-0 max-w-full">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <span className="text-slate-200 font-semibold truncate max-w-[240px] sm:max-w-md md:max-w-lg inline-block align-bottom" title={latestDocBatch.name}>
                              {latestDocBatch.name}
                            </span>
                            <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded font-mono shrink-0">
                              Conversation
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono truncate max-w-full" title={`Timestamp: ${latestDocBatch.timestamp} • ${latestDocBatch.examplesCount} Examples • ${latestDocBatch.description}`}>
                            Timestamp: {latestDocBatch.timestamp} • {latestDocBatch.partial ? `Partial: ${latestDocBatch.examplesCount} of ${latestDocBatch.requestedExamples} Examples` : `${latestDocBatch.examplesCount} Examples`} • {latestDocBatch.description}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {latestDocBatch.status === "Pending" ? (
                            <>
                              <button
                                onClick={() => handleUpdateBatchStatus(latestDocBatch.id, "Approved")}
                                className="px-4 py-2 kk-primary font-bold text-xs rounded-xl transition flex items-center gap-1 cursor-pointer"
                              >
                                <Check className="h-3.5 w-3.5 text-slate-950" />
                                Approve Batch
                              </button>
                              <button
                                onClick={() => handleUpdateBatchStatus(latestDocBatch.id, "Rejected")}
                                className="kk-reject-batch-button px-3 py-2 bg-slate-800 hover:bg-red-950 text-slate-400 hover:text-red-400 font-semibold text-xs rounded-xl border border-slate-750 transition flex items-center gap-1 cursor-pointer"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                Reject Batch
                              </button>
                            </>
                          ) : (
                            <div className="flex items-center gap-2">
                              {latestDocBatch.status === "Approved" ? (
                                <span className="text-xs text-green-400 font-semibold flex items-center gap-1.5 bg-green-500/5 px-3 py-1.5 rounded-xl border border-green-500/20">
                                  <CheckCircle className="h-4 w-4" />
                                  Batch Approved & Added to Registry
                                </span>
                              ) : (
                                <span className="text-xs text-red-400 font-semibold flex items-center gap-1.5 bg-red-500/5 px-3 py-1.5 rounded-xl border border-red-500/20">
                                  <XCircle className="h-4 w-4" />
                                  Batch Rejected
                                </span>
                              )}
                              <button
                                onClick={() => handleUpdateBatchStatus(latestDocBatch.id, "Pending")}
                                className="px-2.5 py-1 text-[10px] font-semibold text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-lg transition cursor-pointer"
                              >
                                Reset Status
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* SFT Examples scroll-through rendering list */}
                      <ProgressiveScrollList
                        items={latestDocBatch.examples}
                        title="Converted SFT Examples"
                        renderItem={(ex: SFTExample, exIdx: number) => (
                          <div key={exIdx} className="bg-slate-900/50 border border-slate-800/70 rounded-xl p-3 sm:p-4 relative overflow-hidden group kk-example-card">
                            {/* Example Header with Controls */}
                            <div className="flex items-center justify-between gap-2 mb-2.5 pb-2 border-b border-slate-800/60">
                              <span className="font-mono text-xs font-bold kk-example-label">
                                Example #{exIdx + 1}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => handleStartEditExample(latestDocBatch.id, exIdx, ex)}
                                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                                  title="Edit example"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteExample(latestDocBatch.id, exIdx)}
                                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-950 text-slate-300 hover:text-red-400 transition cursor-pointer"
                                  title="Delete item"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Render dialog layout of training example taking 100% full width */}
                            <div className="space-y-2.5 w-full">
                              {ex.messages.map((m, mIdx) => (
                                <div key={mIdx} className="text-xs leading-relaxed">
                                  {/* Role display */}
                                  <div className="flex items-center gap-1.5 mb-1">
                                    {m.role === "system" && (
                                      <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/50">
                                        System Context
                                      </span>
                                    )}
                                    {m.role === "user" && (
                                      <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1">
                                        <User className="h-3 w-3" /> User Prompt
                                      </span>
                                    )}
                                    {m.role === "assistant" && (
                                      <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20 flex items-center gap-1">
                                        <Cpu className="h-3 w-3" /> Assistant Target
                                      </span>
                                    )}
                                  </div>

                                  {/* Reasoning trace details (rendered BEFORE content for thinking models) */}
                                  {m.role === "assistant" && (m.reasoning || (typeof m.content === "string" && m.content.includes("<think>"))) && (
                                    <div className="mb-2 ml-2 p-2.5 rounded-lg bg-slate-950/60 border border-slate-850 text-slate-400 font-mono text-[10px] leading-normal kk-reasoning-example">
                                      <span className="text-amber-400/90 block font-semibold uppercase tracking-wider mb-1 flex items-center gap-1">
                                        🧠 Train of Thought / Reasoning Trace:
                                      </span>
                                      {safeRenderText(
                                        m.reasoning || 
                                        (typeof m.content === "string" && m.content.match(/<think>([\s\S]*?)<\/think>/i)?.[1]?.trim()) || 
                                        ""
                                      )}
                                    </div>
                                  )}

                                  {/* Response content */}
                                  <div className="pl-2 border-l-2 border-slate-800 text-slate-300 font-sans whitespace-pre-line leading-relaxed">
                                    {safeRenderText(
                                      typeof m.content === "string"
                                        ? m.content
                                            .replace(/<think>[\s\S]*?<\/think>/gi, "")
                                            .replace(/^###\s*(Instruction|Response):\s*/i, "")
                                            .replace(/^\[INST\]\s*/i, "")
                                            .replace(/\s*\[\/INST\]$/i, "")
                                            .replace(/^<s>/i, "")
                                            .replace(/<\/s>$/i, "")
                                            .trim()
                                        : m.content
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      />
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* TAB 3: TRIAD ALIGNMENT */}
            {activeTab === "triad" && (
              <motion.div
                key="triad-tab"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-6 min-w-0"
              >
                {/* TRiAD Alignment Import pipeline */}
                <div className="bg-slate-950/30 border border-slate-800/50 p-5 sm:p-6 rounded-xl flex flex-col justify-between min-w-0">
                  <div>
                    <div className="border-b border-slate-800/70 pb-4 mb-5">
                      <div className="flex items-center justify-between">
                        <h2 className="text-base font-bold text-white flex items-center gap-2">
                          <ShieldAlert className="h-5 w-5 text-amber-400" />
                          TRiAD Alignment
                        </h2>
                        <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-mono uppercase font-semibold">
                          Pre-generated
                        </span>
                      </div>
                      <p className="text-xs text-slate-200 font-medium mt-1">
                        Add pre-generated TRiAD alignment examples to your project.
                      </p>
                      <button
                        type="button"
                        onClick={() => openAiGuide("triad")}
                        className="kk-guide-trigger mt-3 rounded-lg border border-purple-400 bg-purple-300 px-4 py-2 text-sm font-bold text-black hover:bg-purple-200"
                      >
                        AI Guide
                      </button>
                    </div>

                    {sectionGuide === "triad" && <AlignmentQaGuide key="triad" page="triad" onClose={() => setSectionGuide(null)} />}

                    {/* External dataset requirements */}
                    <div className="bg-slate-900/40 border border-slate-800/60 p-4 rounded-xl mb-6">
                      <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                        Choose a batch size and template to use the pre-generated TRiAD alignment dataset. This option is for alignment only, not file uploads.
                      </p>
                    </div>

                    {/* Pre-script injection visualizer */}
                    <div className="bg-amber-500/5 border border-amber-500/10 p-3.5 rounded-xl mb-6 text-xs text-amber-400 leading-relaxed">
                      <div className="flex gap-2.5">
                        <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <strong className="block text-slate-200 mb-0.5">Automated script behavior:</strong>
                          Before importing, we will modify every alignment example by inserting your project System Prompt:
                          <code className="block mt-1.5 bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/60 font-mono text-[10px] text-slate-300 whitespace-pre-wrap break-all max-h-28 overflow-y-auto custom-scrollbar">
                            {project.systemPrompt}
                          </code>
                        </div>
                      </div>
                    </div>

                    {/* TRiAD Template Selection */}
                    <div className="mb-5">
                        <label className="block text-xs font-semibold text-slate-300 mb-2">Batch Template Type</label>
                      {project.projectFormat === ProjectFormat.INSTRUCTION ? (
                        <div className="p-3 bg-purple-950/20 border border-purple-800/40 rounded-xl flex flex-wrap items-center justify-between gap-2 overflow-hidden min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <Code className="h-4 w-4 text-purple-400 shrink-0" />
                            <span className="font-bold text-slate-200 text-xs truncate">Instruction Template ({project.instructTemplate || "ChatML"})</span>
                            <span className="text-[10px] text-slate-400 font-mono truncate">
                              {(project.instructTemplate || InstructTemplate.CHATML) === InstructTemplate.CHATML
                                ? "<|im_start|> tags"
                                : project.instructTemplate === InstructTemplate.MISTRAL
                                ? "[INST] tags"
                                : "### Instruction / ### Response"}
                            </span>
                          </div>
                          <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded font-mono font-bold shrink-0">
                            LOCKED ({project.instructTemplate || "ChatML"})
                          </span>
                        </div>
                      ) : null}
                      <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
                        Records the selected batch type; imported source messages are preserved.
                      </p>
                    </div>

                    {/* Sizes Selection */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-2">Maximum Import Size</label>
                      <div className="grid grid-cols-3 gap-2 mb-4">
                        {[150, 300, 750].map((size) => (
                          <button
                            key={size}
                            onClick={() => setTriadSize(size)}
                            className={`py-3 rounded-xl border text-xs font-mono font-bold flex flex-col items-center justify-center transition-all ${
                              triadSize === size
                                ? "bg-amber-500/10 border-amber-500/40 text-amber-400 shadow-md"
                                : "bg-slate-900/50 border-slate-800 text-slate-400 hover:text-slate-300"
                            }`}
                          >
                            <span>{size}</span>
                            <span className="text-[9px] text-slate-500 font-normal">Examples</span>
                          </button>
                        ))}
                      </div>

                      {/* Custom URL Input */}
                      <div hidden className="bg-slate-900/40 border border-slate-800 p-3.5 rounded-xl">
                        <label className="block text-[11px] font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                          <span>Dataset URL for up to {triadSize} examples</span>
                          <span className="text-[9px] text-slate-500 font-normal italic">Required</span>
                        </label>
                        <input
                          type="url"
                          placeholder="https://drive.google.com/file/d/.../view"
                          required
                          value={triadUrls[triadSize] || ""}
                          onChange={(e) => setTriadUrls(prev => ({ ...prev, [triadSize]: e.target.value }))}
                          className="w-full text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-300 focus:outline-none focus:border-amber-500/50"
                        />
                        <p className="text-[9px] text-slate-500 mt-1 leading-relaxed">
                          Enter a Google Drive share link or a direct CSV, JSON, or JSONL download URL.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-800/60 pt-5 mt-6 flex items-center justify-between">
                    <span className="text-xs text-slate-500">You may skip this step entirely</span>
                    <button
                      disabled={isTriadImporting || isFieldsUnlocked || !selectedProjectId || !triadUrls[triadSize]?.trim()}
                      onClick={handleTriadImport}
                      className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
                        isFieldsUnlocked || !selectedProjectId || !triadUrls[triadSize]?.trim()
                          ? "bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed opacity-60"
                          : "bg-amber-500 hover:bg-amber-600 text-slate-950"
                      }`}
                    >
                      {isTriadImporting ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin text-slate-950" />
                          <span>Importing Dataset...</span>
                        </>
                      ) : (isFieldsUnlocked || !selectedProjectId) ? (
                        <>
                          <Lock className="h-4 w-4 text-slate-500" />
                          <span>Import Locked (Save & Lock First)</span>
                        </>
                      ) : !triadUrls[triadSize]?.trim() ? (
                        <span>Alignment dataset unavailable</span>
                      ) : (
                        <>
                          <PlusCircle className="h-4 w-4 text-slate-950" />
                          <span>Run Script & Import</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* TRiAD Alignment Review & Inspection Card */}
                {latestTriadBatch && (
                  <div className="bg-slate-950/30 border border-slate-800/50 p-5 sm:p-6 rounded-xl space-y-4">
                    <div className="border-b border-slate-800/70 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                          <CheckCircle className="h-5 w-5 text-amber-400" />
                          TRiAD Alignment Batch Review
                        </h2>
                        <p className="text-xs text-slate-400">
                          Inspect the imported TRiAD Core alignment dataset with dynamically injected project System Prompt.
                        </p>
                      </div>
                      <span className="px-2.5 py-1 rounded text-xs font-mono font-bold self-start sm:self-center border bg-green-500/10 text-green-400 border-green-500/20">
                        Status: Approved (In Registry)
                      </span>
                    </div>

                    <div className="space-y-4">
                      {/* Batch metadata bar */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-4 rounded-xl border border-slate-800 text-xs">
                        <div className="space-y-1">
                          <div className="text-slate-200 font-semibold">{latestTriadBatch.name}</div>
                          <div className="text-[10px] text-slate-500 font-mono">Timestamp: {latestTriadBatch.timestamp} • {latestTriadBatch.examplesCount} Examples • {latestTriadBatch.description}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-green-400 font-semibold flex items-center gap-1.5 bg-green-500/5 px-3 py-1.5 rounded-xl border border-green-500/20">
                            <CheckCircle className="h-4 w-4" />
                            Active in Training Registry
                          </span>
                        </div>
                      </div>

                      {/* SFT Examples scroll-through rendering list */}
                      <ProgressiveScrollList
                        items={latestTriadBatch.examples}
                        title="TRiAD Alignment Examples"
                        renderItem={(ex: SFTExample, exIdx: number) => (
                          <div key={exIdx} className="bg-slate-900/50 border border-slate-800/70 rounded-xl p-3 sm:p-4 relative overflow-hidden group kk-example-card">
                            {/* Example Header with Controls */}
                            <div className="flex items-center justify-between gap-2 mb-2.5 pb-2 border-b border-slate-800/60">
                              <span className="font-mono text-xs font-bold kk-example-label">
                                Example #{exIdx + 1}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => handleStartEditExample(latestTriadBatch.id, exIdx, ex)}
                                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                                  title="Edit example"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteExample(latestTriadBatch.id, exIdx)}
                                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-950 text-slate-300 hover:text-red-400 transition cursor-pointer"
                                  title="Delete item"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Render dialog layout of training example taking 100% full width */}
                            <div className="space-y-2.5 w-full">
                              {ex.messages.map((m, mIdx) => (
                                <div key={mIdx} className="text-xs leading-relaxed">
                                  {/* Role display */}
                                  <div className="flex items-center gap-1.5 mb-1">
                                    {m.role === "system" && (
                                      <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                        Injected Project System Context
                                      </span>
                                    )}
                                    {m.role === "user" && (
                                      <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1">
                                        <User className="h-3 w-3" /> User Prompt
                                      </span>
                                    )}
                                    {m.role === "assistant" && (
                                      <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20 flex items-center gap-1">
                                        <Cpu className="h-3 w-3" /> Assistant Target
                                      </span>
                                    )}
                                  </div>

                                  {/* Reasoning trace details (rendered BEFORE content for thinking models) */}
                                  {m.role === "assistant" && (m.reasoning || (typeof m.content === "string" && m.content.includes("<think>"))) && (
                                    <div className="mb-2 ml-2 p-2.5 rounded-lg bg-slate-950/60 border border-slate-850 text-slate-400 font-mono text-[10px] leading-normal kk-reasoning-example">
                                      <span className="text-amber-400/90 block font-semibold uppercase tracking-wider mb-1 flex items-center gap-1">
                                        🧠 Train of Thought / Reasoning Trace:
                                      </span>
                                      {safeRenderText(
                                        m.reasoning || 
                                        (typeof m.content === "string" && m.content.match(/<think>([\s\S]*?)<\/think>/i)?.[1]?.trim()) || 
                                        ""
                                      )}
                                    </div>
                                  )}

                                  {/* Response content */}
                                  <div className="pl-2 border-l-2 border-slate-800 text-slate-300 font-sans whitespace-pre-line leading-relaxed">
                                    {safeRenderText(
                                      typeof m.content === "string"
                                        ? m.content
                                            .replace(/<think>[\s\S]*?<\/think>/gi, "")
                                            .replace(/^###\s*(Instruction|Response):\s*/i, "")
                                            .replace(/^\[INST\]\s*/i, "")
                                            .replace(/\s*\[\/INST\]$/i, "")
                                            .replace(/^<s>/i, "")
                                            .replace(/<\/s>$/i, "")
                                            .trim()
                                        : m.content
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      />
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* TAB 4: AI QUALITY ASSESSMENT & DEDUPLICATION */}
            {activeTab === "assess" && (
              <motion.div
                key="assess-tab"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-6 kk-qa-panel"
              >
                {/* Batch Selector & AI grading Header */}
                <div className="bg-slate-950/30 border border-slate-800/50 p-5 sm:p-6 rounded-xl">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800/70 pb-4 mb-6">
                    <div>
                      <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Search className="h-5 w-5 text-yellow-400" />
                        AI Quality Assessor
                      </h2>
                      <p className="text-xs text-slate-400">
                        Select a batch from the registry to execute full-format, template, schema, and persona quality audits.
                      </p>
                      <button
                        type="button"
                        onClick={() => openAiGuide("assess")}
                        className="kk-guide-trigger mt-3 rounded-lg border border-purple-400 bg-purple-300 px-4 py-2 text-sm font-bold text-black hover:bg-purple-200"
                      >
                        AI Guide
                      </button>
                    </div>

                    {/* Selector */}
                    <div className="min-w-0 max-w-full md:max-w-xs shrink-0">
                      <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Active Registry Batch</label>
                      <select
                        value={selectedBatchId}
                        onChange={(e) => setSelectedBatchId(e.target.value)}
                        className="bg-slate-900 border border-slate-800 text-xs text-slate-200 px-3 py-2 rounded-xl focus:border-green-500 outline-none w-full max-w-[280px] sm:max-w-[340px] truncate"
                      >
                        {batches.map(b => (
                          <option key={b.id} value={b.id} className="bg-slate-950 text-slate-200">
                            {b.name} ({b.examplesCount} sfts - {b.partial ? "Partial - " : ""}{b.status})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {sectionGuide === "assess" && <AlignmentQaGuide key="assess" page="assess" onClose={() => setSectionGuide(null)} />}

                  {/* Quality Audit Stats & Buttons */}
                  {currentBatch ? (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-center min-w-0">
                      
                      {/* Overall score circular display */}
                      <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800/60 text-center flex flex-col items-center justify-center min-w-0">
                        <span className="text-[10px] text-slate-500 uppercase font-mono font-bold tracking-wider mb-2">Audit Score</span>
                        <div className={`h-20 w-20 rounded-full border-4 flex items-center justify-center font-bold font-mono text-xl ${
                          activeReport 
                            ? activeReport.overallScore >= 80 
                              ? "border-green-500 text-green-400 bg-green-500/5" 
                              : activeReport.overallScore >= 50
                              ? "border-amber-500 text-amber-400 bg-amber-500/5"
                              : "border-red-500 text-red-400 bg-red-500/5"
                            : "border-slate-800 text-slate-500"
                        }`}>
                          {activeReport ? `${activeReport.overallScore}%` : "N/A"}
                        </div>
                        <span className="text-[10px] text-slate-400 mt-2 font-semibold">
                          {activeReport 
                            ? activeReport.overallScore >= 80
                              ? "Passed Quality Audit"
                              : activeReport.overallScore >= 50
                              ? "Issues Requiring Review"
                              : "Critical Defects Found"
                            : "Needs Analysis"}
                        </span>
                      </div>

                      {/* Summary details */}
                      <div className="md:col-span-2 space-y-3 min-w-0">
                        <h3 className="text-sm font-semibold text-slate-200 truncate" title={currentBatch.name}>{currentBatch.name}</h3>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <span className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-emerald-400 font-mono flex items-center gap-1.5" title="Generated Batch ID">
                            <span className="text-slate-500">ID:</span>
                            <span>{currentBatch.batchId || currentBatch.id}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const idToCopy = currentBatch.batchId || currentBatch.id;
                                navigator.clipboard.writeText(idToCopy);
                                setNotification({ text: `Copied Batch ID: ${idToCopy}`, type: "info" });
                              }}
                              className="hover:text-emerald-300 text-slate-500 transition ml-0.5 cursor-pointer"
                              title="Copy Batch ID"
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                          </span>
                          <span className="bg-slate-900 px-2 py-0.5 rounded text-slate-300 font-mono">
                            Type: {currentBatch.templateType}
                          </span>
                          <span className="bg-slate-900 px-2 py-0.5 rounded text-slate-300 font-mono">
                            Date: {currentBatch.timestamp}
                          </span>
                        </div>
                        
                        {activeReport && (
                          <div className="text-xs space-y-1 text-slate-400 font-mono">
                            <div>• Passed quality count: <span className="text-green-400">{activeReport.stats.passedCount}</span></div>
                            <div>• Flagged/Warning items: <span className="text-amber-400">{activeReport.stats.flaggedCount}</span></div>
                            <div>• Redundant entries: <span className="text-red-400">{activeReport.duplicateCheck.duplicatesFound}</span></div>
                          </div>
                        )}
                      </div>

                      {/* Quick controls */}
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => handleAnalyzeQuality(currentBatch.id)}
                          className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-yellow-500/10 to-yellow-500/20 hover:from-yellow-500/20 hover:to-yellow-500/30 border border-yellow-500/30 text-yellow-400 text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
                        >
                          {isAssessing ? (
                            <>
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              <span>Analyzing Batch...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-3.5 w-3.5" />
                              <span>Run AI Quality Audit</span>
                            </>
                          )}
                        </button>
                        
                        <button
                          onClick={() => handleRegenerateFlagged(currentBatch.id)}
                          disabled={isRegeneratingFlagged || isAssessing}
                          className={`w-full py-2.5 px-4 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition ${
                            isRegeneratingFlagged
                              ? "bg-green-500/20 border-green-500/40 text-green-300 cursor-not-allowed"
                              : "bg-green-500/10 hover:bg-green-500/20 border-green-500/30 text-green-400 cursor-pointer"
                          }`}
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${isRegeneratingFlagged ? "animate-spin" : ""}`} />
                          <span>{isRegeneratingFlagged ? "Regenerating Flagged..." : "Regenerate Flagged"}</span>
                        </button>
                        {isRegeneratingFlagged && qaRepairProgress && (
                          <div className="space-y-2" aria-live="polite">
                            <div className="flex items-center justify-between gap-2 text-[11px] text-slate-300">
                              <span>{qaRepairProgress.saving ? "Saving repaired examples..." : "Processing flagged examples..."}</span>
                              <span className="font-mono text-green-300">
                                {qaRepairProgress.completed} / {qaRepairProgress.total}
                              </span>
                            </div>
                            <div
                              className="h-2 w-full overflow-hidden rounded-full bg-slate-800"
                              role="progressbar"
                              aria-label="Regenerate flagged progress"
                              aria-valuemin={0}
                              aria-valuemax={qaRepairProgress.total}
                              aria-valuenow={qaRepairProgress.completed}
                            >
                              <div
                                className="h-full rounded-full bg-green-500 transition-[width] duration-300"
                                style={{ width: `${Math.min(100, qaRepairProgress.completed / Math.max(1, qaRepairProgress.total) * 100)}%` }}
                              />
                            </div>
                          </div>
                        )}

                        <button
                          onClick={() => handleDeduplicate(currentBatch.id)}
                          className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-slate-400" />
                          <span>Deduplicate Dataset</span>
                        </button>

                        <div className="grid grid-cols-2 gap-2 mt-1">
                          <button
                            onClick={() => handleUpdateBatchStatus(currentBatch.id, "Approved")}
                            className={`py-1.5 px-2 rounded-lg border text-[11px] font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                              currentBatch.status === "Approved"
                                ? "bg-green-500/20 border-green-500/40 text-green-400"
                                : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-300"
                            }`}
                          >
                            <Check className="h-3.5 w-3.5" />
                            Approve
                          </button>

                          <button
                            onClick={() => handleUpdateBatchStatus(currentBatch.id, "Rejected")}
                            className={`py-1.5 px-2 rounded-lg border text-[11px] font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                              currentBatch.status === "Rejected"
                                ? "bg-red-500/20 border-red-500/40 text-red-400"
                                : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-300"
                            }`}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Reject
                          </button>
                        </div>
                      </div>

                    </div>
                  ) : (
                    <div className="text-center py-6 text-slate-500 text-xs">No active batches available. Please generate one first.</div>
                  )}
                </div>

                {/* AI Suggestions & Flagged Issues layout */}
                {activeReport && (
                  <>
                    <div className="bg-slate-950/40 border border-slate-800/80 p-5 rounded-2xl mb-6">
                       <h2 className="text-lg font-bold text-white mb-2">Batch Assessment Summary</h2>
                       <p className="text-sm text-slate-400">
                         Assessed <span className="text-white font-semibold">{currentBatch.examples.length}</span> examples. 
                         Found <span className="text-amber-400 font-semibold">{activeReport.issues.length}</span> issues requiring review.
                       </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Issues List */}
                      <div className="bg-slate-950/40 border border-slate-800/80 p-5 rounded-2xl">
                        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                          <ShieldAlert className="h-4 w-4 text-amber-400" />
                          Flagged SFT Compliance Issues
                        </h3>
                        <div className="space-y-3 custom-scrollbar max-h-60 overflow-y-auto pr-1">
                          {activeReport.issues.map((iss, idx) => (
                            <div key={idx} className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 text-xs">
                              <div className="flex items-center justify-between mb-2">
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wide font-bold ${
                                  iss.severity === "High" ? "bg-red-500/10 text-red-400 border border-red-500/20" :
                                  iss.severity === "Medium" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                                  "bg-slate-800 text-slate-400"
                                }`}>
                                  {iss.severity} Severity
                                </span>
                                <span className="text-slate-500 text-[10px] font-mono">
                                  {iss.type}
                                </span>
                              </div>
                              <p className="text-slate-400 mb-1 text-[10px] uppercase font-bold">Reason:</p>
                              <p className="text-slate-300 leading-relaxed font-sans">{iss.message}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Optimization Suggestions */}
                      <div className="bg-slate-950/40 border border-slate-800/80 p-5 rounded-2xl">
                        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-green-400" />
                          AI Synthesis Suggestions
                        </h3>
                        <ul className="space-y-3">
                          {activeReport.suggestions.map((sug, idx) => (
                            <li key={idx} className="flex gap-2 text-xs leading-relaxed text-slate-300">
                              <span className="h-5 w-5 rounded-full bg-green-500/10 text-green-400 flex items-center justify-center shrink-0 font-mono font-bold text-[10px]">
                                {idx + 1}
                              </span>
                              <span className="mt-0.5">{sug}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </>
                )}

                {/* SFT Conversation Inspector List (Editable items with scroll-through rendering) */}
                {currentBatch && (
                  <div className="bg-slate-950/30 border border-slate-800/50 p-5 sm:p-6 rounded-xl">
                    <div className="border-b border-slate-800/70 pb-4 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                          <Layers className="h-4 w-4 text-green-400" />
                          SFT Dataset Inspect & Inline Editor
                        </h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Viewing {displayedInspectorItems.length} of {currentBatch.examples.length} total items
                        </p>
                      </div>

                      {/* Filter Toggles */}
                      <div className="flex items-center gap-1.5 bg-slate-900/80 p-1 rounded-xl border border-slate-800 shrink-0">
                        <button
                          onClick={() => setInspectorFilter("flagged")}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                            inspectorFilter === "flagged"
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                              : "text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          <ShieldAlert className="h-3.5 w-3.5" />
                          <span>Flagged Items ({activeReport ? activeReport.issues.length : 0})</span>
                        </button>
                        <button
                          onClick={() => setInspectorFilter("all")}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                            inspectorFilter === "all"
                              ? "bg-slate-800 text-white border border-slate-700"
                              : "text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          <span>All Examples ({currentBatch.examples.length})</span>
                        </button>
                      </div>
                    </div>

                    {displayedInspectorItems.length === 0 ? (
                      <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl bg-slate-900/20">
                        <CheckCircle className="h-8 w-8 text-green-400 mx-auto mb-2" />
                        <h4 className="text-xs font-bold text-slate-200">
                          {inspectorFilter === "flagged"
                            ? (activeReport ? "Zero Flagged Items!" : "No Audit Performed Yet")
                            : "No Examples in this Batch"}
                        </h4>
                        <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
                          {inspectorFilter === "flagged"
                            ? (activeReport
                                ? "All examples in this dataset pass compliance checks or have been deduplicated."
                                : "Click 'Run AI Quality Audit' above to evaluate this batch, or switch to 'All Examples' to inspect items.")
                            : "Generate or import examples into this batch to inspect them."}
                        </p>
                        {currentBatch.examples.length > 0 && (
                          <div className="flex items-center justify-center gap-2 mt-3">
                            {!activeReport && (
                              <button
                                onClick={() => handleAnalyzeQuality(currentBatch.id)}
                                disabled={isAssessing}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/40 text-emerald-300 text-xs font-semibold border border-emerald-500/30 transition cursor-pointer"
                              >
                                {isAssessing ? "Analyzing..." : "Run AI Quality Audit"}
                              </button>
                            )}
                            {inspectorFilter === "flagged" && (
                              <button
                                onClick={() => setInspectorFilter("all")}
                                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition cursor-pointer"
                              >
                                View All {currentBatch.examples.length} Examples
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <ProgressiveScrollList
                        items={displayedInspectorItems}
                        renderItem={(item: any) => {
                          const { example: ex, originalIndex, issues: exampleIssues, isFlagged } = item;
                          const hasHigh = exampleIssues.some(iss => iss.severity === "High");
                          const hasMedium = exampleIssues.some(iss => iss.severity === "Medium" || iss.severity === "Moderate");

                          let borderClass = "border-slate-800/60";

                          if (hasHigh) {
                            borderClass = "border-red-500/50";
                          } else if (hasMedium) {
                            borderClass = "border-yellow-500/50";
                          } else if (isFlagged) {
                            borderClass = "border-amber-500/50";
                          }

                          return (
                            <div
                              key={`batch-${currentBatch.id}-ex-${originalIndex}`}
                              className={`rounded-xl p-4 relative overflow-hidden group border transition-all duration-300 kk-example-card ${borderClass}`}
                            >
                              {/* Header with Example # and actions */}
                              <div className="flex items-center justify-between mb-3 border-b border-slate-800/60 pb-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs font-bold kk-example-label">
                                    Example #{originalIndex + 1}
                                  </span>
                                  {isFlagged ? (
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                                      hasHigh ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                    }`}>
                                      {exampleIssues.length} Flag{exampleIssues.length > 1 ? "s" : ""}
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-mono text-green-400 bg-green-500/10 border border-green-500/20">
                                      Passed QA
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => handleStartEditExample(currentBatch.id, originalIndex, ex)}
                                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                                    title="Edit example"
                                  >
                                    <Edit3 className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteExample(currentBatch.id, originalIndex)}
                                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-950 text-slate-300 hover:text-red-400 transition cursor-pointer"
                                    title="Delete item"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>

                              {/* QA flag alerts banner */}
                              {exampleIssues.length > 0 && (
                                <div className={`mb-4 p-3 rounded-xl border ${
                                  hasHigh 
                                    ? "bg-red-500/10 border-red-500/20 text-red-400" 
                                    : "bg-yellow-500/10 border-yellow-500/20 text-yellow-400"
                                } flex flex-col gap-2 leading-relaxed text-xs`}>
                                  {exampleIssues.map((iss, issIdx) => (
                                    <div key={issIdx} className="flex items-start gap-2">
                                      <ShieldAlert className={`h-4 w-4 shrink-0 mt-0.5 ${hasHigh ? "text-red-400" : "text-yellow-400"}`} />
                                      <div>
                                        <span className="font-bold font-mono text-[10px] uppercase tracking-wider mr-1.5">
                                          [{iss.severity} QA FLAG]:
                                        </span>
                                        <span>{iss.message}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Render dialog layout of training example */}
                              <div className="space-y-3">
                                {ex.messages.map((m, mIdx) => (
                                  <div key={mIdx} className="text-xs leading-relaxed">
                                    {/* Role display */}
                                    <div className="flex items-center gap-1.5 mb-1">
                                      {m.role === "system" && (
                                        <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/50">
                                          System Context
                                        </span>
                                      )}
                                      {m.role === "user" && (
                                        <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1">
                                          <User className="h-3 w-3" /> User Prompt
                                        </span>
                                      )}
                                      {m.role === "assistant" && (
                                        <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20 flex items-center gap-1">
                                          <Cpu className="h-3 w-3" /> Assistant Target
                                        </span>
                                      )}
                                    </div>

                                    {/* Reasoning trace details (rendered BEFORE content for thinking models) */}
                                    {m.role === "assistant" && (m.reasoning || (typeof m.content === "string" && m.content.includes("<think>"))) && (
                                      <div className="mb-2 ml-2 p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-slate-400 font-mono text-[10px] leading-normal kk-reasoning-example">
                                        <span className="text-amber-400/90 block font-semibold uppercase tracking-wider mb-1 flex items-center gap-1">
                                          🧠 Train of Thought / Reasoning Trace:
                                        </span>
                                        {safeRenderText(
                                          m.reasoning || 
                                          (typeof m.content === "string" && m.content.match(/<think>([\s\S]*?)<\/think>/i)?.[1]?.trim()) || 
                                          ""
                                        )}
                                      </div>
                                    )}

                                    {/* Response content */}
                                    <div className="pl-2 border-l-2 border-slate-800 text-slate-300 font-sans whitespace-pre-line leading-relaxed">
                                      {safeRenderText(
                                        typeof m.content === "string"
                                          ? m.content
                                              .replace(/<think>[\s\S]*?<\/think>/gi, "")
                                              .replace(/^###\s*(Instruction|Response):\s*/i, "")
                                              .replace(/^\[INST\]\s*/i, "")
                                              .replace(/\s*\[\/INST\]$/i, "")
                                              .replace(/^<s>/i, "")
                                              .replace(/<\/s>$/i, "")
                                              .trim()
                                          : m.content
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>

                            </div>
                          );
                        }}
                      />
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {/* TAB 4: DATA REGISTRY & FINAL COMPILATION */}
            {activeTab === "registry" && (
              <motion.div
                key="registry-tab"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="grid grid-cols-1 md:grid-cols-12 gap-6"
              >
                {/* Left side: completed batches lists */}
                <div className="md:col-span-7 bg-slate-950/30 border border-slate-800/50 p-5 sm:p-6 rounded-xl space-y-4 min-w-0">
                  <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <Database className="h-5 w-5 text-emerald-400" />
                      Dataset Registry
                    </h2>
                    <p className="text-xs text-slate-400">
                      Select QA-checked batches to include in the final dataset.
                    </p>
                    <button
                      type="button"
                      onClick={() => setSectionGuide("registry")}
                      className="kk-guide-trigger mt-3 rounded-lg border border-purple-400 bg-purple-300 px-4 py-2 text-sm font-bold text-black hover:bg-purple-200"
                    >
                      AI Guide
                    </button>
                  </div>

                  {sectionGuide === "registry" && (
                    <RegistryGuide
                      onClose={() => setSectionGuide(null)}
                      onOpenTrainer={() => { setSectionGuide(null); setActiveTab("trainer"); }}
                    />
                  )}

                  <div className="space-y-3">
                    {batches.filter(b => b.status !== "Rejected").length === 0 ? (
                      <div className="text-center py-8 text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl bg-slate-900/10">
                        <Database className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                        <p className="font-semibold text-slate-400">Registry is empty</p>
                        <p className="text-[11px] text-slate-500 mt-1 max-w-xs mx-auto">
                          Generate or convert a batch, then run its check in QA to include it in final output.
                        </p>
                      </div>
                    ) : (
                      batches.filter(b => b.status !== "Rejected").map((b) => (
                        <div
                          key={b.id}
                          onClick={() => toggleSelectRegistryBatch(b.id)}
                          className={`border rounded-lg px-2.5 py-1.5 transition-all flex items-center ${
                            !isRegistryEligible(b) ? "opacity-50 cursor-not-allowed border-slate-800 bg-slate-900/40" :
                            selectedRegistryBatches[b.id] !== false
                              ? "border-green-500 bg-green-500/5"
                              : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isRegistryEligible(b) && selectedRegistryBatches[b.id] !== false}
                            disabled={!isRegistryEligible(b)}
                            onClick={event => event.stopPropagation()}
                            onChange={() => toggleSelectRegistryBatch(b.id)}
                            className="rounded text-green-500 accent-green-500 cursor-pointer shrink-0"
                          />
                          <h3 className="ml-2 text-xs font-bold text-slate-100 truncate" title={b.name}>{b.name}</h3>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Right side: Combined Dataset compile & validation */}
                <div className="md:col-span-5 flex flex-col gap-6 min-w-0">
                  {/* final export card */}
                  <div className="bg-slate-950/30 border border-slate-800/50 p-5 sm:p-6 rounded-xl flex-1 flex flex-col justify-between">
                    <div>
                      <div className="border-b border-slate-800 pb-4 mb-4">
                        <h2 className="text-base font-bold text-white flex items-center gap-2">
                          <Download className="h-5 w-5 text-green-400" />
                          Compile & Export SFT
                        </h2>
                        <p className="text-xs text-slate-400">
                          We compile your selected batches, partition 10% automatically for validations, and prepare JSONL outputs.
                        </p>
                      </div>

                      {/* Compiler details */}
                      <div className="space-y-4 mb-6 text-xs">
                        <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800">
                          <h3 className="font-semibold text-slate-300 mb-2">Selected Dataset Breakdown:</h3>
                          <div className="space-y-1.5 font-mono text-[11px] text-slate-400">
                            <div className="flex justify-between">
                              <span>Included Batches:</span>
                              <span className="text-slate-200">{selectedApprovedBatches.length}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Total Selected SFTs:</span>
                              <span className="text-slate-200">{compiledDataset.trainingSet.length + compiledDataset.validationSet.length}</span>
                            </div>
                            <div className="flex justify-between border-t border-slate-800 pt-1.5 text-green-400">
                              <span>➔ Training Set Size:</span>
                              <span className="font-bold">{compiledDataset.trainingSet.length} examples</span>
                            </div>
                            <div className="flex justify-between text-yellow-400">
                              <span>➔ Validation Set Size (10%):</span>
                              <span className="font-bold">{compiledDataset.validationSet.length} examples</span>
                            </div>
                          </div>
                        </div>

                        {/* Target Export Template Selector */}
                        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                          <label className="block text-xs font-bold text-slate-200 flex items-center justify-between">
                            <span>Target Export Template Format</span>
                            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 uppercase">
                              {exportTemplateFormat}
                            </span>
                          </label>
                          <select
                            value={exportTemplateFormat}
                            onChange={(e) => {
                              setExportTemplateFormat(e.target.value);
                              setFormattedFormatBadge(null);
                            }}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-green-500/50 font-medium cursor-pointer"
                          >
                            <optgroup label="Instruction Formats">
                              <option value="chatml_token">ChatML Instruction (&lt;|im_start|&gt; variant)</option>
                              <option value="alpaca">Alpaca Format (instruction, input, output)</option>
                              <option value="maestro">Maestro Format (system, instruction, input, response)</option>
                              <option value="prompt_response">Prompt &amp; Response Pair Format (prompt, response)</option>
                            </optgroup>
                            <optgroup label="Conversation Formats">
                              <option value="chatml">ChatML Conversation (messages: [system, user, assistant])</option>
                              <option value="sharegpt">ShareGPT Multi-Turn Format (conversations: [from, value])</option>
                              <option value="deepseek">DeepSeek R1 / Reasoning Conversation (messages with &lt;think&gt; tags)</option>
                              <option value="openai_o1_o3">OpenAI o1/o3 Reasoning Conversation (reasoning_content + content)</option>
                            </optgroup>
                          </select>
                          <p className="text-[10px] text-slate-400 leading-relaxed">
                            {(exportTemplateFormat === "chatml" || exportTemplateFormat === "openai") && "Standard ChatML multi-turn conversational message array (messages: [{ role: 'system'|'user'|'assistant', content: '...' }])."}
                            {(exportTemplateFormat === "chatml_token" || exportTemplateFormat === "chatml_instruction") && "ChatML instruction variant formatting turns with <|im_start|>role\\ncontent\\n<|im_end|> special tokens for raw tokenized fine-tuning."}
                            {exportTemplateFormat === "alpaca" && "Stanford Alpaca instruction format restructuring turns into instruction, input context, and target output fields."}
                            {exportTemplateFormat === "maestro" && "Maestro instruction format mapping system directives, instruction tasks, input context, and target response outputs."}
                            {exportTemplateFormat === "prompt_response" && "Prompt and response instruction key-value pairs formatted for completion fine-tuning."}
                            {exportTemplateFormat === "sharegpt" && "ShareGPT multi-turn conversation format mapping turns to 'system', 'human', and 'gpt' conversation records."}
                            {exportTemplateFormat === "deepseek" && "DeepSeek R1 / Reasoning conversation format embedding step-by-step reasoning inside <think> tags for dialogue turns."}
                            {exportTemplateFormat === "openai_o1_o3" && "Strict OpenAI o1/o3 Reasoning conversation format (system prompt excluded; messages contain user & assistant roles with 'reasoning_content' and 'content')."}
                          </p>

                          {/* Dedicated Formatting Action Buttons */}
                          <div className="pt-2 flex flex-col sm:flex-row gap-2">
                            <button
                              type="button"
                              onClick={() => handleFormatDataset()}
                              disabled={(compiledDataset.trainingSet.length + compiledDataset.validationSet.length) === 0}
                              className="flex-1 py-2.5 px-4 rounded-xl kk-primary text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 transition cursor-pointer disabled:opacity-50"
                            >
                              <CheckCircle className="h-4 w-4" />
                              <span>Format Dataset to {exportTemplateFormat === "chatml_token" || exportTemplateFormat === "chatml_instruction" ? "ChatML Instruction (<|im_start|>)" : exportTemplateFormat === "chatml" || exportTemplateFormat === "openai" ? "ChatML Conversation" : exportTemplateFormat === "alpaca" ? "Alpaca" : exportTemplateFormat === "maestro" ? "Maestro" : exportTemplateFormat === "openai_o1_o3" ? "OpenAI o1/o3" : exportTemplateFormat === "deepseek" ? "DeepSeek R1" : exportTemplateFormat === "sharegpt" ? "ShareGPT" : "Prompt/Response"}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleTransformBatchExamplesToFormat(exportTemplateFormat)}
                              disabled={(compiledDataset.trainingSet.length + compiledDataset.validationSet.length) === 0}
                              title="Transform and convert assistant messages in active batches to match this target format"
                              className="py-2.5 px-3 rounded-xl bg-slate-950 hover:bg-slate-900 border border-emerald-500/30 text-emerald-400 hover:text-emerald-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                              <span>Apply to Batches</span>
                            </button>
                          </div>
                        </div>

                        {/* Validator generator explanation */}
                        <div className="bg-slate-900/40 p-4.5 rounded-xl border border-slate-800/80 leading-relaxed text-[11px] text-slate-300">
                          <span className="font-semibold text-blue-400 block mb-1 flex items-center gap-1.5">
                            <Sparkles className="h-3.5 w-3.5" />
                            Validator Generator Subset
                          </span>
                          The validator is a dedicated generator that automatically partitions an example set containing approximately <strong className="text-yellow-400 font-bold">10%</strong> of your selected final dataset registry, configured for immediate export in JSON or JSONL.
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 border-t border-slate-800/80 pt-5">
                      {/* SFT Training Section */}
                      <div className="space-y-2">
                        <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase block">1. SFT Training Set ({compiledDataset.trainingSet.length} items)</span>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => handleRequestExport("json", compiledDataset.trainingSet, "sft_training_dataset.json")}
                            disabled={compiledDataset.trainingSet.length === 0}
                            className="py-2 px-3 rounded-xl bg-gradient-to-r from-green-500/10 to-emerald-600/10 hover:from-green-500/20 hover:to-emerald-600/20 border border-green-500/30 text-green-400 text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 transition cursor-pointer"
                          >
                            <Download className="h-3.5 w-3.5" />
                            <span>Export JSON</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRequestExport("jsonl", compiledDataset.trainingSet, "sft_training_dataset.jsonl")}
                            disabled={compiledDataset.trainingSet.length === 0}
                            className="py-2 px-3 rounded-xl bg-gradient-to-r from-green-500/20 to-emerald-600/20 hover:from-green-500/30 hover:to-emerald-600/30 border border-green-500/40 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 transition cursor-pointer"
                          >
                            <Download className="h-3.5 w-3.5 text-green-400" />
                            <span>Export JSONL</span>
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const records = compiledDataset.trainingSet.map(ex => formatExampleForExport(ex, exportTemplateFormat));
                            if (!checkRegistryOutput(records, exportTemplateFormat)) return;
                            const lines = records.map(record => JSON.stringify(record)).join("\n");
                            navigator.clipboard.writeText(lines);
                            setNotification({ text: `Copied Training JSONL dataset (${compiledDataset.trainingSet.length} items) to clipboard!`, type: "success" });
                          }}
                          disabled={compiledDataset.trainingSet.length === 0}
                          className="w-full mt-2 py-1.5 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-[11px] font-medium flex items-center justify-center gap-1.5 disabled:opacity-40 transition cursor-pointer"
                        >
                          <Copy className="h-3 w-3 text-slate-400" />
                          <span>Copy Training JSONL to Clipboard</span>
                        </button>
                      </div>

                      {/* Validator Section */}
                      <div className="space-y-2">
                        <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase block">2. Validator Subset (~10% Size: {compiledDataset.validationSet.length} items)</span>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => handleRequestExport("json", compiledDataset.validationSet, "sft_validation_dataset.json")}
                            disabled={compiledDataset.validationSet.length === 0}
                            className="py-2 px-3 rounded-xl bg-gradient-to-r from-yellow-500/10 to-amber-600/10 hover:from-yellow-500/20 hover:to-amber-600/20 border border-yellow-500/30 text-yellow-400 text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 transition cursor-pointer"
                          >
                            <Download className="h-3.5 w-3.5" />
                            <span>Export JSON</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRequestExport("jsonl", compiledDataset.validationSet, "sft_validation_dataset.jsonl")}
                            disabled={compiledDataset.validationSet.length === 0}
                            className="py-2 px-3 rounded-xl bg-gradient-to-r from-yellow-500/20 to-amber-600/20 hover:from-yellow-500/30 hover:to-amber-600/30 border border-yellow-500/40 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 transition cursor-pointer"
                          >
                            <Download className="h-3.5 w-3.5 text-yellow-400" />
                            <span>Export JSONL</span>
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const records = compiledDataset.validationSet.map(ex => formatExampleForExport(ex, exportTemplateFormat));
                            if (!checkRegistryOutput(records, exportTemplateFormat)) return;
                            const lines = records.map(record => JSON.stringify(record)).join("\n");
                            navigator.clipboard.writeText(lines);
                            setNotification({ text: `Copied Validation JSONL dataset (${compiledDataset.validationSet.length} items) to clipboard!`, type: "success" });
                          }}
                          disabled={compiledDataset.validationSet.length === 0}
                          className="w-full mt-2 py-1.5 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-[11px] font-medium flex items-center justify-center gap-1.5 disabled:opacity-40 transition cursor-pointer"
                        >
                          <Copy className="h-3 w-3 text-slate-400" />
                          <span>Copy Validation JSONL to Clipboard</span>
                        </button>
                      </div>

                    </div>
                  </div>

                  {/* live preview of exported format */}
                  {exportedPreview && (
                    <div id="dataset-formatted-preview" className="bg-slate-950/30 border border-slate-800/50 p-5 rounded-xl space-y-3 scroll-mt-20">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <h3 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                          <Code className="h-3.5 w-3.5 text-blue-400" />
                          <span>Formatted Dataset Output Preview</span>
                        </h3>
                        <div className="flex items-center gap-2">
                          {formattedFormatBadge && (
                            <span className="text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-semibold flex items-center gap-1">
                              <CheckCircle className="h-3 w-3 text-emerald-400" />
                              <span>Formatted: {formattedFormatBadge}</span>
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(exportedPreview);
                              setNotification({ text: "Copied formatted dataset preview to clipboard!", type: "success" });
                            }}
                            className="py-1 px-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-[10px] font-semibold flex items-center gap-1 transition cursor-pointer"
                          >
                            <Copy className="h-3 w-3 text-emerald-400" />
                            <span>Copy JSON Preview</span>
                          </button>
                        </div>
                      </div>
                      <pre className="kk-code text-[10px] text-slate-300 font-mono bg-slate-900/60 p-3.5 rounded-xl overflow-x-auto max-h-60 custom-scrollbar whitespace-pre border border-slate-800">
                        {exportedPreview}
                      </pre>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* TAB 6: IN-APP CHAT ASSISTANT */}
            {activeTab === "expert" && (
              <motion.div
                key="expert-tab"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="w-full max-w-5xl mx-auto"
              >
                <div className="bg-slate-950/30 border border-slate-800/50 rounded-xl flex flex-col h-[720px] overflow-hidden shadow-lg">
                  {/* Chat Header */}
                  <div className="flex items-center justify-between border-b border-slate-800/70 px-6 py-4 bg-slate-900/30 kk-strip">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400 border border-emerald-500/20 shrink-0">
                        <MessageSquare className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-sm font-bold text-white">
                          App Support
                        </h2>
                        <p className="text-xs text-slate-400 truncate">
                          Ask anything about using SFT Studio Pro, your datasets, or fine-tuning workflows.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleClearChat}
                        className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-400 hover:text-slate-200 transition cursor-pointer flex items-center gap-1.5"
                        title="Clear conversation"
                      >
                        <RefreshCw className="h-3 w-3" />
                        <span className="hidden sm:inline">Clear Chat</span>
                      </button>
                    </div>
                  </div>

                  {/* Messages Scroll Area */}
                  <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 custom-scrollbar">
                    {expertMessages.length === 0 && (
                      <div className="h-full min-h-[320px] flex flex-col items-center justify-center text-center p-8 space-y-3">
                        <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl text-emerald-400 shadow-sm">
                          <MessageSquare className="h-6 w-6" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm text-slate-200 font-semibold">How can I help you with SFT Studio Pro?</p>
                          <p className="text-xs text-slate-500 max-w-md">
                            Ask about defining personas and system prompts, generating examples, doc conversion, quality audits, or exporting your dataset.
                          </p>
                        </div>
                      </div>
                    )}

                    {expertMessages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        {msg.role !== "user" && (
                          <div className="h-8 w-8 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center font-bold text-xs shrink-0 select-none shadow-sm">
                            <Sparkles className="h-4 w-4" />
                          </div>
                        )}

                        <div
                          className={`max-w-[82%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                            msg.role === "user"
                              ? "bg-emerald-600 text-white rounded-br-none shadow-sm font-sans"
                              : "bg-slate-900/60 border border-slate-800 text-slate-200 rounded-bl-none shadow-sm"
                          }`}
                        >
                          {msg.role === "user" ? (
                            <div className="whitespace-pre-wrap">{msg.content}</div>
                          ) : (
                            <div className="space-y-2">
                              {parseExpertMarkdown(msg.content).map((part, pIdx) => {
                                if (part.type === "code") {
                                  return (
                                    <div key={pIdx} className="my-2.5 rounded-lg overflow-hidden border border-slate-800">
                                      <div className="flex items-center justify-between bg-slate-950 px-3 py-1.5 border-b border-slate-800">
                                        <span className="text-[10px] font-mono font-bold uppercase text-slate-400">
                                          {part.language || "code"}
                                        </span>
                                        <CopyCodeButton text={part.content} />
                                      </div>
                                      <pre className="kk-code bg-slate-950/90 text-emerald-300 text-[11px] p-3 overflow-x-auto font-mono whitespace-pre custom-scrollbar">
                                        {part.content}
                                      </pre>
                                    </div>
                                  );
                                } else {
                                  return (
                                    <div key={pIdx} className="leading-relaxed">
                                      <RenderInlineExpertText text={part.content} />
                                    </div>
                                  );
                                }
                              })}
                            </div>
                          )}
                        </div>

                        {msg.role === "user" && (
                          <div className="h-8 w-8 rounded-xl bg-slate-800 text-slate-300 border border-slate-700 flex items-center justify-center font-bold text-xs shrink-0 select-none">
                            <User className="h-4 w-4" />
                          </div>
                        )}
                      </div>
                    ))}

                    {isExpertSending && (
                      <div className="flex gap-3 justify-start">
                        <div className="h-8 w-8 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center font-bold text-xs shrink-0 select-none animate-pulse">
                          <Sparkles className="h-4 w-4" />
                        </div>
                        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl rounded-bl-none px-4 py-3 text-xs text-slate-400 flex items-center gap-2 select-none">
                          <RefreshCw className="h-3.5 w-3.5 animate-spin text-emerald-400 shrink-0" />
                          <span>Assistant is thinking...</span>
                        </div>
                      </div>
                    )}
                    <div ref={chatMessagesEndRef} />
                  </div>

                  {/* Suggestion Chips */}
                  <div className="px-6 py-2.5 border-t border-slate-800/60 bg-slate-950/60 flex items-center gap-2 overflow-x-auto no-scrollbar">
                    <span className="text-[11px] font-medium text-slate-400 shrink-0">Quick help:</span>
                    {[
                      "How do I use SFT Studio Pro?",
                      "How does Quality Assessment work?",
                      "Which export format should I choose?",
                      "How to write good negative constraints?"
                    ].map((prompt, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleSendExpertMessage(prompt)}
                        disabled={isExpertSending}
                        className="text-[11px] text-slate-300 hover:text-emerald-300 bg-slate-900 hover:bg-slate-850 px-3 py-1.5 rounded-lg border border-slate-750 transition shrink-0 cursor-pointer disabled:opacity-50"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>

                  {/* Prominent, Obvious Prompt Box */}
                  <div className="p-4 sm:p-5 border-t-2 border-slate-700/80 bg-slate-900/80 shadow-2xl kk-composer">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleSendExpertMessage();
                      }}
                      className="flex items-center gap-3"
                    >
                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={expertInput}
                          onChange={(e) => setExpertInput(e.target.value)}
                          placeholder="Type your question or request here..."
                          disabled={isExpertSending}
                          className="w-full bg-slate-950 border-2 border-slate-600 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-400 outline-none transition shadow-inner"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={isExpertSending || !expertInput.trim()}
                        className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:!text-black disabled:border-slate-800 border border-emerald-400 !text-black font-extrabold rounded-xl transition flex items-center justify-center gap-2 shrink-0 cursor-pointer text-sm shadow-md"
                      >
                        <Send className="h-4 w-4 text-black" />
                        <span className="font-extrabold text-black">Send</span>
                      </button>
                    </form>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "trainer" && (
              <section className="mx-auto w-full max-w-5xl space-y-5 rounded-xl border border-slate-800/60 bg-slate-950/30 p-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-100">Automated Trainer</h2>
                  <p className="mt-1 text-sm text-slate-400">Review the project’s handoff settings, then open the trainer when you are ready. Training will not start automatically.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">Selected model</h3>
                    <p className="mt-2 text-sm font-bold text-slate-100">{trainerHandoff.model}</p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">Training template</h3>
                    <p className="mt-2 text-sm font-bold text-slate-100">{trainerHandoff.template}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRunTrainingModal(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-500/40 bg-blue-500/15 px-5 py-3 text-sm font-bold text-slate-100 transition hover:bg-blue-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Cpu className="h-4 w-4 text-blue-400" />
                  Open automated trainer
                </button>
                <PaymentGate apiFetch={projectApiFetch} planKey={trainingPlan[trainerHandoff.model]} />
              </section>
            )}

            {activeTab === "modelChat" && <ModelChatTab apiFetch={projectApiFetch} />}

          </AnimatePresence>
        </div>

        </div>
      </main>

      {/* SFT Example Edit Modal */}
      {editingExampleBatchId && editingExampleIndex !== null && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-2xl w-full space-y-4"
          >
            <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Edit3 className="h-4 w-4 text-green-400" />
                Edit Training Example #{editingExampleIndex + 1}
              </h3>
              <button 
                onClick={() => { setEditingExampleBatchId(null); setEditingExampleIndex(null); }}
                className="text-slate-500 hover:text-slate-300 text-sm font-mono"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
              {editingMessages.map((msg, idx) => (
                <div key={idx} className="space-y-1.5">
                  <span className={`text-[10px] font-mono font-bold uppercase ${
                    msg.role === "system" ? "text-slate-400" :
                    msg.role === "user" ? "text-blue-400" : "text-green-400"
                  }`}>
                    {msg.role} turn
                  </span>
                  
                  {msg.role === "assistant" && msg.reasoning !== undefined && (
                    <div className="space-y-1 my-2 pl-2 border-l border-slate-800">
                      <span className="text-[9px] text-amber-400 font-mono font-bold uppercase block">🧠 Reasoning trace (Thinking process):</span>
                      <textarea
                        value={safeRenderText(msg.reasoning)}
                        rows={2}
                        onChange={(e) => handleUpdateMessageReasoning(idx, e.target.value)}
                        className="w-full bg-slate-950/60 border border-slate-850 rounded-xl p-2 text-xs text-slate-400 font-mono outline-none focus:border-amber-500/50"
                      />
                    </div>
                  )}

                  <textarea
                    value={safeRenderText(msg.content)}
                    rows={3}
                    onChange={(e) => handleUpdateMessageContent(idx, e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 focus:border-green-500 outline-none font-sans leading-relaxed"
                  />
                </div>
              ))}
            </div>

            <div className="border-t border-slate-800 pt-4 flex justify-end gap-3">
              <button
                onClick={() => { setEditingExampleBatchId(null); setEditingExampleIndex(null); }}
                className="px-4 py-2 rounded-xl bg-slate-950 hover:bg-slate-900 border border-slate-850 text-xs text-slate-400"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEditedExample}
                className="px-4 py-2 rounded-xl kk-primary text-xs font-bold"
              >
                Save Changes
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Subscription & Student Codes Modal */}
      {showBillingModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-xl w-full space-y-5 shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar"
          >
            {/* Modal Header */}
            <div className="border-b border-slate-800 pb-3.5 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles className="h-4.5 w-4.5 text-green-400 animate-pulse" />
                Plan & Student Code Manager
              </h3>
              <button 
                onClick={() => { setShowBillingModal(false); }}
                className="text-slate-500 hover:text-slate-300 text-sm font-mono cursor-pointer"
              >
                ✕
              </button>
            </div>

            {!currentUser ? (
              /* Awaiting Login State */
              <div className="space-y-4 text-center py-6">
                <div className="mx-auto h-12 w-12 rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center">
                  <Lock className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-200">Authentication Required</h4>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                    Please log in or register a free account in the top bar of SFT Studio Pro to unlock subscriptions, student class codes, and limits.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowBillingModal(false);
                    setIsGuestMode(false);
                  }}
                  className="px-4 py-2 kk-primary rounded-xl font-bold text-xs transition cursor-pointer select-none"
                >
                  Sign In / Register
                </button>
              </div>
            ) : (
              /* Authenticated Billing Panel */
              <div className="space-y-4">
                {/* Usage Status Overview */}
                <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <span className="text-[10px] font-mono text-slate-500 font-bold uppercase tracking-wider block">Account status</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-100">{userProfile?.subscriptionStatus || "Free"} Access</span>
                      <span className="text-xs text-slate-400">
                        {userProfile?.subscriptionStatus === "Owner" 
                          ? "(Unlimited generations)" 
                          : `(${userProfile?.limit || 5000} generations cap)`}
                      </span>
                    </div>
                  </div>
                  <div className="w-full md:w-48">
                    <div className="flex justify-between text-[10px] mb-1 font-mono text-slate-400">
                      <span>Account Total Usage:</span>
                      <span className="font-bold">
                        {userProfile?.subscriptionStatus === "Owner"
                          ? `${accountTotalGenerations} / Unlimited`
                          : `${accountTotalGenerations} / ${(userProfile?.limit || 5000).toLocaleString()}`}
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800/60">
                      <div 
                        className={`h-full rounded-full transition-all duration-300 ${
                          userProfile?.subscriptionStatus === "Owner" ? "bg-amber-500" : "bg-green-500"
                        }`}
                        style={{ 
                          width: `${userProfile?.subscriptionStatus === "Owner" 
                            ? 100 
                            : Math.min(100, (accountTotalGenerations / (userProfile?.limit || 5000)) * 100)}%` 
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Tab Selector */}
                <div className="flex border-b border-slate-800">
                  <button
                    onClick={() => setActiveBillingTab("redeem")}
                    className={`flex-1 pb-2.5 text-xs font-bold tracking-wider uppercase transition-all ${
                      activeBillingTab === "redeem"
                        ? "text-green-400 border-b-2 border-green-500"
                        : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    Codes & Custom Packages
                  </button>
                  <button
                    onClick={() => {
                      setActiveBillingTab("teacher");
                      if (isTeacherVerified) {
                        loadTeacherCodes();
                      }
                    }}
                    className={`flex-1 pb-2.5 text-xs font-bold tracking-wider uppercase transition-all ${
                      activeBillingTab === "teacher"
                        ? "text-green-400 border-b-2 border-green-500"
                        : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    🎓 Teacher Portal
                  </button>
                </div>

                {activeBillingTab === "redeem" ? (
                  /* REDEEM & CUSTOM PACKAGE SECTION */
                  <div className="space-y-5 pt-1.5">
                    
                    {/* Student redemption sub-card */}
                    <div className="space-y-2.5 bg-slate-950/20 border border-slate-800 p-4 rounded-xl">
                      <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                        <Check className="h-3.5 w-3.5 text-purple-400" />
                        Student Class Code Redemption
                      </h4>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Are you currently enrolled in one of our university fine-tuning courses? Redeem your instructor code to unlock <span className="font-bold text-slate-200">5000 generations free</span> instantly.
                      </p>
                      
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={studentCodeInput}
                          onChange={(e) => setStudentCodeInput(e.target.value)}
                          placeholder="ENTER COURSE CODE (E.G. COURSE-SFT101)"
                          disabled={isRedeemingCode}
                          className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 outline-none uppercase font-mono tracking-widest focus:border-green-500/50"
                        />
                        <button
                          onClick={handleRedeemStudentCode}
                          disabled={isRedeemingCode || !studentCodeInput.trim()}
                          className="px-4 py-2 kk-primary rounded-xl font-bold text-xs transition cursor-pointer select-none disabled:opacity-40"
                        >
                          {isRedeemingCode ? "Verifying..." : "Redeem"}
                        </button>
                      </div>
                      
                      <div className="text-[9px] text-slate-500 bg-slate-950/40 p-2 rounded-lg leading-normal">
                        ⚠️ **Notice**: Student codes permit exactly 10 global redemptions across class groups before becoming void, and are strictly restricted to 1 redemption per user.
                      </div>
                    </div>

                    {/* Custom Agency Package sub-card */}
                    <div className="bg-gradient-to-tr from-slate-950 to-slate-900 border border-emerald-500/30 p-4 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div className="space-y-1">
                        <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1">
                          <Sparkles className="h-3 w-3 text-emerald-400" /> Custom Packages
                        </span>
                        <h4 className="text-xs font-bold text-slate-200">Scale Beyond 1,000 Generations</h4>
                        <p className="text-[11px] text-slate-400 max-w-xs leading-relaxed">
                          Build a custom package for high-volume datasets, private generation services, or bespoke TRiAD alignment directly with Triad AI Agency.
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <a
                          href="https://triadai.agency"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-lg transition cursor-pointer select-none flex items-center gap-1.5 shadow-lg shadow-emerald-500/10"
                        >
                          <span>Build Custom Package</span>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </div>

                  </div>
                ) : (
                  /* TEACHER PORTAL SECTION */
                  <div className="space-y-4 pt-1.5">
                    {!isTeacherVerified ? (
                      /* Portal Locked password state */
                      <div className="space-y-3.5 py-4">
                        <p className="text-xs text-slate-400 leading-normal text-center">
                          Please enter the instructor key to manage active student codes, review group redemptions, and monitor limits.
                        </p>
                        <div className="flex max-w-sm mx-auto gap-2">
                          <input
                            type="password"
                            value={teacherPassword}
                            onChange={(e) => setTeacherPassword(e.target.value)}
                            placeholder="Enter instructor key"
                            className="flex-1 px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white outline-none focus:border-green-500/50"
                          />
                          <button
                            onClick={() => {
                              if (teacherPassword === "sftclass2026") {
                                setIsTeacherVerified(true);
                                loadTeacherCodes();
                              } else {
                                setNotification({ text: "Incorrect instructor key. Please try again.", type: "error" });
                              }
                            }}
                            className="px-4 py-2 kk-primary rounded-xl font-bold text-xs transition cursor-pointer select-none"
                          >
                            Verify Key
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Portal Verified management state */
                      <div className="space-y-4">
                        {/* Create new code section */}
                        <div className="space-y-2 bg-slate-950/40 p-3 rounded-xl border border-slate-800/60">
                          <span className="text-[10px] font-mono text-purple-400 font-bold uppercase tracking-wider block">Generate New Student Code</span>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={newClassCodeName}
                              onChange={(e) => setNewClassCodeName(e.target.value)}
                              placeholder="E.G. COURSE-SFT303"
                              className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white outline-none uppercase font-mono tracking-wider focus:border-green-500/50"
                            />
                            <button
                              onClick={handleCreateClassCode}
                              disabled={isCreatingClassCode || !newClassCodeName.trim()}
                              className="px-3 py-1.5 bg-purple-500 hover:bg-purple-400 text-white rounded-lg text-xs font-bold transition cursor-pointer select-none disabled:opacity-40"
                            >
                              {isCreatingClassCode ? "Creating..." : "Create (10x Uses)"}
                            </button>
                          </div>
                        </div>

                        {/* List codes list */}
                        <div className="space-y-2">
                          <span className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider block">Active Student Groups</span>
                          
                          <div className="max-h-[220px] overflow-y-auto border border-slate-800 rounded-xl divide-y divide-slate-800 custom-scrollbar text-xs">
                            {teacherCodes.length === 0 ? (
                              <div className="p-4 text-center text-slate-500 text-xs font-mono">No class codes logged.</div>
                            ) : (
                              teacherCodes.map((item) => (
                                <div key={item.id} className="p-3 bg-slate-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                                  <div className="space-y-0.5">
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono font-bold text-purple-400 text-xs">{item.code}</span>
                                      <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                                        item.redemptionCount >= (item.maxRedemptions || 10)
                                          ? "bg-red-500/10 text-red-400 border border-red-500/10"
                                          : "bg-green-500/10 text-green-400 border border-green-500/10"
                                      }`}>
                                        {item.redemptionCount >= (item.maxRedemptions || 10) ? "VOID" : "ACTIVE"}
                                      </span>
                                    </div>
                                    <div className="text-[9px] text-slate-500">
                                      Created: {new Date(item.createdAt).toLocaleDateString()}
                                    </div>
                                  </div>
                                  <div className="text-right flex flex-col items-end gap-1 shrink-0">
                                    <div className="font-mono text-[11px] text-slate-300 font-semibold">
                                      Redeemed: <span className="text-slate-100">{item.redemptionCount}</span> / <span className="text-slate-500">{item.maxRedemptions || 10}</span>
                                    </div>
                                    {item.redeemedUserIds && item.redeemedUserIds.length > 0 && (
                                      <div className="text-[9px] text-slate-500 max-w-[180px] truncate" title={item.redeemedUserIds.join(", ")}>
                                        Users: {item.redeemedUserIds.map((u: string) => u.slice(0, 4) + "...").join(", ")}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            
            <div className="border-t border-slate-800 pt-3.5 flex justify-end">
              <button
                onClick={() => { setShowBillingModal(false); }}
                className="px-4 py-2 rounded-xl bg-slate-950 hover:bg-slate-900 border border-slate-850 text-xs font-semibold text-slate-400 cursor-pointer transition select-none"
              >
                Close Manager
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Rich Human-Made Supporting Footer */}
      <footer className="border-t border-slate-800/80 py-10 mt-16 bg-slate-950/60 text-slate-400">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 md:grid-cols-4 gap-8 text-xs">
          {/* Col 1: Brand */}
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <img src="/favicon.svg" alt="TRiADiC Emblem" className="h-7 w-7 rounded-lg border border-emerald-500/20 shrink-0" />
              <span className="font-bold text-white text-sm">TRiADiC Intelligence Labs</span>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed">
              Pioneering native model alignment (Freedom, Truth, Kindness) and open supervised fine-tuning dataset engineering tools.
            </p>
            <div className="text-[11px] text-slate-500">
              © 2026 TRiADiC Intelligence Labs. All rights reserved.
            </div>
          </div>

          {/* Col 2: Documentation */}
          <div className="space-y-2">
            <div className="font-bold text-white uppercase text-[11px] tracking-wider mb-2">Documentation & Standards</div>
            <ul className="space-y-1.5 text-slate-400">
              <li><button onClick={() => setShowDocsModal(true)} className="hover:text-emerald-400 transition cursor-pointer">DeepSeek R1 &lt;think&gt; Format</button></li>
              <li><button onClick={() => setShowDocsModal(true)} className="hover:text-emerald-400 transition cursor-pointer">OpenAI ChatML &amp; o1/o3 Schemas</button></li>
              <li><button onClick={() => setShowDocsModal(true)} className="hover:text-emerald-400 transition cursor-pointer">ShareGPT &amp; Alpaca Dataset Spec</button></li>
              <li><button onClick={() => setShowDocsModal(true)} className="hover:text-emerald-400 transition cursor-pointer">TRiAD Alignment Standard</button></li>
            </ul>
          </div>

          {/* Col 3: Pricing & Passcodes */}
          <div className="space-y-2">
            <div className="font-bold text-white uppercase text-[11px] tracking-wider mb-2">Plans & Passcodes</div>
            <ul className="space-y-1.5 text-slate-400">
              <li><button onClick={() => setShowCustomPackageModal(true)} className="hover:text-emerald-300 text-emerald-400 font-semibold transition cursor-pointer flex items-center gap-1"><HelpCircle className="h-3 w-3" />Contact Support</button></li>
              <li><button onClick={() => setShowCustomPackageModal(true)} className="hover:text-emerald-400 transition cursor-pointer">Free Tier (5,000 Generations)</button></li>
              <li><button onClick={() => { setShowBillingModal(true); setActiveBillingTab("redeem"); }} className="hover:text-purple-400 transition cursor-pointer">Student Class Code Passcode</button></li>
              <li><button onClick={() => { setShowBillingModal(true); setActiveBillingTab("teacher"); }} className="hover:text-purple-400 transition cursor-pointer">Teacher Instructor Portal</button></li>
              <li><button onClick={() => setShowCustomPackageModal(true)} className="hover:text-emerald-400 transition cursor-pointer">Custom Agency Packages</button></li>
            </ul>
          </div>

          {/* Col 4: Agency Services */}
          <div className="space-y-2">
            <div className="font-bold text-white uppercase text-[11px] tracking-wider mb-2">Agency Services</div>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              Need custom domain datasets, private fine-tuning pipelines, or bespoke AI alignment?
            </p>
            <a
              href="https://triadai.agency"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg font-bold text-xs transition mt-2 cursor-pointer"
            >
              Visit triadai.agency <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </footer>

      {/* Supporting Modals */}
      <AboutModal isOpen={showAboutModal} onClose={() => setShowAboutModal(false)} />
      <RunTrainingModal
        open={showRunTrainingModal}
        onClose={() => setShowRunTrainingModal(false)}
        exportFormat="chatml_token"
        trainingModel={trainerHandoff.model}
        onTrainingModelChange={model => setTrainerHandoff(current => ({ ...current, model }))}
        getSerializedSplits={() => ({
          training: compiledDataset.trainingSet.map(ex => formatExampleForExport(ex, "chatml_token")),
          validation: compiledDataset.validationSet.map(ex => formatExampleForExport(ex, "chatml_token")),
        })}
        apiFetch={projectApiFetch}
        notify={(text, type) => setNotification({ text, type })}
      />
      {showExamplePaygate && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 p-4">
        <div role="dialog" aria-modal="true" aria-label="Example allowance" className="w-full max-w-md rounded-xl bg-slate-950 p-4 border border-slate-700">
          <button type="button" onClick={() => setShowExamplePaygate(false)} className="mb-3 text-sm text-slate-300">Close</button>
          <PaymentGate apiFetch={projectApiFetch} planKey="usage_10k" />
        </div>
      </div>}
      <CustomPackageModal
        isOpen={showCustomPackageModal}
        onClose={() => setShowCustomPackageModal(false)}
        currentGenerations={accountTotalGenerations}
        limit={userProfile?.limit || 5000}
      />
      <PricingModal 
        isOpen={showPricingModal} 
        onClose={() => setShowPricingModal(false)} 
        onOpenTeacherPortal={() => {
          setShowBillingModal(true);
          setActiveBillingTab("teacher");
        }}
      />
      <DocsModal isOpen={showDocsModal} onClose={() => setShowDocsModal(false)} />
      <AccountModal
        isOpen={showAccountModal}
        onClose={() => setShowAccountModal(false)}
        currentUser={currentUser}
        userProfile={userProfile}
        accountTotalGenerations={accountTotalGenerations}
      />

      {/* File Access Modals for Upload and Export */}
      <FileAccessModal
        isOpen={showUploadAccessModal}
        type="upload"
        onAccept={handleAcceptUpload}
        onDecline={handleDeclineUpload}
      />
      <FileAccessModal
        isOpen={showExportAccessModal}
        type="export"
        onAccept={handleAcceptExport}
        onDecline={handleDeclineExport}
      />

      {/* Create New Project Modal */}
      {showNewProjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
                  <FolderPlus className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Create New SFT Project</h3>
                  <p className="text-xs text-slate-400">Initialize a fresh dataset workspace with custom formats & presets</p>
                </div>
              </div>
              <button
                onClick={() => setShowNewProjectModal(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 overflow-y-auto">
              {/* Project Name Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Project Name
                </label>
                <input
                  type="text"
                  value={newProjName}
                  onChange={(e) => setNewProjName(e.target.value)}
                  placeholder="e.g., Financial Q&A Assistant, Medical SFT Pipeline"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleConfirmCreateNewProject();
                    }
                  }}
                />
              </div>

              {/* Format Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Dataset Structure & Format
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setNewProjFormat(ProjectFormat.CONVERSATION)}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      newProjFormat === ProjectFormat.CONVERSATION
                        ? "bg-blue-600/15 border-blue-500 text-white"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                        <MessageSquare className="h-3.5 w-3.5 text-blue-400" />
                        Conversation
                      </span>
                      {newProjFormat === ProjectFormat.CONVERSATION && <Check className="h-3.5 w-3.5 text-blue-400" />}
                    </div>
                    <p className="text-[11px] text-slate-400">Single & Multi-Turn chats with reasoning</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewProjFormat(ProjectFormat.INSTRUCTION)}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      newProjFormat === ProjectFormat.INSTRUCTION
                        ? "bg-purple-600/15 border-purple-500 text-white"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                        <Code className="h-3.5 w-3.5 text-purple-400" />
                        Instruction
                      </span>
                      {newProjFormat === ProjectFormat.INSTRUCTION && <Check className="h-3.5 w-3.5 text-purple-400" />}
                    </div>
                    <p className="text-[11px] text-slate-400">Locked to strict instruct template schema</p>
                  </button>
                </div>
              </div>

              {/* If Instruction format, choose template */}
              {newProjFormat === ProjectFormat.INSTRUCTION && (
                <div className="p-3 bg-purple-950/20 border border-purple-800/30 rounded-xl space-y-2">
                  <label className="block text-xs font-semibold text-purple-300">
                    Instruct Template Schema
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: InstructTemplate.CHATML, name: "ChatML", desc: "<|im_start|> tags" },
                      { id: InstructTemplate.ALPACA, name: "Alpaca", desc: "### Instruction:" },
                      { id: InstructTemplate.MISTRAL, name: "Mistral", desc: "[INST] tags" }
                    ].map((tmpl) => (
                      <button
                        key={tmpl.id}
                        type="button"
                        onClick={() => setNewProjInstructTemplate(tmpl.id)}
                        className={`p-2 rounded-lg border text-left transition cursor-pointer ${
                          newProjInstructTemplate === tmpl.id
                            ? "bg-purple-600/30 border-purple-400 text-white font-bold"
                            : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                        }`}
                      >
                        <div className="text-xs text-slate-200 font-semibold">{tmpl.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">{tmpl.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Preset Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Starting Assistant Preset
                </label>
                <select
                  value={newProjPreset}
                  onChange={(e) => setNewProjPreset(e.target.value as PresetType)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  {Object.entries(PROJECT_PRESETS).map(([key, preset]) => (
                    <option key={key} value={key} className="bg-slate-950 text-slate-200">
                      {preset.name} - {preset.targetTask.slice(0, 45)}...
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/50 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowNewProjectModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmCreateNewProject}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs rounded-xl shadow-md shadow-emerald-500/20 transition cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>Create & Open Project</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Delete Project Confirmation Modal */}
      {projectToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="w-full max-w-md bg-slate-900 border border-red-900/40 rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Delete SFT Project</h3>
                  <p className="text-xs text-slate-400">This action cannot be undone.</p>
                </div>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Are you sure you want to permanently delete project{" "}
                <span className="text-white font-bold">
                  "{userProjects.find(p => p.id === projectToDelete)?.name || "this project"}"
                </span>
                ? All associated dataset batches and configurations will be removed.
              </p>
            </div>
            <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/50 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setProjectToDelete(null)}
                className="px-3.5 py-1.5 text-xs font-medium text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleConfirmDeleteProject(projectToDelete)}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-lg shadow-md shadow-red-600/20 transition cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete Project</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {activeResourcePage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="resource-page-title"
          className="fixed inset-0 z-[70] flex bg-slate-950/90 p-2 sm:p-5"
        >
          <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
              <h2 id="resource-page-title" className="text-sm font-semibold text-slate-100 sm:text-base">
                {activeResourcePage.title}
              </h2>
              <div className="flex items-center gap-2">
                <a
                  data-testid="link-open-resource-new-tab"
                  href={activeResourcePage.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
                >
                  Open in new tab
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
                <button
                  type="button"
                  data-testid="button-close-resource-page"
                  aria-label={`Close ${activeResourcePage.title}`}
                  onClick={() => setActiveResourcePage(null)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:border-violet-400/60 hover:bg-slate-800"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                  Close
                </button>
              </div>
            </div>
            <iframe
              key={activeResourcePage.id}
              title={activeResourcePage.title}
              src={activeResourcePage.url}
              referrerPolicy="no-referrer"
              sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
              className="min-h-0 flex-1 border-0 bg-white"
            />
          </div>
        </div>
      )}

      {["define", "synthesizer", "convert", "triad", "assess"].includes(activeTab) && (
        <div className="fixed bottom-24 right-0 z-40">
          <button
            type="button"
            onClick={() => {
              const nextTab = activeTab === "define" ? "synthesizer" : activeTab === "synthesizer" ? "convert" : activeTab === "convert" ? "triad" : activeTab === "triad" ? "assess" : "registry";
              const nextTabRequiresProject = nextTab === "convert" || nextTab === "triad" || nextTab === "assess" || nextTab === "registry";
              if (nextTabRequiresProject && !selectedProjectId) {
                setNotification({ text: "Please enter your SFT Project Name and click 'Save Work' to unlock the rest of SFT Studio.", type: "error" });
                return;
              }
              setActiveTab(nextTab);
              setIsMobileNavOpen(false);
            }}
            aria-label="Next page"
            title="Next page"
            className="flex h-11 w-9 items-center justify-center rounded-l-xl border border-r-0 border-amber-300 bg-amber-400 text-slate-950 shadow-xl shadow-amber-400/20 transition-colors hover:bg-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
          >
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Floating App Support Button (hidden when on App Support tab) */}
      {activeTab !== "expert" && (
        <div className="fixed bottom-6 right-6 z-40 flex items-center">
          <button
            id="floating-expert-trigger"
            onClick={() => setActiveTab("expert")}
            title="Open App Support"
            className="flex items-center justify-center p-3.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 border border-emerald-400 shadow-xl shadow-emerald-500/10 hover:shadow-emerald-500/25 transition-all duration-200 select-none cursor-pointer rounded-full"
          >
            <MessageSquare className="h-5.5 w-5.5 shrink-0" />
          </button>
        </div>
      )}
    </div>
  );
}
