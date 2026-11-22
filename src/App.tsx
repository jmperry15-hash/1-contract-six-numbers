import { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  FileImage,
  MessageSquare,
  Volume2,
} from 'lucide-react';
import type { ContractInputs, ProposedScenarioPatch } from './types/fpa';
import {
  BILLING_CADENCE_LABELS,
  PAYMENT_TERMS_LABELS,
  REV_REC_LABELS,
  SCENARIO_PRESETS,
  computeContractModel,
  generateWaterfallCsv,
} from './lib/accountingEngine';
import { ControlSidebar } from './components/ControlSidebar';
import { KpiSummaryStrip } from './components/KpiSummaryStrip';
import { LifecycleCharts } from './components/LifecycleCharts';
import { WaterfallTable } from './components/WaterfallTable';
import {
  ContractAiWorkbench,
  type AiWorkbenchTab,
} from './components/ContractAiWorkbench';

export default function App() {
  const [inputs, setInputs] = useState<ContractInputs>(SCENARIO_PRESETS[0].inputs);
  const [copiedCsv, setCopiedCsv] = useState(false);
  const [aiTab, setAiTab] = useState<AiWorkbenchTab>('chat');

  const model = useMemo(() => computeContractModel(inputs), [inputs]);

  const handleCopyCsv = async () => {
    const csv = generateWaterfallCsv(model);
    try {
      await navigator.clipboard.writeText(csv);
      setCopiedCsv(true);
      window.setTimeout(() => setCopiedCsv(false), 2200);
    } catch {
      // Fallback textarea copy if clipboard API is restricted inside iframe
      const textarea = document.createElement('textarea');
      textarea.value = csv;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedCsv(true);
      window.setTimeout(() => setCopiedCsv(false), 2200);
    }
  };

  const handleApplyScenarioPatch = (patch: ProposedScenarioPatch) => {
    setInputs((prev) => {
      const nextTerm = patch.termMonths ?? prev.termMonths;
      const nextY1 = patch.year1Acv ?? prev.year1Acv;
      const nextEsc = patch.escalatorPct ?? prev.escalatorPct;
      const nextCadence =
        nextTerm === 12 && (patch.billingCadence ?? prev.billingCadence) === 'multi-year'
          ? 'annual'
          : patch.billingCadence ?? prev.billingCadence;

      return {
        ...prev,
        ...patch,
        termMonths: nextTerm,
        year1Acv: nextY1,
        escalatorPct: nextEsc,
        billingCadence: nextCadence,
        presetKey: 'custom',
        scenarioName: patch.scenarioName || 'AI Modeled Scenario',
      };
    });
  };

  const jumpToAiTab = (tab: AiWorkbenchTab) => {
    setAiTab(tab);
    const el = document.getElementById('contract-ai');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-8">
        <a
          href="#overview"
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          Ledgerline
        </a>

        <nav
          aria-label="Primary Navigation"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600"
        >
          <a
            href="#overview"
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            Overview
          </a>
          <a
            href="#charts"
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            Charts
          </a>
          <a
            href="#waterfall"
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            Waterfall
          </a>
          <a
            href="#contract-ai"
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            Contract AI
          </a>
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={handleCopyCsv}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copiedCsv ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Copied CSV</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy CSV</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Split Workspace: Left Control Sidebar + Main Financial Canvas */}
      <div className="flex-1 flex flex-col lg:flex-row">
        <ControlSidebar
          inputs={inputs}
          annualAcvs={model.summary.annualAcvs}
          onChange={setInputs}
          onSelectPreset={(presetInputs) => setInputs(presetInputs)}
        />

        <main className="flex-1 min-w-0 p-5 md:p-7 space-y-6 max-w-[1400px]">
          {/* Scenario Context Header & AI Shortcuts */}
          <section
            id="overview"
            className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 scroll-mt-20"
          >
            <div className="space-y-1">
              <div className="text-xs font-medium text-slate-500">
                1 Contract, 6 Numbers · SaaS FP&amp;A Lifecycle Model
              </div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 [text-wrap:balance]">
                {inputs.scenarioName}
              </h1>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                <span>{inputs.termMonths}-Month Term</span>
                <span aria-hidden="true">·</span>
                <span>{BILLING_CADENCE_LABELS[inputs.billingCadence]}</span>
                <span aria-hidden="true">·</span>
                <span>{PAYMENT_TERMS_LABELS[inputs.paymentTermsDays]}</span>
                <span aria-hidden="true">·</span>
                <span>{REV_REC_LABELS[inputs.revRecMethod]}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {model.summary.timelineMonths}-Mo Horizon
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => jumpToAiTab('chat')}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md transition-colors whitespace-nowrap cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
                <span>FP&amp;A Advisor</span>
              </button>
              <button
                type="button"
                onClick={() => jumpToAiTab('scanner')}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md transition-colors whitespace-nowrap cursor-pointer"
              >
                <FileImage className="w-3.5 h-3.5 text-slate-500" />
                <span>Scan Order Form</span>
              </button>
              <button
                type="button"
                onClick={() => jumpToAiTab('audio')}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md transition-colors whitespace-nowrap cursor-pointer"
              >
                <Volume2 className="w-3.5 h-3.5 text-slate-500" />
                <span>Audio Briefing</span>
              </button>
            </div>
          </section>

          {/* Audit Tie-Out Bar + 6 KPI Strip */}
          <KpiSummaryStrip model={model} />

          {/* Primary & Secondary Interactive Charts */}
          <LifecycleCharts model={model} />

          {/* Scrollable Monthly Waterfall Table */}
          <WaterfallTable
            model={model}
            copiedCsv={copiedCsv}
            onCopyCsv={handleCopyCsv}
          />

          {/* Gemini Contract Intelligence Workbench */}
          <ContractAiWorkbench
            model={model}
            activeTab={aiTab}
            onTabChange={setAiTab}
            onApplyScenarioPatch={handleApplyScenarioPatch}
          />

          {/* Quiet Footer */}
          <footer className="pt-2 pb-6 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              Ledgerline · ASC 606 SaaS Contract Lifecycle Workbench
            </span>
            <span>
              All schedules reconcile to exact cent precision across Bookings, Billings, Cash, and GAAP Revenue.
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
