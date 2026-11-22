import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { ModelResult } from '../types/fpa';
import { formatCurrency } from '../lib/accountingEngine';

interface KpiSummaryStripProps {
  model: ModelResult;
}

export const KpiSummaryStrip: React.FC<KpiSummaryStripProps> = ({ model }) => {
  const { summary, inputs } = model;
  const { audit } = summary;
  const showCents = inputs.revRecMethod === 'exact-days';

  const kpis = [
    {
      label: 'Total Contract Value',
      value: formatCurrency(summary.tcv, false),
      sub:
        inputs.bookingsMode === 'tcv'
          ? 'Booked 100% in M1'
          : `Annualized across ${inputs.termMonths / 12} yr${inputs.termMonths > 12 ? 's' : ''}`,
    },
    {
      label: 'Peak ARR',
      value: formatCurrency(summary.peakArr, false),
      sub:
        summary.annualAcvs.length > 1
          ? `Y1 ${formatCurrency(summary.annualAcvs[0])} → Y${summary.annualAcvs.length} ${formatCurrency(summary.annualAcvs[summary.annualAcvs.length - 1])}`
          : 'Active run-rate (M1–M12)',
    },
    {
      label: 'Total Billed',
      value: formatCurrency(summary.totalBilled, false),
      sub: `Peak AR ${formatCurrency(summary.peakAR)} (${summary.peakARMonth})`,
    },
    {
      label: 'Total Collected',
      value: formatCurrency(summary.totalCollected, false),
      sub:
        summary.paymentLagMonths === 0
          ? 'Same-month cash inflow'
          : `${summary.paymentLagMonths}-mo lag (Net ${inputs.paymentTermsDays})`,
    },
    {
      label: 'Total GAAP Revenue',
      value: formatCurrency(summary.totalRevenue, false),
      sub:
        inputs.revRecMethod === 'equal'
          ? 'Equal 1/12th ratable'
          : 'Daily proration (ASC 606)',
    },
    {
      label: 'Peak Deferred Revenue',
      value: formatCurrency(summary.peakDeferredRevenue, showCents),
      sub:
        summary.peakDeferredRevenue > 0
          ? `Peaks in ${summary.peakDeferredRevenueMonth}`
          : 'No upfront deferred balance',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Audit Tie-Out Verification Bar */}
      <div
        className={`flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 rounded-lg border bg-white ${
          audit.isReconciled ? 'border-emerald-200' : 'border-red-300'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {audit.isReconciled ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          )}
          <span
            className={`text-xs font-semibold whitespace-nowrap ${
              audit.isReconciled ? 'text-emerald-800' : 'text-red-800'
            }`}
          >
            Audit Tie-Out: {audit.isReconciled ? 'Reconciled' : 'Variance Detected'}
          </span>
          <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
            |
          </span>
          <span className="text-xs text-slate-600 font-mono tabular-nums">
            TCV = Billings = Cash = Revenue ({formatCurrency(audit.tcv, false)})
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono tabular-nums text-slate-600">
          <span>
            Ending AR:{' '}
            <strong className="font-semibold text-slate-900">
              {formatCurrency(audit.endingAR, true)}
            </strong>
          </span>
          <span className="text-slate-300" aria-hidden="true">
            ·
          </span>
          <span>
            Ending DR:{' '}
            <strong className="font-semibold text-slate-900">
              {formatCurrency(audit.endingDR, true)}
            </strong>
          </span>
          <span className="text-slate-300 hidden md:inline" aria-hidden="true">
            ·
          </span>
          <span className="text-slate-500 hidden md:inline">
            Clears {audit.resolutionMonthLabel}
          </span>
        </div>
      </div>

      {/* Unified 6-KPI Hairline Strip (Single Elevation, No Nested Cards) */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 divide-y md:divide-y-0 md:divide-x divide-slate-200">
          {kpis.map((kpi, idx) => (
            <div
              key={kpi.label}
              className={`p-4 ${
                idx >= 2 ? 'border-t border-slate-200 md:border-t-0' : ''
              } ${idx >= 3 ? 'md:border-t xl:border-t-0 border-slate-200' : ''}`}
            >
              <div className="text-xs font-medium text-slate-500 truncate">
                {kpi.label}
              </div>
              <div className="mt-1.5 text-xl font-semibold font-mono tabular-nums tracking-tight text-slate-900">
                {kpi.value}
              </div>
              <div className="mt-1 text-[11px] text-slate-500 truncate">
                {kpi.sub}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
