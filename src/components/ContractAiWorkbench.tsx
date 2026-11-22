import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  Download,
  FileImage,
  Loader2,
  MessageSquare,
  Play,
  RefreshCw,
  Send,
  Trash2,
  Upload,
  Volume2,
} from 'lucide-react';
import type {
  BillingCadence,
  ContractInputs,
  ContractTermMonths,
  ExtractedContractAnalysis,
  GeminiChatModel,
  ModelResult,
  PaymentTermsDays,
  ProposedScenarioPatch,
  RevRecMethod,
} from '../types/fpa';
import {
  BILLING_CADENCE_LABELS,
  PAYMENT_TERMS_LABELS,
  REV_REC_LABELS,
  buildExecutiveBriefingScript,
  formatCurrency,
} from '../lib/accountingEngine';

export type AiWorkbenchTab = 'chat' | 'scanner' | 'audio';

interface ContractAiWorkbenchProps {
  model: ModelResult;
  activeTab: AiWorkbenchTab;
  onTabChange: (tab: AiWorkbenchTab) => void;
  onApplyScenarioPatch: (patch: ProposedScenarioPatch) => void;
}

const CHAT_MODELS: Array<{
  id: GeminiChatModel;
  label: string;
  desc: string;
}> = [
  { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen', desc: 'General FP&A' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', desc: 'Fast Q&A' },
  { id: 'gemini-4-neon', label: 'Gemini 4 Neon', desc: 'Complex Modeling' },
  { id: 'gemini-4-carbon', label: 'Gemini 4 Carbon', desc: 'Deep Audit Reasoning' },
];

const QUICK_PROMPTS = [
  'Model a 36-month $240k deal with 10% annual escalator, quarterly billing, Net 60',
  'Why is there a timing gap between Billings, Cash, and GAAP Revenue here?',
  'How would switching from Annual Upfront to Monthly billing impact peak Deferred Revenue?',
  'Walk through the ASC 606 balance sheet roll-forward for Month 1 and Month 12',
];

const TTS_VOICES = ['Kore', 'Charon', 'Puck', 'Fenrir', 'Zephyr'] as const;

interface LocalChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  modelUsed?: GeminiChatModel;
  proposedScenario?: ProposedScenarioPatch;
}

function sanitizeScenarioPatch(
  raw: Record<string, unknown>
): ProposedScenarioPatch {
  const patch: ProposedScenarioPatch = {};
  if (typeof raw.scenarioName === 'string' && raw.scenarioName.trim()) {
    patch.scenarioName = raw.scenarioName.trim();
  }
  if (typeof raw.startMonth === 'string' && /^\d{4}-\d{2}$/.test(raw.startMonth)) {
    patch.startMonth = raw.startMonth;
  }
  if (raw.termMonths === 12 || raw.termMonths === 24 || raw.termMonths === 36) {
    patch.termMonths = raw.termMonths as ContractTermMonths;
  }
  if (typeof raw.year1Acv === 'number' && Number.isFinite(raw.year1Acv) && raw.year1Acv > 0) {
    patch.year1Acv = Math.round(raw.year1Acv);
  }
  if (
    typeof raw.escalatorPct === 'number' &&
    Number.isFinite(raw.escalatorPct) &&
    raw.escalatorPct >= 0 &&
    raw.escalatorPct <= 50
  ) {
    patch.escalatorPct = Math.round(raw.escalatorPct);
  }
  if (typeof raw.useCustomRamp === 'boolean') {
    patch.useCustomRamp = raw.useCustomRamp;
  }
  if (Array.isArray(raw.customAnnualAcvs) && raw.customAnnualAcvs.length >= 3) {
    const nums = raw.customAnnualAcvs.slice(0, 3).map((v) => Math.max(0, Math.round(Number(v) || 0)));
    patch.customAnnualAcvs = [nums[0], nums[1], nums[2]];
  }
  const validCadences: BillingCadence[] = [
    'monthly',
    'quarterly',
    'semi-annual',
    'annual',
    'multi-year',
  ];
  if (
    typeof raw.billingCadence === 'string' &&
    validCadences.includes(raw.billingCadence as BillingCadence)
  ) {
    patch.billingCadence = raw.billingCadence as BillingCadence;
  }
  if (
    raw.paymentTermsDays === 0 ||
    raw.paymentTermsDays === 30 ||
    raw.paymentTermsDays === 60 ||
    raw.paymentTermsDays === 90
  ) {
    patch.paymentTermsDays = raw.paymentTermsDays as PaymentTermsDays;
  }
  if (raw.revRecMethod === 'equal' || raw.revRecMethod === 'exact-days') {
    patch.revRecMethod = raw.revRecMethod as RevRecMethod;
  }
  if (raw.bookingsMode === 'tcv' || raw.bookingsMode === 'annual') {
    patch.bookingsMode = raw.bookingsMode;
  }
  return patch;
}

