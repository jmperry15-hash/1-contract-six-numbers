import React, { useMemo, useState } from 'react';
import { Check, Copy, Download, Search } from 'lucide-react';
import type { ModelResult } from '../types/fpa';
import { formatCurrency, generateWaterfallCsv } from '../lib/accountingEngine';

interface WaterfallTableProps {
  model: ModelResult;
  copiedCsv: boolean;
  onCopyCsv: () => void;
}

type TableFilter = 'all' | 'active' | 'billing' | 'runoff';

export const WaterfallTable: React.FC<WaterfallTableProps> = ({
  model,
  copiedCsv,
  onCopyCsv,
}) => {
  const [filter, setFilter] = useState<TableFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCents, setShowCents] = useState(false);

  const effectiveCents = showCents || model.inputs.revRecMethod === 'exact-days';

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return model.rows.filter((row) => {
      if (filter === 'active' && !row.isActive) return false;
      if (filter === 'billing' && row.billings === 0 && row.cashCollections === 0)
        return false;
      if (filter === 'runoff' && row.isActive) return false;

      if (q) {
        const hay =
          `${row.monthLabel} ${row.calendarLabel} ${row.calendarKey} y${row.contractYear ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [model.rows, filter, searchQuery]);

  const handleDownloadCsv = () => {
    const csv = generateWaterfallCsv(model);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const slug = model.inputs.scenarioName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    a.download = `ledgerline-${slug || 'saas-model'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderCell = (value: number, emphasize = false) => {
    if (Math.abs(value) < 0.005) {
      return <span className="text-slate-300">—</span>;
    }
    return (
      <span className={emphasize ? 'font-medium text-slate-900' : 'text-slate-700'}>
        {formatCurrency(value, effectiveCents)}
      </span>
    );
  };

  return (
    <section
      id="waterfall"
      className="bg-white border border-slate-200 rounded-lg overflow-hidden scroll-mt-20"
    >
      {/* Header & Controls */}
      <div className="p-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Monthly Financial Waterfall Schedule
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {model.summary.timelineMonths}-month roll-forward schedule · Ending AR and Deferred Revenue resolve to $0.00.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Segment Filter */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'active', label: 'Active' },
                { id: 'billing', label: 'Bill / Cash' },
                { id: 'runoff', label: 'Runoff' },
              ] as Array<{ id: TableFilter; label: string }>
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  filter === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter month..."
              aria-label="Filter waterfall table by month"
              className="w-32 sm:w-36 h-8 pl-8 pr-2.5 text-xs bg-white border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
          </div>

          {/* Cents toggle */}
          <button
            type="button"
            onClick={() => setShowCents((c) => !c)}
            className={`h-8 px-2.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
              effectiveCents
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:text-slate-900'
            }`}
          >
            .00 Cents
          </button>

          {/* Copy CSV */}
          <button
            type="button"
            onClick={onCopyCsv}
            className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap cursor-pointer"
          >
            {copiedCsv ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Copied for Sheets</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy CSV</span>
              </>
            )}
          </button>

          {/* Download CSV */}
          <button
            type="button"
            onClick={handleDownloadCsv}
            className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md transition-colors whitespace-nowrap cursor-pointer"
            title="Download CSV file"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download</span>
          </button>
        </div>
      </div>

      {/* Scrollable Data Grid */}
      <div className="overflow-x-auto max-h-[520px] overflow-y-auto ledger-scroll">
        <table className="w-full text-left border-collapse min-w-[1060px]">
          <thead className="sticky top-0 z-20 bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
            <tr>
              <th className="sticky left-0 z-30 bg-slate-50 py-2.5 pl-5 pr-3 border-r border-slate-200 whitespace-nowrap">
                Month
              </th>
              <th className="py-2.5 px-3 text-right whitespace-nowrap">Days</th>
              <th className="py-2.5 px-3 text-right whitespace-nowrap">Bookings</th>
              <th className="py-2.5 px-3 text-right whitespace-nowrap">ARR</th>
              <th className="py-2.5 px-3 text-right whitespace-nowrap">Billings</th>
              <th className="py-2.5 px-3 text-right whitespace-nowrap">Cash Coll.</th>
              <th className="py-2.5 px-3 text-right whitespace-nowrap">GAAP Rev.</th>
              <th className="py-2.5 px-3 text-right whitespace-nowrap border-l border-slate-200">
                Beg. AR
              </th>
              <th className="py-2.5 px-3 text-right whitespace-nowrap">End AR</th>
              <th className="py-2.5 px-3 text-right whitespace-nowrap border-l border-slate-200">
                Beg. DR
              </th>
              <th className="py-2.5 pl-3 pr-5 text-right whitespace-nowrap">End DR</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 text-xs font-mono tabular-nums">
            {filteredRows.length === 0 ? (
              <tr>
                <td
                  colSpan={11}
                  className="py-10 text-center font-sans text-sm text-slate-500"
                >
                  No months match the current filter. Clear the search query or switch back to All months.
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => {
                const isPostTermFirst =
                  row.monthIndex === model.inputs.termMonths + 1;
                return (
                  <tr
                    key={row.monthIndex}
                    className={`h-9 hover:bg-slate-50/90 transition-colors ${
                      !row.isActive ? 'bg-slate-50/40 text-slate-500' : 'bg-white'
                    } ${isPostTermFirst ? 'border-t-2 border-t-slate-300' : ''}`}
                  >
                    <td className="sticky left-0 z-10 bg-inherit py-2 pl-5 pr-3 border-r border-slate-200 whitespace-nowrap font-sans">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono font-medium text-slate-900">
                          {row.monthLabel}
                        </span>
                        <span className="text-slate-500 text-xs">
                          {row.calendarLabel}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right text-slate-400">
                      {row.daysInMonth}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {renderCell(row.bookings, row.bookings > 0)}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {renderCell(row.arr)}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {renderCell(row.billings, row.billings > 0)}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {row.cashCollections > 0 ? (
                        <span className="font-medium text-emerald-700">
                          {formatCurrency(row.cashCollections, effectiveCents)}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {renderCell(row.gaapRevenue)}
                    </td>
                    <td className="py-2 px-3 text-right border-l border-slate-100 text-slate-500">
                      {renderCell(row.begAR)}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {renderCell(row.endAR, row.endAR > 0)}
                    </td>
                    <td className="py-2 px-3 text-right border-l border-slate-100 text-slate-500">
                      {renderCell(row.begDR)}
                    </td>
                    <td className="py-2 pl-3 pr-5 text-right">
                      {renderCell(row.endDR, Math.abs(row.endDR) > 0.005)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          {/* Sticky Totals / Audit Tie-Out Footer */}
          <tfoot className="sticky bottom-0 z-20 bg-slate-900 text-white text-xs font-mono tabular-nums">
            <tr className="h-10">
              <td className="sticky left-0 z-30 bg-slate-900 py-2.5 pl-5 pr-3 border-r border-slate-700 font-sans font-semibold whitespace-nowrap">
                Total / Ending Balance
              </td>
              <td className="py-2.5 px-3 text-right text-slate-400">—</td>
              <td className="py-2.5 px-3 text-right font-semibold">
                {formatCurrency(model.summary.audit.totalBookings, effectiveCents)}
              </td>
              <td className="py-2.5 px-3 text-right text-slate-300">
                {formatCurrency(model.summary.peakArr, false)} pk
              </td>
              <td className="py-2.5 px-3 text-right font-semibold">
                {formatCurrency(model.summary.totalBilled, effectiveCents)}
              </td>
              <td className="py-2.5 px-3 text-right font-semibold text-emerald-300">
                {formatCurrency(model.summary.totalCollected, effectiveCents)}
              </td>
              <td className="py-2.5 px-3 text-right font-semibold">
                {formatCurrency(model.summary.totalRevenue, effectiveCents)}
              </td>
              <td className="py-2.5 px-3 text-right border-l border-slate-700 text-slate-400">
                $0
              </td>
              <td className="py-2.5 px-3 text-right font-semibold text-emerald-300">
                {formatCurrency(model.summary.audit.endingAR, true)}
              </td>
              <td className="py-2.5 px-3 text-right border-l border-slate-700 text-slate-400">
                $0
              </td>
              <td className="py-2.5 pl-3 pr-5 text-right font-semibold text-emerald-300">
                {formatCurrency(model.summary.audit.endingDR, true)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
};
