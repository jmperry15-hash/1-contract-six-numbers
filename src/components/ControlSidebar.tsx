import React from 'react';
import { RotateCcw } from 'lucide-react';
import type {
  BillingCadence,
  BookingsMode,
  ContractInputs,
  ContractTermMonths,
  PaymentTermsDays,
  RevRecMethod,
} from '../types/fpa';
import {
  BILLING_CADENCE_LABELS,
  SCENARIO_PRESETS,
  formatCurrency,
} from '../lib/accountingEngine';

interface ControlSidebarProps {
  inputs: ContractInputs;
  annualAcvs: number[];
  onChange: (next: ContractInputs) => void;
  onSelectPreset: (presetInputs: ContractInputs) => void;
}

const TERM_OPTIONS: ContractTermMonths[] = [12, 24, 36];
const PAYMENT_TERMS_OPTIONS: PaymentTermsDays[] = [0, 30, 60, 90];
const CADENCE_OPTIONS: BillingCadence[] = [
  'monthly',
  'quarterly',
  'semi-annual',
  'annual',
  'multi-year',
];

export const ControlSidebar: React.FC<ControlSidebarProps> = ({
  inputs,
  annualAcvs,
  onChange,
  onSelectPreset,
}) => {
  const yearsCount = inputs.termMonths / 12;

  const updateField = <K extends keyof ContractInputs>(
    key: K,
    value: ContractInputs[K]
  ) => {
    onChange({
      ...inputs,
      [key]: value,
      presetKey: 'custom',
      scenarioName:
        inputs.presetKey === 'custom' ? inputs.scenarioName : 'Custom Contract Scenario',
    });
  };

  const handleYear1AcvChange = (val: number) => {
    const safeVal = Math.max(1000, Math.min(2000000, Math.round(val)));
    const nextCustom: [number, number, number] = [...inputs.customAnnualAcvs];
    nextCustom[0] = safeVal;
    onChange({
      ...inputs,
      year1Acv: safeVal,
      customAnnualAcvs: nextCustom,
      presetKey: 'custom',
      scenarioName:
        inputs.presetKey === 'custom' ? inputs.scenarioName : 'Custom Contract Scenario',
    });
  };

  const handleCustomYearChange = (yearIdx: 0 | 1 | 2, val: number) => {
    const safeVal = Math.max(0, Math.min(5000000, Math.round(val)));
    const nextCustom: [number, number, number] = [...inputs.customAnnualAcvs];
    nextCustom[yearIdx] = safeVal;
    onChange({
      ...inputs,
      useCustomRamp: true,
      year1Acv: yearIdx === 0 ? safeVal : inputs.year1Acv,
      customAnnualAcvs: nextCustom,
      presetKey: 'custom',
      scenarioName:
        inputs.presetKey === 'custom' ? inputs.scenarioName : 'Custom Contract Scenario',
    });
  };

  const handleEscalatorChange = (pct: number) => {
    const safePct = Math.max(0, Math.min(50, pct));
    const y1 = inputs.year1Acv;
    const y2 = Math.round(y1 * (1 + safePct / 100));
    const y3 = Math.round(y1 * Math.pow(1 + safePct / 100, 2));
    onChange({
      ...inputs,
      useCustomRamp: false,
      escalatorPct: safePct,
      customAnnualAcvs: [y1, y2, y3],
      presetKey: 'custom',
      scenarioName:
        inputs.presetKey === 'custom' ? inputs.scenarioName : 'Custom Contract Scenario',
    });
  };

  const handleTermChange = (term: ContractTermMonths) => {
    const nextCadence =
      term === 12 && inputs.billingCadence === 'multi-year'
        ? 'annual'
        : inputs.billingCadence;
    onChange({
      ...inputs,
      termMonths: term,
      billingCadence: nextCadence,
      presetKey: 'custom',
      scenarioName:
        inputs.presetKey === 'custom' ? inputs.scenarioName : 'Custom Contract Scenario',
    });
  };

  const handleReset = () => {
    onSelectPreset(SCENARIO_PRESETS[0].inputs);
  };

  return (
    <aside className="w-full lg:w-[320px] xl:w-[340px] shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-slate-200">
      <div className="p-5 space-y-6 lg:sticky lg:top-14 lg:max-h-[calc(100vh-3.5rem)] lg:overflow-y-auto ledger-scroll">
        {/* Preset Scenarios */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold tracking-wide text-slate-500">
              Preset Scenarios
            </h2>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
              title="Reset to Standard SaaS"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>
          <div className="space-y-2">
            {SCENARIO_PRESETS.map((preset) => {
              const isSelected = inputs.presetKey === preset.key;
              return (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => onSelectPreset(preset.inputs)}
                  className={`w-full text-left px-3.5 py-2.5 rounded-lg border transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 border-slate-900 text-white'
                      : 'bg-white border-slate-200 text-slate-900 hover:bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <div className="text-sm font-medium leading-snug">{preset.label}</div>
                  <div
                    className={`text-xs mt-0.5 font-mono tabular-nums ${
                      isSelected ? 'text-slate-300' : 'text-slate-500'
                    }`}
                  >
                    {preset.subtitle}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <hr className="border-slate-200" />

        {/* Contract Structure */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold tracking-wide text-slate-500">
            Contract Structure
          </h2>

          {/* Start Month */}
          <div>
            <label
              htmlFor="start-month-input"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Start Month
            </label>
            <input
              id="start-month-input"
              type="month"
              value={inputs.startMonth}
              onChange={(e) => updateField('startMonth', e.target.value)}
              className="w-full h-9 px-3 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
          </div>

          {/* Contract Term */}
          <div>
            <span className="block text-xs font-medium text-slate-700 mb-1.5">
              Contract Term
            </span>
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
              {TERM_OPTIONS.map((term) => {
                const active = inputs.termMonths === term;
                return (
                  <button
                    key={term}
                    type="button"
                    onClick={() => handleTermChange(term)}
                    className={`py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      active
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {term} mo
                  </button>
                );
              })}
            </div>
          </div>

          {/* Year 1 ACV */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="y1-acv-number"
                className="text-xs font-medium text-slate-700"
              >
                Year 1 ACV
              </label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-mono">
                  $
                </span>
                <input
                  id="y1-acv-number"
                  type="number"
                  min={1000}
                  max={2000000}
                  step={1000}
                  value={inputs.year1Acv}
                  onChange={(e) =>
                    handleYear1AcvChange(Number(e.target.value) || 0)
                  }
                  className="w-28 h-8 pl-6 pr-2 text-right text-xs font-mono tabular-nums bg-white border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
              </div>
            </div>
            <input
              type="range"
              aria-label="Year 1 ACV Slider"
              min={12000}
              max={500000}
              step={6000}
              value={Math.min(500000, Math.max(12000, inputs.year1Acv))}
              onChange={(e) => handleYear1AcvChange(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-[11px] font-mono tabular-nums text-slate-400 mt-1">
              <span>$12k</span>
              <span>$250k</span>
              <span>$500k</span>
            </div>
          </div>

          {/* Annual Escalator / Multi-Year Ramp */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-700">
                Annual Escalation
              </span>
              {yearsCount > 1 && (
                <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-md">
                  <button
                    type="button"
                    onClick={() => updateField('useCustomRamp', false)}
                    className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                      !inputs.useCustomRamp
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    % Rate
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const nextCustom: [number, number, number] = [
                        annualAcvs[0] ?? inputs.year1Acv,
                        annualAcvs[1] ?? inputs.year1Acv,
                        annualAcvs[2] ?? annualAcvs[1] ?? inputs.year1Acv,
                      ];
                      onChange({
                        ...inputs,
                        useCustomRamp: true,
                        customAnnualAcvs: nextCustom,
                        presetKey: 'custom',
                      });
                    }}
                    className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                      inputs.useCustomRamp
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Custom Ramp
                  </button>
                </div>
              )}
            </div>

            {!inputs.useCustomRamp || yearsCount === 1 ? (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-500">
                    {yearsCount === 1
                      ? 'Applies to multi-year contracts'
                      : 'Annual compound escalator'}
                  </span>
                  <span className="text-xs font-mono font-medium tabular-nums text-slate-900">
                    {inputs.escalatorPct}%
                  </span>
                </div>
                <input
                  type="range"
                  aria-label="Annual Escalator Percentage"
                  min={0}
                  max={50}
                  step={1}
                  disabled={yearsCount === 1}
                  value={inputs.escalatorPct}
                  onChange={(e) => handleEscalatorChange(Number(e.target.value))}
                  className="w-full disabled:opacity-40"
                />
                {yearsCount > 1 && (
                  <div className="mt-2 flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500 bg-slate-50 border border-slate-200/80 rounded-md px-2.5 py-1.5">
                    {annualAcvs.map((acv, i) => (
                      <span key={i}>
                        Y{i + 1}: {formatCurrency(acv)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {Array.from({ length: yearsCount }, (_, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-3">
                    <label
                      htmlFor={`ramp-y${idx + 1}`}
                      className="text-xs text-slate-600 whitespace-nowrap"
                    >
                      Year {idx + 1} ACV
                    </label>
                    <div className="relative flex-1 max-w-[160px]">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-mono">
                        $
                      </span>
                      <input
                        id={`ramp-y${idx + 1}`}
                        type="number"
                        min={0}
                        step={5000}
                        value={inputs.customAnnualAcvs[idx]}
                        onChange={(e) =>
                          handleCustomYearChange(
                            idx as 0 | 1 | 2,
                            Number(e.target.value) || 0
                          )
                        }
                        className="w-full h-8 pl-6 pr-2 text-right text-xs font-mono tabular-nums bg-white border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <hr className="border-slate-200" />

        {/* Billing, Cash & Recognition */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold tracking-wide text-slate-500">
            Billing &amp; Recognition Policy
          </h2>

          {/* Billing Cadence */}
          <div>
            <label
              htmlFor="billing-cadence-select"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Billing Cadence
            </label>
            <select
              id="billing-cadence-select"
              value={inputs.billingCadence}
              onChange={(e) =>
                updateField('billingCadence', e.target.value as BillingCadence)
              }
              className="w-full h-9 px-3 text-sm bg-white border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            >
              {CADENCE_OPTIONS.map((cadence) => (
                <option
                  key={cadence}
                  value={cadence}
                  disabled={cadence === 'multi-year' && inputs.termMonths === 12}
                >
                  {BILLING_CADENCE_LABELS[cadence]}
                  {cadence === 'multi-year' && inputs.termMonths === 12
                    ? ' (24–36 mo)'
                    : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Payment Terms */}
          <div>
            <span className="block text-xs font-medium text-slate-700 mb-1.5">
              Payment Terms (Cash Lag)
            </span>
            <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 rounded-lg">
              {PAYMENT_TERMS_OPTIONS.map((days) => {
                const active = inputs.paymentTermsDays === days;
                return (
                  <button
                    key={days}
                    type="button"
                    onClick={() => updateField('paymentTermsDays', days)}
                    className={`py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      active
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Net {days}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Rev Rec Method */}
          <div>
            <span className="block text-xs font-medium text-slate-700 mb-1.5">
              GAAP Revenue Recognition
            </span>
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
              {(
                [
                  { id: 'equal', label: 'Equal (1/12th)' },
                  { id: 'exact-days', label: 'Exact Days' },
                ] as Array<{ id: RevRecMethod; label: string }>
              ).map((opt) => {
                const active = inputs.revRecMethod === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updateField('revRecMethod', opt.id)}
                    className={`py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      active
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bookings Recognition Display */}
          <div>
            <span className="block text-xs font-medium text-slate-700 mb-1.5">
              Bookings Display
            </span>
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
              {(
                [
                  { id: 'tcv', label: 'Full TCV (M1)' },
                  { id: 'annual', label: 'Annual Bookings' },
                ] as Array<{ id: BookingsMode; label: string }>
              ).map((opt) => {
                const active = inputs.bookingsMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updateField('bookingsMode', opt.id)}
                    className={`py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      active
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </aside>
  );
};