export const ContractAiWorkbench: React.FC<ContractAiWorkbenchProps> = ({
  model,
  activeTab,
  onTabChange,
  onApplyScenarioPatch,
}) => {
  // --- Chat State ---
  const [chatModel, setChatModel] = useState<GeminiChatModel>('gemini-4-hydrogen');
  const [messages, setMessages] = useState<LocalChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: 'Ask any SaaS FP&A question about the active contract, or describe a new deal in plain English (for example: "Model a 36-month $180k ACV contract with 8% annual escalation, quarterly billing, and Net 60 terms") to generate a one-click model update.',
      modelUsed: 'gemini-4-hydrogen',
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [appliedMessageId, setAppliedMessageId] = useState<string | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // --- Image Scanner State ---
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string>('image/png');
  const [imageFileName, setImageFileName] = useState<string>('');
  const [scannerNotes, setScannerNotes] = useState('');
  const [scannerLoading, setScannerLoading] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [extractedAnalysis, setExtractedAnalysis] =
    useState<ExtractedContractAnalysis | null>(null);
  const [scannerApplied, setScannerApplied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // --- TTS Audio Briefing State ---
  const [ttsMode, setTtsMode] = useState<'single' | 'dialogue'>('single');
  const [ttsVoice, setTtsVoice] = useState<(typeof TTS_VOICES)[number]>('Kore');
  const [customBriefingText, setCustomBriefingText] = useState(() =>
    buildExecutiveBriefingScript(model, 'single').transcript
  );
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const activeInlineAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setCustomBriefingText(buildExecutiveBriefingScript(model, ttsMode).transcript);
  }, [
    model.inputs.scenarioName,
    model.inputs.termMonths,
    model.inputs.billingCadence,
    model.inputs.paymentTermsDays,
    model.inputs.revRecMethod,
    model.summary.tcv,
    model.summary.peakDeferredRevenue,
    ttsMode,
  ]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, chatLoading]);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (activeInlineAudioRef.current) {
        activeInlineAudioRef.current.pause();
      }
    };
  }, [audioUrl]);

  const buildModelContext = () => ({
    inputs: model.inputs,
    summary: model.summary,
    sampleMonths: {
      month1: model.rows[0],
      month12: model.rows[11],
      finalActiveMonth: model.rows[model.inputs.termMonths - 1],
      finalTimelineMonth: model.rows[model.rows.length - 1],
    },
  });

  // Send multi-turn chat message
  const handleSendChat = async (overridePrompt?: string) => {
    const content = (overridePrompt ?? chatInput).trim();
    if (!content || chatLoading) return;

    setChatError(null);
    const userMsg: LocalChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: content,
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    if (!overridePrompt) setChatInput('');
    setChatLoading(true);

    try {
      // Exclude initial local welcome message from API conversation history
      const apiMessages = nextMessages
        .filter((m) => m.id !== 'welcome')
        .map((m) => ({ role: m.role, text: m.text }));

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          model: chatModel,
          modelContext: buildModelContext(),
        }),
      });

      const data = (await res.json()) as {
        text?: string;
        modelUsed?: GeminiChatModel;
        proposedScenario?: Record<string, unknown>;
        error?: string;
      };

      if (!res.ok || data.error) {
        throw new Error(data.error || `Chat request failed (${res.status}).`);
      }

      const proposedScenario = data.proposedScenario
        ? sanitizeScenarioPatch(data.proposedScenario)
        : undefined;

      setMessages((prev) => [
        ...prev,
        {
          id: `model-${Date.now()}`,
          role: 'model',
          text: data.text || 'No response text returned.',
          modelUsed: data.modelUsed ?? chatModel,
          proposedScenario:
            proposedScenario && Object.keys(proposedScenario).length > 0
              ? proposedScenario
              : undefined,
        },
      ]);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Unable to reach Gemini chat API.');
    } finally {
      setChatLoading(false);
    }
  };

  // Speak any chat reply via gemini-3.8-flash-tts
  const handleSpeakReply = async (msg: LocalChatMessage) => {
    if (speakingMessageId === msg.id) {
      activeInlineAudioRef.current?.pause();
      setSpeakingMessageId(null);
      return;
    }

    setChatError(null);
    setSpeakingMessageId(msg.id);

    try {
      const res = await fetch('/api/ai/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'single',
          voiceName: ttsVoice,
          parts: [
            {
              text: msg.text.slice(0, 1400),
              style: 'Clear, authoritative SaaS finance advisor',
            },
          ],
        }),
      });
      const data = (await res.json()) as {
        audioBase64?: string;
        error?: string;
      };
      if (!res.ok || !data.audioBase64) {
        throw new Error(data.error || 'Text-to-speech synthesis failed.');
      }

      if (activeInlineAudioRef.current) {
        activeInlineAudioRef.current.pause();
      }
      const audio = new Audio(`data:audio/wav;base64,${data.audioBase64}`);
      activeInlineAudioRef.current = audio;
      audio.onended = () => setSpeakingMessageId(null);
      audio.onerror = () => setSpeakingMessageId(null);
      await audio.play();
    } catch (err) {
      setSpeakingMessageId(null);
      setChatError(err instanceof Error ? err.message : 'Failed to synthesize audio.');
    }
  };

  // Handle Order Form image upload
  const handleImageSelected = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setScannerError('Please upload a PNG, JPG, or WebP image of a contract or order form.');
      return;
    }
    setScannerError(null);
    setExtractedAnalysis(null);
    setScannerApplied(false);
    setImageFileName(file.name);
    setImageMimeType(file.type);

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      setImagePreviewUrl(result);
      const commaIdx = result.indexOf(',');
      setImageBase64(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyzeImage = async () => {
    if (!imageBase64 || scannerLoading) return;
    setScannerLoading(true);
    setScannerError(null);
    setScannerApplied(false);

    try {
      const res = await fetch('/api/ai/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64,
          mimeType: imageMimeType,
          notes: scannerNotes.trim() || undefined,
        }),
      });

      const data = (await res.json()) as {
        analysis?: ExtractedContractAnalysis;
        error?: string;
      };

      if (!res.ok || !data.analysis) {
        throw new Error(data.error || `Image analysis failed (${res.status}).`);
      }

      setExtractedAnalysis(data.analysis);
    } catch (err) {
      setScannerError(
        err instanceof Error ? err.message : 'Unable to analyze uploaded image.'
      );
    } finally {
      setScannerLoading(false);
    }
  };

  const handleApplyExtractedAnalysis = () => {
    if (!extractedAnalysis) return;
    const patch = sanitizeScenarioPatch({
      scenarioName: extractedAnalysis.customerName || 'Extracted Contract',
      startMonth: extractedAnalysis.startMonth,
      termMonths: extractedAnalysis.termMonths,
      year1Acv: extractedAnalysis.year1Acv,
      escalatorPct: extractedAnalysis.escalatorPct,
      useCustomRamp: extractedAnalysis.useCustomRamp,
      customAnnualAcvs: extractedAnalysis.customAnnualAcvs,
      billingCadence: extractedAnalysis.billingCadence,
      paymentTermsDays: extractedAnalysis.paymentTermsDays,
      revRecMethod: extractedAnalysis.revRecMethod,
    });
    onApplyScenarioPatch(patch);
    setScannerApplied(true);
  };

  // Generate Executive Audio Briefing via gemini-3.8-flash-tts
  const handleGenerateBriefingAudio = async () => {
    if (ttsLoading || !customBriefingText.trim()) return;
    setTtsLoading(true);
    setTtsError(null);

    try {
      let parts: Array<{ text: string; speaker?: string; style: string }>;

      if (ttsMode === 'dialogue') {
        const defaultScript = buildExecutiveBriefingScript(model, 'dialogue');
        // Parse lines prefixed with Alex: / Sam: if user edited script
        const rawLines = customBriefingText
          .split(/\n+/)
          .map((l) => l.trim())
          .filter(Boolean);
        const parsedParts = rawLines.map((line, idx) => {
          const isSam = /^sam:/i.test(line);
          const isAlex = /^alex:/i.test(line);
          const speaker = isSam ? 'Sam' : isAlex ? 'Alex' : idx % 2 === 0 ? 'Alex' : 'Sam';
          const normalizedText =
            isSam || isAlex ? line : `${speaker}: ${line}`;
          return {
            text: normalizedText,
            speaker,
            style:
              speaker === 'Alex'
                ? 'Sharp, articulate VP of Finance leading an executive review'
                : 'Analytical, conversational FP&A director highlighting working capital dynamics',
          };
        });
        parts = parsedParts.length > 0 ? parsedParts : defaultScript.parts;
      } else {
        parts = [
          {
            text: customBriefingText.trim(),
            style: 'Calm, authoritative CFO delivering a crisp board-ready financial briefing',
          },
        ];
      }

      const res = await fetch('/api/ai/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: ttsMode,
          voiceName: ttsVoice,
          parts,
        }),
      });

      const data = (await res.json()) as {
        audioBase64?: string;
        mimeType?: string;
        error?: string;
      };

      if (!res.ok || !data.audioBase64) {
        throw new Error(data.error || `Audio synthesis failed (${res.status}).`);
      }

      // Decode unary WAV base64 directly into a Blob (no extra header wrapping)
      const binary = atob(data.audioBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'audio/wav' });
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(URL.createObjectURL(blob));
    } catch (err) {
      setTtsError(
        err instanceof Error ? err.message : 'Unable to generate executive audio briefing.'
      );
    } finally {
      setTtsLoading(false);
    }
  };

  return (
    <section
      id="contract-ai"
      className="bg-white border border-slate-200 rounded-lg overflow-hidden scroll-mt-20"
    >
      {/* Workbench Header & Segmented Tabs */}
      <div className="px-5 py-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Contract Intelligence Workbench
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Discuss ASC 606 mechanics, extract parameters from uploaded order forms, or generate spoken executive briefings.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start md:self-auto">
          <button
            type="button"
            onClick={() => onTabChange('chat')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'chat'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>FP&amp;A Advisor</span>
          </button>
          <button
            type="button"
            onClick={() => onTabChange('scanner')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'scanner'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileImage className="w-3.5 h-3.5" />
            <span>Order Form Scanner</span>
          </button>
          <button
            type="button"
            onClick={() => onTabChange('audio')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'audio'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>Audio Briefing</span>
          </button>
        </div>
      </div>

      {/* TAB 1: Multi-turn Gemini FP&A Advisor Chat */}
      {activeTab === 'chat' && (
        <div className="p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>Active context: {model.inputs.scenarioName}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                TCV {formatCurrency(model.summary.tcv)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="chat-model-select" className="text-xs text-slate-500">
                Model
              </label>
              <select
                id="chat-model-select"
                value={chatModel}
                onChange={(e) => setChatModel(e.target.value as GeminiChatModel)}
                className="h-8 px-2.5 text-xs bg-white border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              >
                {CHAT_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} — {m.desc}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  setMessages((prev) => prev.slice(0, 1));
                  setChatError(null);
                }}
                className="inline-flex items-center gap-1 h-8 px-2.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-md transition-colors cursor-pointer"
                title="Clear conversation history"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            </div>
          </div>

          {/* Quick prompts */}
          <div className="flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((q) => (
              <button
                key={q}
                type="button"
                disabled={chatLoading}
                onClick={() => handleSendChat(q)}
                className="text-left text-xs px-3 py-1.5 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors cursor-pointer disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Scrollable Message Thread */}
          <div
            ref={chatScrollRef}
            className="h-[360px] overflow-y-auto ledger-scroll border border-slate-200 rounded-lg bg-slate-50/50 p-4 space-y-4"
          >
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-1">
                    <span>{isUser ? 'You' : 'FP&A Advisor'}</span>
                    {!isUser && msg.modelUsed && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">{msg.modelUsed}</span>
                      </>
                    )}
                  </div>
                  <div
                    className={`max-w-[85%] rounded-lg px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                      isUser
                        ? 'bg-slate-900 text-white'
                        : 'bg-white border border-slate-200 text-slate-800'
                    }`}
                  >
                    {msg.text}
                  </div>

                  {!isUser && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      {msg.proposedScenario && (
                        <button
                          type="button"
                          onClick={() => {
                            onApplyScenarioPatch(msg.proposedScenario!);
                            setAppliedMessageId(msg.id);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-md transition-colors cursor-pointer"
                        >
                          {appliedMessageId === msg.id ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>Applied to Model</span>
                            </>
                          ) : (
                            <>
                              <span>Apply Scenario to Model</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </>
                          )}
                        </button>
                      )}
                      {msg.id !== 'welcome' && (
                        <button
                          type="button"
                          onClick={() => handleSpeakReply(msg)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-md transition-colors cursor-pointer"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>
                            {speakingMessageId === msg.id ? 'Stop Audio' : 'Read Aloud'}
                          </span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {chatLoading && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Analyzing contract model with {chatModel}...</span>
              </div>
            )}
          </div>

          {chatError && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{chatError}</span>
            </div>
          )}

          {/* Chat Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendChat();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask about bookings vs. revenue, or describe a SaaS contract to model..."
              className="flex-1 h-10 px-3.5 text-sm bg-white border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
            <button
              type="submit"
              disabled={chatLoading || !chatInput.trim()}
              className="inline-flex items-center gap-1.5 h-10 px-4 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>Send</span>
            </button>
          </form>
        </div>
      )}

      {/* TAB 2: Order Form / Contract Image Analyzer (gemini-4-neon) */}
      {activeTab === 'scanner' && (
        <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Upload Column */}
          <div className="space-y-4">
            <div className="text-xs text-slate-500 flex items-center gap-2">
              <span>Vision Engine: gemini-4-neon</span>
              <span aria-hidden="true">·</span>
              <span>Extracts ACV, ramps, cadence, and Net terms into the live model</span>
            </div>

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0] ?? null;
                handleImageSelected(file);
              }}
              className="border border-dashed border-slate-300 rounded-lg bg-slate-50/70 p-6 text-center"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => handleImageSelected(e.target.files?.[0] ?? null)}
                className="hidden"
              />

              {imagePreviewUrl ? (
                <div className="space-y-3">
                  <img
                    src={imagePreviewUrl}
                    alt="Uploaded SaaS order form preview"
                    className="max-h-[260px] mx-auto rounded-md border border-slate-200 object-contain bg-white"
                  />
                  <div className="flex items-center justify-center gap-3 text-xs text-slate-600">
                    <span className="font-mono truncate max-w-[220px]">
                      {imageFileName}
                    </span>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-blue-700 hover:underline font-medium cursor-pointer"
                    >
                      Replace Image
                    </button>
                  </div>
                </div>
              ) : (
                <div className="py-6 space-y-3">
                  <Upload className="w-7 h-7 text-slate-400 mx-auto" />
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      Upload a SaaS Order Form, quote, or pricing table image
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      PNG, JPG, or WebP · Drag and drop here or browse files
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-900 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors cursor-pointer"
                  >
                    <span>Select Image</span>
                  </button>
                </div>
              )}
            </div>

            <div>
              <label
                htmlFor="scanner-notes"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Optional Extraction Guidance
              </label>
              <input
                id="scanner-notes"
                type="text"
                value={scannerNotes}
                onChange={(e) => setScannerNotes(e.target.value)}
                placeholder="e.g. Exclude one-time implementation fees, focus on subscription SaaS line items"
                className="w-full h-9 px-3 text-xs bg-white border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>

            <button
              type="button"
              disabled={!imageBase64 || scannerLoading}
              onClick={handleAnalyzeImage}
              className="w-full inline-flex items-center justify-center gap-2 h-10 px-4 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors disabled:opacity-50 cursor-pointer"
            >
              {scannerLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Analyzing Order Form with gemini-4-neon...</span>
                </>
              ) : (
                <>
                  <FileImage className="w-4 h-4" />
                  <span>Analyze Contract Image</span>
                </>
              )}
            </button>

            {scannerError && (
              <div className="flex items-start gap-2.5 p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{scannerError}</span>
              </div>
            )}
          </div>

          {/* Extraction Results Column */}
          <div className="border border-slate-200 rounded-lg p-5 bg-slate-50/40 min-h-[320px] flex flex-col justify-between">
            {!extractedAnalysis ? (
              <div className="my-auto text-center py-10 px-4">
                <p className="text-sm font-medium text-slate-700">
                  Extracted Contract Schedule
                </p>
                <p className="text-xs text-slate-500 mt-1.5 max-w-sm mx-auto leading-relaxed">
                  Upload a photo or screenshot of a customer order form and click Analyze Contract Image. Extracted commercial terms, escalators, and ASC 606 notes will appear here ready to load into the model.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      {extractedAnalysis.customerName}
                    </h3>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      {extractedAnalysis.contractSummary}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <div className="text-slate-500">Start Month</div>
                    <div className="font-mono font-medium text-slate-900 mt-0.5">
                      {extractedAnalysis.startMonth}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Term</div>
                    <div className="font-mono font-medium text-slate-900 mt-0.5">
                      {extractedAnalysis.termMonths} months
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Year 1 ACV</div>
                    <div className="font-mono font-medium text-slate-900 mt-0.5">
                      {formatCurrency(extractedAnalysis.year1Acv)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Billing Cadence</div>
                    <div className="font-medium text-slate-900 mt-0.5">
                      {BILLING_CADENCE_LABELS[extractedAnalysis.billingCadence] ??
                        extractedAnalysis.billingCadence}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Payment Terms</div>
                    <div className="font-medium text-slate-900 mt-0.5">
                      {PAYMENT_TERMS_LABELS[extractedAnalysis.paymentTermsDays] ??
                        `Net ${extractedAnalysis.paymentTermsDays}`}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Rev Rec Method</div>
                    <div className="font-medium text-slate-900 mt-0.5">
                      {REV_REC_LABELS[extractedAnalysis.revRecMethod] ??
                        extractedAnalysis.revRecMethod}
                    </div>
                  </div>
                </div>

                {extractedAnalysis.keyClauses.length > 0 && (
                  <div className="pt-3 border-t border-slate-200">
                    <div className="text-xs font-semibold text-slate-700 mb-1.5">
                      Key Commercial Clauses
                    </div>
                    <ul className="space-y-1 text-xs text-slate-600 list-disc pl-4">
                      {extractedAnalysis.keyClauses.map((clause, i) => (
                        <li key={i}>{clause}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {extractedAnalysis.accountingNotes.length > 0 && (
                  <div className="pt-3 border-t border-slate-200">
                    <div className="text-xs font-semibold text-slate-700 mb-1.5">
                      FP&amp;A &amp; ASC 606 Notes
                    </div>
                    <ul className="space-y-1 text-xs text-slate-600 list-disc pl-4">
                      {extractedAnalysis.accountingNotes.map((note, i) => (
                        <li key={i}>{note}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleApplyExtractedAnalysis}
                    className="w-full inline-flex items-center justify-center gap-2 h-9 px-4 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-md transition-colors cursor-pointer"
                  >
                    {scannerApplied ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Loaded into Live Model</span>
                      </>
                    ) : (
                      <>
                        <span>Load Extracted Terms into Model</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Executive Audio Briefing (gemini-3.8-flash-tts) */}
      {activeTab === 'audio' && (
        <div className="p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setTtsMode('single')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    ttsMode === 'single'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Single-Speaker CFO Brief
                </button>
                <button
                  type="button"
                  onClick={() => setTtsMode('dialogue')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    ttsMode === 'dialogue'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Dual-Speaker Review (Alex &amp; Sam)
                </button>
              </div>

              {ttsMode === 'single' && (
                <div className="flex items-center gap-2">
                  <label htmlFor="tts-voice-select" className="text-xs text-slate-500">
                    Voice
                  </label>
                  <select
                    id="tts-voice-select"
                    value={ttsVoice}
                    onChange={(e) =>
                      setTtsVoice(e.target.value as (typeof TTS_VOICES)[number])
                    }
                    className="h-8 px-2.5 text-xs bg-white border border-slate-200 rounded-md text-slate-900"
                  >
                    {TTS_VOICES.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span>Speech Model: gemini-3.8-flash-tts</span>
              <button
                type="button"
                onClick={() =>
                  setCustomBriefingText(
                    buildExecutiveBriefingScript(model, ttsMode).transcript
                  )
                }
                className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-900 font-medium cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Sync from Model</span>
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="tts-script-textarea"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Briefing Script (Editable)
            </label>
            <textarea
              id="tts-script-textarea"
              rows={5}
              value={customBriefingText}
              onChange={(e) => setCustomBriefingText(e.target.value)}
              className="w-full p-3.5 text-sm leading-relaxed bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={ttsLoading || !customBriefingText.trim()}
              onClick={handleGenerateBriefingAudio}
              className="inline-flex items-center gap-2 h-10 px-4 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors disabled:opacity-50 cursor-pointer"
            >
              {ttsLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Synthesizing Audio...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  <span>Generate Audio Briefing</span>
                </>
              )}
            </button>

            {audioUrl && (
              <a
                href={audioUrl}
                download={`ledgerline-briefing-${ttsMode}.wav`}
                className="inline-flex items-center gap-1.5 h-10 px-3.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Download WAV</span>
              </a>
            )}
          </div>

          {ttsError && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{ttsError}</span>
            </div>
          )}

          {audioUrl && (
            <div className="p-4 rounded-lg border border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="text-xs text-slate-600 shrink-0">
                <div className="font-semibold text-slate-900">
                  Ready for Playback
                </div>
                <div className="mt-0.5">
                  24kHz WAV · {ttsMode === 'dialogue' ? 'Alex & Sam' : ttsVoice}
                </div>
              </div>
              <audio controls src={audioUrl} className="w-full h-10" />
            </div>
          )}
        </div>
      )}
    </section>
  );
};
