import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, HelpCircle, LoaderCircle, MessageSquare, Send } from "lucide-react";
import { InstructTemplate, PresetType, ProjectFormat, ProjectSettings, TemplateType } from "../types";

type Step =
  | "name" | "goal" | "goal-followup" | "constraints" | "model" | "voice-choice" | "voice-description"
  | "voice-own" | "voice-review" | "golden-review" | "system-choice" | "system-review"
  | "batch-skills" | "batch-recommendations";

type TrainingModel = "Qwen3.5 9 Base" | "Qwen3.5 4B Base" | "Mistral3.1 70B";
export interface BatchRecommendation {
  name: string;
  reason: string;
}

const TRAINING_MODELS: { value: TrainingModel; recommended?: boolean }[] = [
  { value: "Qwen3.5 9 Base", recommended: true },
  { value: "Qwen3.5 4B Base" },
  { value: "Mistral3.1 70B" },
];

interface Props {
  onComplete: (settings: ProjectSettings, recommendations?: BatchRecommendation[]) => void;
}

const PROMPTS: Record<Step, string> = {
  name: "What would you like to call this SFT project?",
  goal: "What should the model learn to do? Describe its main task and who it is for.",
  "goal-followup": "A quick follow-up so I can understand the target clearly:",
  constraints: "What rules should the model always follow, or what should it avoid? You can say “none.”",
  model: "Which base model will you train? I’ll automatically choose Instruct ChatML for any of these models, so there is no separate format or template question.",
  "voice-choice": "Next, let's define the desired voice. Would you like to write a couple of paragraphs yourself, or have me draft a sample for you to review?",
  "voice-description": "Describe the voice you want—such as its tone, vocabulary, and level of formality. I’ll draft a couple of paragraphs for your approval.",
  "voice-own": "Write a couple of paragraphs in the voice you want the model to use.",
  "voice-review": "Review the voice sample below. Edit it if needed, then explicitly approve it before I create the golden example.",
  "golden-review": "I created one golden training example using the approved voice. Review and edit both parts; approve it to continue.",
  "system-choice": "The system prompt is included in every generated training example. It sets the model’s role and instructions, so it directly shapes every example. Would you like to write it or have me draft one?",
  "system-review": "Review the full system prompt below. Edit it if you want, then explicitly approve it. It will be saved to the project and included in every generated example.",
  "batch-skills": "The batch generator creates training examples from your project settings for review. What special skills or abilities should this AI have? I’ll use your answer and project goal to recommend batches. Red Teaming and Adversarial are always included.",
  "batch-recommendations": "Here are my recommended batches based on your project and the skills you described. Red Teaming and Adversarial are included to help test safety against attacks and bad actors.",
};

async function requestDraft(instruction: string, appContext: Record<string, unknown>) {
  const response = await fetch("/api/expert-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: instruction }],
      appContext: { ...appContext, mode: "project-onboarding" },
    }),
  });
  const data = await response.json();
  if (!response.ok || !data.text) throw new Error(data.error || "The AI draft could not be generated.");
  return String(data.text).trim();
}

function parseGoldenExample(raw: string) {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed.userPrompt && parsed.assistantResponse) {
      return { prompt: String(parsed.userPrompt), completion: String(parsed.assistantResponse) };
    }
    const messages = parsed.examples?.[0]?.messages ?? parsed.messages;
    if (Array.isArray(messages)) {
      const user = messages.find((message: { role?: string }) => message.role === "user");
      const assistant = messages.find((message: { role?: string }) => message.role === "assistant");
      if (typeof user?.content === "string" && typeof assistant?.content === "string") {
        return { prompt: user.content, completion: assistant.content };
      }
    }
  } catch { /* Reject non-JSON drafts rather than placing the whole response in one field. */ }
  return null;
}

