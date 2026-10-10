import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, HelpCircle, LoaderCircle, MessageSquare, Send } from "lucide-react";
import { InstructTemplate, PresetType, ProjectFormat, ProjectSettings, TemplateType } from "../types";

type Step =
  | "name" | "goal" | "goal-followup" | "constraints" | "format" | "template" | "voice-choice" | "voice-description"
  | "voice-own" | "voice-review" | "golden-review" | "system-choice" | "system-review";

interface Props {
  onComplete: (settings: ProjectSettings) => void;
}

const PROMPTS: Record<Step, string> = {
  name: "What would you like to call this SFT project?",
  goal: "What should the model learn to do? Describe its main task and who it is for.",
  "goal-followup": "A quick follow-up so I can understand the target clearly:",
  constraints: "What rules should the model always follow, or what should it avoid? You can say “none.”",
  format: "Which training format do you want? Conversation is standard chat messages; Instruction uses a prompt/response template.",
  template: "Which instruction template should the project use: ChatML, Alpaca, or Mistral?",
  "voice-choice": "Next, let's define the desired voice. Would you like to write a couple of paragraphs yourself, or have me draft a sample for you to review?",
  "voice-description": "Describe the voice you want—such as its tone, vocabulary, and level of formality. I’ll draft a couple of paragraphs for your approval.",
  "voice-own": "Write a couple of paragraphs in the voice you want the model to use.",
  "voice-review": "Review the voice sample below. Edit it if needed, then explicitly approve it before I create the golden example.",
  "golden-review": "I created one golden training example using the approved voice. Review and edit both parts; approve it to continue.",
  "system-choice": "The system prompt is included in every generated training example. It sets the model’s role and instructions, so it directly shapes every example. Would you like to write it or have me draft one?",
  "system-review": "Review the full system prompt below. Edit it if you want, then explicitly approve it. It will be saved to the project and included in every generated example.",
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
  } catch { /* Use a readable fallback if the assistant did not return JSON. */ }
  return { prompt: "", completion: raw.trim() };
}

