import React, { useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ModelResult, MonthlyWaterfallRow } from '../types/fpa';
import { formatCompactCurrency, formatCurrency } from '../lib/accountingEngine';

interface LifecycleChartsProps {
  model: ModelResult;
}

interface SeriesVisibility {
  bookings: boolean;
  billings: boolean;
  cashCollections: boolean;
  gaapRevenue: boolean;
  arr: boolean;
}

const SERIES_META = [
  { key: 'bookings', label: 'Bookings', color: '#0f172a' },
  { key: 'billings', label: 'Billings', color: '#1d4ed8' },
  { key: 'cashCollections', label: 'Cash Collections', color: '#15803d' },
  { key: 'gaapRevenue', label: 'GAAP Revenue', color: '#d97706' },
  { key: 'arr', label: 'ARR Run-Rate', color: '#64748b' },
] as const;

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
    dataKey: string;
    payload: MonthlyWaterfallRow;
  }>;
  showCents: boolean;
}

const FlowTooltip: React.FC<CustomTooltipProps> = ({ active, payload, showCents }) => {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-md p-3 text-xs min-w-[220px]">
      <div className="flex items-center justify-between gap-4 pb-2 mb-2 border-b border-slate-100">
        <span className="font-semibold text-slate-900">
          {row.monthLabel} · {row.calendarLabel}
        </span>
        <span className="font-mono tabular-nums text-slate-500">
          {row.contractYear ? `Year ${row.contractYear}` : 'Post-Term'} · {row.daysInMonth}d
        </span>
      </div>
      <div className="space-y-1.5">
        {payload.map((entry) => (
          <div
            key={entry.dataKey}
            className="flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-2 text-slate-600">
              <span
                className="w-2.5 h-2.5 rounded-xs shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span>{entry.name}</span>
            </div>
            <span className="font-mono font-medium tabular-nums text-slate-900">
              {formatCurrency(entry.value, showCents)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const BalanceTooltip: React.FC<CustomTooltipProps> = ({
  active,
  payload,
  showCents,
}) => {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-md p-3 text-xs min-w-[230px]">
      <div className="flex items-center justify-between gap-4 pb-2 mb-2 border-b border-slate-100">
        <span className="font-semibold text-slate-900">
          {row.monthLabel} · {row.calendarLabel}
        </span>
        <span className="font-mono tabular-nums text-slate-500">
          {row.contractYear ? `Year ${row.contractYear}` : 'Post-Term'}
        </span>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-slate-600">
            <span className="w-2.5 h-2.5 rounded-xs bg-blue-700 shrink-0" />
            <span>Ending Deferred Rev</span>
          </div>
          <span className="font-mono font-medium tabular-nums text-slate-900">
            {formatCurrency(row.endDR, showCents)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-slate-600">
            <span className="w-2.5 h-2.5 rounded-xs bg-amber-600 shrink-0" />
            <span>Ending Accounts Rec.</span>
          </div>
          <span className="font-mono font-medium tabular-nums text-slate-900">
            {formatCurrency(row.endAR, showCents)}
          </span>
        </div>
      </div>
      {row.endDR < -0.005 && (
        <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-amber-700">
          Negative DR reflects an ASC 606 Unbilled Contract Asset (earned daily rev ahead of billing).
        </div>
      )}
    </div>
  );
};

export const LifecycleCharts: React.FC<LifecycleChartsProps> = ({ model }) => {
  const [visible, setVisible] = useState<SeriesVisibility>({
    bookings: true,
    billings: true,
    cashCollections: true,
    gaapRevenue: true,
    arr: false,
  });

  const showCents = model.inputs.revRecMethod === 'exact-days';
  const expirationLabel = model.rows[model.inputs.termMonths - 1]?.shortDate;
  const tickInterval = model.rows.length > 36 ? 2 : model.rows.length > 24 ? 1 : 0;

  const toggleSeries = (key: keyof SeriesVisibility) => {
    setVisible((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      // Ensure at least one series stays visible
      if (!Object.values(next).some(Boolean)) return prev;
      return next;
    });
  };

  return (
    <div id="charts" className="space-y-5 scroll-mt-20">
      {/* Primary Multi-Series Chart: Timing Gap */}
      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Lifecycle Timing Gap: Bookings, Billings, Cash &amp; GAAP Revenue
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Compare upfront bookings and invoicing spikes against Net {model.inputs.paymentTermsDays} cash inflows and ratable monthly recognition.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {SERIES_META.map((s) => {
              const active = visible[s.key];
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => toggleSeries(s.key)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-slate-900 border-slate-900 text-white'
                      : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900 hover:border-slate-300'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-xs shrink-0"
                    style={{
                      backgroundColor: active ? s.color : '#cbd5e1',
                      outline: active && s.color === '#0f172a' ? '1px solid #94a3b8' : undefined,
                    }}
                  />
                  <span>{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={model.rows}
              margin={{ top: 10, right: 16, left: 4, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="shortDate"
                interval={tickInterval}
                tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'IBM Plex Mono' }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={formatCompactCurrency}
                tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'IBM Plex Mono' }}
                axisLine={false}
                tickLine={false}
                width={62}
              />
              <Tooltip content={<FlowTooltip showCents={showCents} />} />
              {expirationLabel && (
                <ReferenceLine
                  x={expirationLabel}
                  stroke="#94a3b8"
                  strokeDasharray="4 4"
                  label={{
                    value: 'Term End',
                    position: 'insideTopRight',
                    fill: '#64748b',
                    fontSize: 11,
                  }}
                />
              )}

              {visible.bookings && (
                <Bar
                  dataKey="bookings"
                  name="Bookings"
                  fill="#0f172a"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={20}
                />
              )}
              {visible.billings && (
                <Bar
                  dataKey="billings"
                  name="Billings"
                  fill="#1d4ed8"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={20}
                />
              )}
              {visible.cashCollections && (
                <Bar
                  dataKey="cashCollections"
                  name="Cash Collections"
                  fill="#15803d"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={20}
                />
              )}
              {visible.gaapRevenue && (
                <Line
                  type="monotone"
                  dataKey="gaapRevenue"
                  name="GAAP Revenue"
                  stroke="#d97706"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4, fill: '#d97706' }}
                />
              )}
              {visible.arr && (
                <Line
                  type="stepAfter"
                  dataKey="arr"
                  name="ARR Run-Rate"
                  stroke="#64748b"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Secondary Chart: Deferred Revenue & Accounts Receivable Waterfall */}
      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Balance Sheet Waterfall: Deferred Revenue &amp; Accounts Receivable
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Monthly ending roll-forward balances unwinding to $0.00 by {model.summary.audit.resolutionMonthLabel}.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-600 shrink-0">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-blue-700" />
              Ending Deferred Revenue
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-amber-600" />
              Ending Accounts Receivable
            </span>
          </div>
        </div>

        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={model.rows}
              margin={{ top: 10, right: 16, left: 4, bottom: 4 }}
            >
              <defs>
                <linearGradient id="drFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1d4ed8" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0.01} />
                </linearGradient>
                <linearGradient id="arFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#d97706" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#d97706" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="shortDate"
                interval={tickInterval}
                tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'IBM Plex Mono' }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={formatCompactCurrency}
                tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'IBM Plex Mono' }}
                axisLine={false}
                tickLine={false}
                width={62}
              />
              <Tooltip content={<BalanceTooltip showCents={showCents} />} />
              <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1} />
              {expirationLabel && (
                <ReferenceLine
                  x={expirationLabel}
                  stroke="#94a3b8"
                  strokeDasharray="4 4"
                />
              )}
              <Area
                type="monotone"
                dataKey="endDR"
                name="Ending Deferred Revenue"
                stroke="#1d4ed8"
                strokeWidth={2}
                fill="url(#drFill)"
              />
              <Area
                type="stepAfter"
                dataKey="endAR"
                name="Ending Accounts Receivable"
                stroke="#d97706"
                strokeWidth={2}
                fill="url(#arFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {model.summary.minDeferredRevenue < -0.005 && (
          <p className="mt-3 text-xs text-slate-500">
            Note: Under Monthly Billing with Exact Days recognition, 31-day months briefly earn slightly more GAAP revenue than 1/12th monthly billings, producing a minor temporary Unbilled Receivable (shown as negative Deferred Revenue) that reconciles to $0.00 by year end.
          </p>
        )}
      </section>
    </div>
  );
};