function countSentences(text: string) {
  return text.trim().match(/[.!?](?=["'”’)\]]*(?:\s|$))/g)?.length ?? (text.trim() ? 1 : 0);
}

function parseBatchRecommendations(raw: string): BatchRecommendation[] | null {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed.batches)) return null;
    const recommendations = parsed.batches
      .filter((item: any) => typeof item?.name === "string" && item.name.trim())
      .map((item: any) => ({
        name: item.name.trim(),
        reason: typeof item.reason === "string" ? item.reason.trim() : "",
      }))
      .slice(0, 6);
    if (!recommendations.length) return null;
    const ensure = (name: string, reason: string) => {
      const existing = recommendations.find(item => item.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        existing.name = name;
        existing.reason = reason;
      } else {
        recommendations.push({ name, reason });
      }
    };
    ensure("Red Teaming", "Test the model against adversarial prompts and unsafe requests.");
    ensure("Adversarial", "Probe for attacks, manipulation, and other bad-faith inputs.");
    return recommendations;
  } catch {
    return null;
  }
}

export function ProjectOnboarding({ onComplete }: Props) {
  const [step, setStep] = useState<Step>("name");
  const [projectName, setProjectName] = useState("");
  const [goal, setGoal] = useState("");
  const [goalFollowupAnswer, setGoalFollowupAnswer] = useState("");
  const [adaptiveQuestion, setAdaptiveQuestion] = useState("");
  const [constraints, setConstraints] = useState("");
  const [trainingModel, setTrainingModel] = useState<TrainingModel>("Qwen3.5 9 Base");
  const [voiceDescription, setVoiceDescription] = useState("");
  const [voiceSample, setVoiceSample] = useState("");
  const [voiceSource, setVoiceSource] = useState<"own" | "ai">("own");
  const [goldenPrompt, setGoldenPrompt] = useState("");
  const [goldenCompletion, setGoldenCompletion] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [systemPromptSource, setSystemPromptSource] = useState<"own" | "ai" | null>(null);
  const [specialSkills, setSpecialSkills] = useState("");
  const [batchRecommendations, setBatchRecommendations] = useState<BatchRecommendation[]>([]);
  const [error, setError] = useState("");
  const [assistantReply, setAssistantReply] = useState("");
  const [pending, setPending] = useState(false);
  const stepOrder: Step[] = ["name", "goal", "goal-followup", "constraints", "model", "voice-choice", "voice-description", "voice-own", "voice-review", "golden-review", "system-choice", "system-review", "batch-skills", "batch-recommendations"];
  const currentStepPosition = stepOrder.indexOf(step);
  const priorAnswers = [
    { step: "name" as Step, label: "Project name", answer: projectName },
    { step: "goal" as Step, label: "Target goal", answer: goal },
    { step: "constraints" as Step, label: "Rules and constraints", answer: constraints || "None" },
    ...(currentStepPosition > stepOrder.indexOf("model") ? [{ step: "model" as Step, label: "Base model", answer: trainingModel }] : []),
    ...(currentStepPosition > stepOrder.indexOf("batch-skills") ? [{ step: "batch-skills" as Step, label: "Special skills and abilities", answer: specialSkills || "None specified" }] : []),
    ...(currentStepPosition > stepOrder.indexOf("voice-review") && voiceSample
      ? [{ step: "voice-review" as Step, label: "Approved voice reference", answer: voiceSample }]
      : []),
    ...(currentStepPosition > stepOrder.indexOf("golden-review") && goldenPrompt && goldenCompletion
      ? [{ step: "golden-review" as Step, label: "Approved golden example", answer: `${goldenPrompt}\n\n${goldenCompletion}` }]
      : []),
  ].filter(item => stepOrder.indexOf(item.step) < currentStepPosition);

  const askAI = async (instruction: string) => {
    setPending(true);
    setError("");
    setAssistantReply("");
    try {
      return await requestDraft(instruction, {
        purpose: "SFT project onboarding",
        projectName,
        targetTask: goal,
        constraints,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The AI request failed. Please try again.");
      return "";
    } finally {
      setPending(false);
    }
  };

  const explainCurrentQuestion = async () => {
    const explanation = await askAI(
      `Explain this onboarding question in plain everyday language. Then give one brief example of the kind of answer the user could provide, without answering for them. ` +
      `Question: ${PROMPTS[step]}\nProject goal so far: ${goal || "not answered yet"}\nConstraints so far: ${constraints || "not answered yet"}`
    );
    setAssistantReply(explanation);
  };

  const goBack = () => {
    const previous: Partial<Record<Step, Step>> = {
      goal: "name", "goal-followup": "goal", constraints: "goal", model: "constraints",
      "voice-choice": "model", "voice-description": "voice-choice",
      "voice-own": "voice-choice", "voice-review": voiceSource === "ai" ? "voice-description" : "voice-own",
      "golden-review": "voice-review", "system-choice": "golden-review",
      "system-review": "system-choice", "batch-skills": "system-review", "batch-recommendations": "batch-skills",
    };
    setError("");
    if (previous[step]) setStep(previous[step]!);
  };

  const approveVoice = async () => {
    const draft = await askAI(
      `Create exactly one high-quality SFT example as valid JSON with only these two string keys: "userPrompt" and "assistantResponse". ` +
      `The example must serve this model goal: ${goal}. Follow this approved voice reference closely:\n${voiceSample}\n` +
      `Respect these constraints: ${constraints || "none"}. Do not include markdown or commentary.`
    );
    if (!draft) return;
    const example = parseGoldenExample(draft);
    if (!example?.prompt.trim() || !example.completion.trim()) {
      setError("The AI response did not separate the user prompt and assistant response. Please try generating the golden example again.");
      return;
    }
    setGoldenPrompt(example.prompt);
    setGoldenCompletion(example.completion);
    setStep("golden-review");
  };

  const approveGolden = () => setStep("system-choice");

  const finish = () => {
    const voiceConstraint = `Approved voice reference (${voiceSource === "ai" ? "AI draft approved by user" : "user supplied"}):\n${voiceSample}`;
    const mergedConstraints = [constraints.trim(), voiceConstraint].filter(Boolean).join("\n\n");
    onComplete({
      name: projectName.trim(),
      systemPrompt: systemPrompt.trim(),
      targetTask: goal.trim(),
      constraints: mergedConstraints,
      selectedPreset: PresetType.CUSTOM,
      projectFormat: ProjectFormat.INSTRUCTION,
      templateType: TemplateType.INSTRUCTION_TEMPLATE,
      instructTemplate: InstructTemplate.CHATML,
      customInstructionFormat: "### Instruction:\n{instruction}\n\n### Input:\n{input}\n\n### Response:\n{response}",
      representativePrompt: goldenPrompt.trim(),
      representativeCompletion: goldenCompletion.trim(),
    }, batchRecommendations);
  };

  const generateBatchRecommendations = async () => {
    const draft = await askAI(
      `Analyze this SFT project and recommend 4 to 6 useful training batches based on its use case, goal, constraints, and the AI's special skills. ` +
      `Always include batches named exactly "Red Teaming" and "Adversarial", with reasons about testing safety against attacks and bad actors. ` +
      `Return only valid JSON in this shape: {"batches":[{"name":"...","reason":"..."}]}. ` +
      `Project goal: ${goal}\nConstraints: ${constraints || "none"}\nSpecial skills and abilities: ${specialSkills.trim() || "none specified"}`
    );
    if (!draft) return;
    const recommendations = parseBatchRecommendations(draft);
    if (!recommendations) {
      setError("The AI response did not contain a valid batch recommendation list. Please try again.");
      return;
    }
    setBatchRecommendations(recommendations);
    setStep("batch-recommendations");
  };

  const skipToProject = () => {
    onComplete({
      name: "General Instruction Tuner",
      systemPrompt: "You are a helpful, respectful, and honest AI assistant. Always answer queries as accurately and safely as possible, providing clear and direct explanations.",
      targetTask: "Instruction following, educational explanations, summaries, and general QA.",
      constraints: "Maintain a helpful and educational tone. Avoid speculative claims. Keep answers concise, factual, and fully self-contained.",
      selectedPreset: PresetType.GENERAL_USE,
      projectFormat: ProjectFormat.CONVERSATION,
      templateType: TemplateType.SINGLE_TURN,
      instructTemplate: InstructTemplate.CHATML,
      customInstructionFormat: "### Instruction:\n{instruction}\n\n### Input:\n{input}\n\n### Response:\n{response}",
      representativePrompt: "Explain photosynthesis in simple terms.",
      representativeCompletion: "Photosynthesis is the process where plants use sunlight, water, and carbon dioxide to create oxygen and energy in the form of sugar.",
    });
  };

  const submit = async () => {
    setError("");
    if (step === "name" && projectName.trim()) return setStep("goal");
    if (step === "goal" && goal.trim()) {
      const followup = await askAI(
        `Assess whether this project goal is specific enough to create a useful SFT dataset. ` +
        `If it is specific, respond with exactly DONE. If one essential detail is missing, ask exactly one short, plain-language follow-up question. ` +
        `Do not answer the question or include anything else.\nGoal: ${goal}`
      );
      if (!followup) return;
      if (followup.trim().toUpperCase().startsWith("DONE")) setStep("constraints");
      else {
        setAdaptiveQuestion(followup);
        setStep("goal-followup");
      }
      return;
    }
    if (step === "goal-followup" && goalFollowupAnswer.trim()) {
      setGoal(prev => `${prev.trim()}\n\nAdditional detail: ${goalFollowupAnswer.trim()}`);
      setStep("constraints");
      return;
    }
    if (step === "constraints") return setStep("model");
    if (step === "voice-description" && voiceDescription.trim()) {
      const sample = await askAI(
        `Write exactly two short paragraphs as a sample of the desired assistant voice. Voice description: ${voiceDescription}. ` +
        `The assistant's task is: ${goal}. Constraints: ${constraints || "none"}. Return only the two paragraphs.`
      );
      if (sample) {
        setVoiceSample(sample);
        setVoiceSource("ai");
        setStep("voice-review");
      }
      return;
    }
    if (step === "voice-own" && voiceSample.trim()) {
      if (voiceSample.trim().split(/\n\s*\n/).filter(Boolean).length < 2) {
        setError("Please include two paragraphs, separated by a blank line, so the voice sample gives a clear reference.");
        return;
      }
      setVoiceSource("own");
      setStep("voice-review");
      return;
    }
    if (step === "batch-skills") return generateBatchRecommendations();
    setError("Please add an answer before continuing.");
  };

  const generateSystemPrompt = async () => {
    const draft = await askAI(
      `Draft a clear system prompt for this SFT project in no more than five sentences. Target task: ${goal}. Constraints: ${constraints || "none"}. ` +
      `Use this approved voice reference:\n${voiceSample}\n` +
      `Example user prompt: ${goldenPrompt}\nExample assistant response: ${goldenCompletion}\n` +
      `Return only the complete system prompt, with no introduction or commentary. It must contain at most five sentences.`
    );
    if (draft) {
      if (countSentences(draft) > 5) {
        setError("The generated system prompt exceeded five sentences. Please generate it again.");
        return;
      }
      setSystemPrompt(draft);
      setSystemPromptSource("ai");
      setStep("system-review");
    }
  };

  const textareaClass = "w-full resize-y bg-slate-950 border border-slate-700 px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:border-purple-400 focus:outline-none";
  const buttonClass = "inline-flex items-center justify-center gap-2 border border-purple-500 bg-purple-300 px-4 py-2.5 text-sm font-bold !text-[#000000] transition hover:bg-purple-200 disabled:cursor-not-allowed disabled:opacity-50";

  return (
      <main className="min-h-screen bg-slate-900 px-4 py-8 text-white sm:py-12">
      <section className="mx-auto flex min-h-[min(760px,calc(100vh-4rem))] w-full max-w-3xl flex-col border border-slate-700 bg-slate-950 shadow-2xl">
        <header className="border-b border-slate-700 bg-slate-900 px-5 py-4 sm:px-7">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-5 w-5 text-purple-300" />
            <div>
              <h1 className="text-lg font-bold text-slate-100">SFT Studio Pro</h1>
              <p className="text-sm text-slate-200">Project setup</p>
            </div>
          </div>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-6 sm:px-7" aria-live="polite">
          {priorAnswers.map(item => (
            <div key={item.step} className="flex justify-end">
              <div className="max-w-[90%] border border-purple-500 bg-purple-300 px-4 py-3 text-sm leading-relaxed font-bold !text-[#000000]">
                <p className="mb-1 text-xs font-bold !text-[#000000]">{item.label}</p>
                <p className="whitespace-pre-wrap">{item.answer}</p>
              <button type="button" className="mt-2 text-xs font-bold !text-[#000000] underline underline-offset-2 hover:!text-[#222222]" onClick={() => setStep(item.step)}>
                  Edit answer
                </button>
              </div>
            </div>
          ))}

          <div className="flex justify-start">
            <div className="max-w-[90%] border border-[#c4c4c4] bg-[#e5e5e5] px-4 py-3 text-sm leading-relaxed font-bold !text-[#000000]">
              <p>{step === "goal-followup" ? adaptiveQuestion : PROMPTS[step]}</p>
              {["name", "goal", "goal-followup", "constraints", "voice-description", "voice-own", "batch-skills"].includes(step) && (
                <button
                  type="button"
                  className="mt-3 inline-flex items-center gap-2 rounded-md border border-purple-500 bg-purple-300 px-3 py-2 text-sm font-bold !text-[#000000] shadow-sm transition-colors hover:bg-purple-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 disabled:opacity-70"
                  disabled={pending}
                  onClick={() => void explainCurrentQuestion()}
                >
                  <HelpCircle className="h-4 w-4 text-[#000000]" /> I’m not sure
                </button>
              )}
            </div>
          </div>

          {step === "model" && (
            <div role="radiogroup" aria-label="Base model to train" className="grid gap-3 sm:grid-cols-3">
              {TRAINING_MODELS.map(model => (
                <button
                  key={model.value}
                  type="button"
                  role="radio"
                  aria-checked={trainingModel === model.value}
                  onClick={() => setTrainingModel(model.value)}
                  className={`rounded-md border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-200 ${
                    trainingModel === model.value
                    ? "border-purple-500 bg-purple-300 !text-[#000000] font-bold"
                      : "border-slate-500 bg-slate-900 !text-white hover:border-purple-300 hover:bg-slate-800"
                  }`}
                >
                  <span className="flex items-start justify-between gap-2 font-bold !text-[#000000]">
                    {model.value}
                    {model.recommended && <span className="shrink-0 rounded bg-purple-200 px-2 py-0.5 text-xs font-bold !text-[#000000]">Recommended</span>}
                  </span>
                </button>
              ))}
            </div>
          )}

          {step === "voice-choice" && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={buttonClass} onClick={() => setStep("voice-own")}>I’ll write the sample</button>
              <button type="button" className={buttonClass} onClick={() => setStep("voice-description")}>Draft a sample for me</button>
            </div>
          )}

          {step === "system-choice" && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={buttonClass} onClick={() => { setSystemPromptSource("own"); setSystemPrompt(""); setStep("system-review"); }}>I’ll write the prompt</button>
              <button type="button" className={buttonClass} disabled={pending} onClick={generateSystemPrompt}>Draft a prompt for me</button>
            </div>
          )}

          {step === "voice-review" && (
            <textarea aria-label="Voice sample for review" className={textareaClass} rows={6} value={voiceSample} onChange={e => setVoiceSample(e.target.value)} />
          )}
          {step === "golden-review" && (
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-purple-300">Golden user prompt
                <textarea aria-label="Golden user prompt" className={`${textareaClass} mt-1`} rows={2} value={goldenPrompt} onChange={e => setGoldenPrompt(e.target.value)} />
              </label>
              <label className="block text-xs font-semibold text-purple-300">Golden assistant response
                <textarea aria-label="Golden assistant response" className={`${textareaClass} mt-1`} rows={5} value={goldenCompletion} onChange={e => setGoldenCompletion(e.target.value)} />
              </label>
            </div>
          )}
          {step === "system-review" && (
            <textarea aria-label="System prompt for review" className={textareaClass} rows={7} value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} placeholder="Write the complete system prompt that should be included in every training example." />
          )}
          {step === "batch-recommendations" && (
            <div className="space-y-3">
              {batchRecommendations.map(item => (
                <article key={item.name} className="border border-slate-600 bg-slate-900 px-4 py-3">
                  <h2 className="font-semibold text-white">{item.name}</h2>
                  <p className="mt-1 text-sm text-slate-200">{item.reason}</p>
                </article>
              ))}
            </div>
          )}
          {["name", "goal", "goal-followup", "constraints", "voice-description", "voice-own", "batch-skills"].includes(step) && (
            <div className="flex gap-2">
              <textarea
                autoFocus
                aria-label={step === "name" ? "Project name" : step === "batch-skills" ? "Special skills and abilities" : "Your answer"}
                className={textareaClass}
                rows={step === "name" ? 1 : 3}
                value={step === "name" ? projectName : step === "goal" ? goal : step === "goal-followup" ? goalFollowupAnswer : step === "constraints" ? constraints : step === "voice-description" ? voiceDescription : step === "batch-skills" ? specialSkills : voiceSample}
                onChange={e => {
                  if (step === "name") setProjectName(e.target.value);
                  else if (step === "goal") setGoal(e.target.value);
                  else if (step === "goal-followup") setGoalFollowupAnswer(e.target.value);
                  else if (step === "constraints") setConstraints(e.target.value);
                  else if (step === "voice-description") setVoiceDescription(e.target.value);
                  else if (step === "batch-skills") setSpecialSkills(e.target.value);
                  else setVoiceSample(e.target.value);
                }}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && step === "name") { e.preventDefault(); void submit(); } }}
                placeholder={step === "name" ? "Project name" : step === "batch-skills" ? "Describe the AI’s skills, or type “none”" : "Type your answer…"}
              />
              <button type="button" aria-label="Send answer" className={buttonClass} disabled={pending} onClick={() => void submit()}>
                {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          )}

          {error && <p role="alert" className="border border-[#c4c4c4] bg-[#e5e5e5] px-3 py-2 text-sm font-bold !text-[#000000]">{error}</p>}
          {assistantReply && <div className="flex justify-start"><div className="max-w-[90%] border border-[#c4c4c4] bg-[#e5e5e5] px-4 py-3 text-sm leading-relaxed font-bold !text-[#000000] whitespace-pre-wrap">{assistantReply}</div></div>}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-700 bg-slate-900 px-5 py-4 sm:px-7">
          <button type="button" className="inline-flex items-center gap-2 px-2 py-2 text-sm text-slate-200 hover:text-white disabled:opacity-50" onClick={goBack} disabled={step === "name" || pending}>
            <ArrowLeft className="h-4 w-4" /> Previous
          </button>
          <div className="flex flex-wrap gap-2">
            {step === "voice-review" && <button type="button" className={buttonClass} disabled={pending || !voiceSample.trim()} onClick={() => void approveVoice()}>{pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve voice sample</button>}
            {step === "golden-review" && <button type="button" className={buttonClass} disabled={!goldenPrompt.trim() || !goldenCompletion.trim()} onClick={approveGolden}><Check className="h-4 w-4" /> Approve golden example</button>}
            {step === "system-review" && <button type="button" className={buttonClass} disabled={!systemPrompt.trim()} onClick={() => {
              if (systemPromptSource === "ai" && countSentences(systemPrompt) > 5) {
                setError("An AI-generated system prompt must be no more than five sentences.");
                return;
              }
              setStep("batch-skills");
            }}><Check className="h-4 w-4" /> Approve prompt &amp; continue</button>}
            {["name", "goal", "constraints", "batch-skills"].includes(step) && <button type="button" className={buttonClass} disabled={pending} onClick={() => void submit()}><span>{step === "batch-skills" ? "Recommend batches" : "Continue"}</span>{pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}</button>}
            {step === "model" && <button type="button" className={buttonClass} onClick={() => setStep("voice-choice")}>Continue <ArrowRight className="h-4 w-4" /></button>}
            {step === "batch-recommendations" && <button type="button" className={buttonClass} onClick={finish}>Continue to batch generator <ArrowRight className="h-4 w-4" /></button>}
          </div>
        </footer>
      </section>
      <button
        type="button"
        onClick={skipToProject}
        className="fixed bottom-4 right-4 z-[60] rounded-md border border-purple-500 bg-purple-300 px-2.5 py-1.5 text-xs font-bold !text-[#000000] shadow-lg transition-colors hover:bg-purple-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
      >
        Skip to project
      </button>
    </main>
  );
}