export function ProjectOnboarding({ onComplete }: Props) {
  const [step, setStep] = useState<Step>("name");
  const [projectName, setProjectName] = useState("");
  const [goal, setGoal] = useState("");
  const [goalFollowupAnswer, setGoalFollowupAnswer] = useState("");
  const [adaptiveQuestion, setAdaptiveQuestion] = useState("");
  const [constraints, setConstraints] = useState("");
  const [format, setFormat] = useState<ProjectFormat>(ProjectFormat.CONVERSATION);
  const [instructionTemplate, setInstructionTemplate] = useState<InstructTemplate>(InstructTemplate.CHATML);
  const [voiceDescription, setVoiceDescription] = useState("");
  const [voiceSample, setVoiceSample] = useState("");
  const [voiceSource, setVoiceSource] = useState<"own" | "ai">("own");
  const [goldenPrompt, setGoldenPrompt] = useState("");
  const [goldenCompletion, setGoldenCompletion] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [error, setError] = useState("");
  const [assistantReply, setAssistantReply] = useState("");
  const [pending, setPending] = useState(false);
  const stepOrder: Step[] = ["name", "goal", "goal-followup", "constraints", "format", "template", "voice-choice", "voice-description", "voice-own", "voice-review", "golden-review", "system-choice", "system-review"];
  const currentStepPosition = stepOrder.indexOf(step);
  const priorAnswers = [
    { step: "name" as Step, label: "Project name", answer: projectName },
    { step: "goal" as Step, label: "Target goal", answer: goal },
    { step: "constraints" as Step, label: "Rules and constraints", answer: constraints || "None" },
    { step: "format" as Step, label: "Dataset format", answer: format },
    ...(format === ProjectFormat.INSTRUCTION ? [{ step: "template" as Step, label: "Instruction template", answer: instructionTemplate }] : []),
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
      goal: "name", "goal-followup": "goal", constraints: "goal", format: "constraints",
      template: "format", "voice-choice": format === ProjectFormat.INSTRUCTION ? "template" : "format", "voice-description": "voice-choice",
      "voice-own": "voice-choice", "voice-review": voiceSource === "ai" ? "voice-description" : "voice-own",
      "golden-review": "voice-review", "system-choice": "golden-review",
      "system-review": "system-choice",
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
    setGoldenPrompt(example.prompt || "A realistic user request that demonstrates the project's target task.");
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
      projectFormat: format,
      templateType: format === ProjectFormat.INSTRUCTION ? TemplateType.INSTRUCTION_TEMPLATE : TemplateType.SINGLE_TURN,
      instructTemplate: instructionTemplate,
      customInstructionFormat: "### Instruction:\n{instruction}\n\n### Input:\n{input}\n\n### Response:\n{response}",
      representativePrompt: goldenPrompt.trim(),
      representativeCompletion: goldenCompletion.trim(),
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
    if (step === "constraints") return setStep("format");
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
    if (step === "system-review" && systemPrompt.trim()) return finish();
    setError("Please add an answer before continuing.");
  };

  const generateSystemPrompt = async () => {
    const draft = await askAI(
      `Draft a clear, concise system prompt for this SFT project. Target task: ${goal}. Constraints: ${constraints || "none"}. ` +
      `Use this approved voice reference:\n${voiceSample}\n` +
      `Example user prompt: ${goldenPrompt}\nExample assistant response: ${goldenCompletion}\n` +
      `Return only the complete system prompt, with no introduction or commentary.`
    );
    if (draft) {
      setSystemPrompt(draft);
      setStep("system-review");
    }
  };

  const textareaClass = "w-full resize-y bg-slate-950 border border-slate-700 px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:border-purple-400 focus:outline-none";
  const buttonClass = "inline-flex items-center justify-center gap-2 border border-purple-400/40 bg-purple-900/40 px-4 py-2.5 text-sm font-semibold text-purple-200 transition hover:bg-purple-800/60 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <main className="min-h-screen bg-slate-900 px-4 py-8 text-slate-100 sm:py-12">
      <section className="mx-auto flex min-h-[min(760px,calc(100vh-4rem))] w-full max-w-3xl flex-col border border-slate-700 bg-slate-950 shadow-2xl">
        <header className="border-b border-slate-700 bg-slate-900/80 px-5 py-4 sm:px-7">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-5 w-5 text-purple-300" />
            <div>
              <h1 className="text-lg font-bold text-slate-100">SFT Studio Pro</h1>
              <p className="text-sm text-slate-400">Project setup</p>
            </div>
          </div>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-6 sm:px-7" aria-live="polite">
          {priorAnswers.map(item => (
            <div key={item.step} className="flex justify-end">
              <div className="max-w-[90%] border border-purple-500/40 bg-purple-950/30 px-4 py-3 text-sm leading-relaxed text-purple-100">
                <p className="mb-1 text-xs font-semibold text-purple-300">{item.label}</p>
                <p className="whitespace-pre-wrap">{item.answer}</p>
                <button type="button" className="mt-2 text-xs text-purple-300 underline underline-offset-2 hover:text-white" onClick={() => setStep(item.step)}>
                  Edit answer
                </button>
              </div>
            </div>
          ))}

          <div className="flex justify-start">
            <div className="max-w-[90%] border border-slate-700 bg-slate-900 px-4 py-3 text-sm leading-relaxed text-slate-200">
              <p>{step === "goal-followup" ? adaptiveQuestion : PROMPTS[step]}</p>
              {["name", "goal", "goal-followup", "constraints", "voice-description", "voice-own"].includes(step) && (
                <button
                  type="button"
                  className="mt-3 inline-flex items-center gap-1.5 text-xs text-purple-300 underline underline-offset-2 hover:text-purple-200"
                  disabled={pending}
                  onClick={() => void explainCurrentQuestion()}
                >
                  <HelpCircle className="h-3.5 w-3.5" /> I’m not sure
                </button>
              )}
            </div>
          </div>

          {step === "format" && (
            <div className="flex flex-wrap gap-2">
              {[ProjectFormat.CONVERSATION, ProjectFormat.INSTRUCTION].map(option => (
                <button key={option} type="button" onClick={() => setFormat(option)} className={`${buttonClass} ${format === option ? "border-purple-300 bg-purple-700/50 text-white" : ""}`}>
                  {format === option && <Check className="h-4 w-4" />}{option}
                </button>
              ))}
            </div>
          )}

          {step === "template" && (
            <div className="flex flex-wrap gap-2">
              {[InstructTemplate.CHATML, InstructTemplate.ALPACA, InstructTemplate.MISTRAL].map(option => (
                <button key={option} type="button" onClick={() => setInstructionTemplate(option)} className={`${buttonClass} ${instructionTemplate === option ? "border-purple-300 bg-purple-700/50 text-white" : ""}`}>
                  {instructionTemplate === option && <Check className="h-4 w-4" />}{option}
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
              <button type="button" className={buttonClass} onClick={() => { setSystemPrompt(""); setStep("system-review"); }}>I’ll write the prompt</button>
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
          {["name", "goal", "goal-followup", "constraints", "voice-description", "voice-own"].includes(step) && (
            <div className="flex gap-2">
              <textarea
                autoFocus
                aria-label={step === "name" ? "Project name" : "Your answer"}
                className={textareaClass}
                rows={step === "name" ? 1 : 3}
                value={step === "name" ? projectName : step === "goal" ? goal : step === "goal-followup" ? goalFollowupAnswer : step === "constraints" ? constraints : step === "voice-description" ? voiceDescription : voiceSample}
                onChange={e => {
                  if (step === "name") setProjectName(e.target.value);
                  else if (step === "goal") setGoal(e.target.value);
                  else if (step === "goal-followup") setGoalFollowupAnswer(e.target.value);
                  else if (step === "constraints") setConstraints(e.target.value);
                  else if (step === "voice-description") setVoiceDescription(e.target.value);
                  else setVoiceSample(e.target.value);
                }}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && step === "name") { e.preventDefault(); void submit(); } }}
                placeholder={step === "name" ? "Project name" : "Type your answer…"}
              />
              <button type="button" aria-label="Send answer" className={buttonClass} disabled={pending} onClick={() => void submit()}>
                {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          )}

          {error && <p role="alert" className="border border-purple-500/30 bg-purple-950/30 px-3 py-2 text-sm text-purple-200">{error}</p>}
          {assistantReply && <div className="flex justify-start"><div className="max-w-[90%] border border-purple-500/30 bg-purple-950/20 px-4 py-3 text-sm leading-relaxed text-purple-100 whitespace-pre-wrap">{assistantReply}</div></div>}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-700 bg-slate-900/70 px-5 py-4 sm:px-7">
          <button type="button" className="inline-flex items-center gap-2 px-2 py-2 text-sm text-slate-400 hover:text-slate-100 disabled:opacity-30" onClick={goBack} disabled={step === "name" || pending}>
            <ArrowLeft className="h-4 w-4" /> Previous
          </button>
          <div className="flex flex-wrap gap-2">
            {step === "voice-review" && <button type="button" className={buttonClass} disabled={pending || !voiceSample.trim()} onClick={() => void approveVoice()}>{pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve voice sample</button>}
            {step === "golden-review" && <button type="button" className={buttonClass} disabled={!goldenPrompt.trim() || !goldenCompletion.trim()} onClick={approveGolden}><Check className="h-4 w-4" /> Approve golden example</button>}
            {step === "system-review" && <button type="button" className={buttonClass} disabled={!systemPrompt.trim()} onClick={finish}><Check className="h-4 w-4" /> Approve prompt &amp; continue</button>}
            {["name", "goal", "constraints"].includes(step) && <button type="button" className={buttonClass} onClick={() => void submit()}><span>Continue</span><ArrowRight className="h-4 w-4" /></button>}
            {step === "format" && <button type="button" className={buttonClass} onClick={() => setStep(format === ProjectFormat.INSTRUCTION ? "template" : "voice-choice")}>Continue <ArrowRight className="h-4 w-4" /></button>}
            {step === "template" && <button type="button" className={buttonClass} onClick={() => setStep("voice-choice")}>Continue <ArrowRight className="h-4 w-4" /></button>}
          </div>
        </footer>
      </section>
    </main>
  );
}
