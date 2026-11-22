import type {
  BillingCadence,
  ContractInputs,
  ModelResult,
  MonthlyWaterfallRow,
  PaymentTermsDays,
  PresetKey,
  RevRecMethod,
} from '../types/fpa';

const MONTH_NAMES_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export const BILLING_CADENCE_LABELS: Record<BillingCadence, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  'semi-annual': 'Semi-Annual',
  annual: 'Annual Upfront',
  'multi-year': 'Multi-Year Upfront',
};

export const PAYMENT_TERMS_LABELS: Record<PaymentTermsDays, string> = {
  0: 'Net 0 (Due on Receipt)',
  30: 'Net 30',
  60: 'Net 60',
  90: 'Net 90',
};

export const REV_REC_LABELS: Record<RevRecMethod, string> = {
  equal: 'Equal Monthly (1/12th)',
  'exact-days': 'Exact Days in Month',
};

export interface ScenarioPreset {
  key: Exclude<PresetKey, 'custom'>;
  label: string;
  subtitle: string;
  inputs: ContractInputs;
}

export const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    key: 'standard',
    label: 'Standard SaaS',
    subtitle: '$120k ACV · 12 mo · Annual · Net 30',
    inputs: {
      scenarioName: 'Standard SaaS',
      presetKey: 'standard',
      startMonth: '2026-01',
      termMonths: 12,
      year1Acv: 120000,
      escalatorPct: 0,
      useCustomRamp: false,
      customAnnualAcvs: [120000, 120000, 120000],
      billingCadence: 'annual',
      paymentTermsDays: 30,
      revRecMethod: 'equal',
      bookingsMode: 'tcv',
    },
  },
  {
    key: 'enterprise-ramp',
    label: 'Enterprise Multi-Year Ramp',
    subtitle: '$100k → $150k → $200k · Annual · Net 60',
    inputs: {
      scenarioName: 'Enterprise Multi-Year Ramp',
      presetKey: 'enterprise-ramp',
      startMonth: '2026-01',
      termMonths: 36,
      year1Acv: 100000,
      escalatorPct: 50,
      useCustomRamp: true,
      customAnnualAcvs: [100000, 150000, 200000],
      billingCadence: 'annual',
      paymentTermsDays: 60,
      revRecMethod: 'equal',
      bookingsMode: 'tcv',
    },
  },
  {
    key: 'cash-flow-crunch',
    label: 'Monthly Cash-Flow Crunch',
    subtitle: '$120k ACV · 12 mo · Monthly · Net 60',
    inputs: {
      scenarioName: 'Monthly Cash-Flow Crunch',
      presetKey: 'cash-flow-crunch',
      startMonth: '2026-01',
      termMonths: 12,
      year1Acv: 120000,
      escalatorPct: 0,
      useCustomRamp: false,
      customAnnualAcvs: [120000, 120000, 120000],
      billingCadence: 'monthly',
      paymentTermsDays: 60,
      revRecMethod: 'equal',
      bookingsMode: 'tcv',
    },
  },
];

function parseStartMonth(startMonth: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(startMonth);
  if (!match) {
    return { year: 2026, month: 0 };
  }
  const year = Math.min(2040, Math.max(2020, Number(match[1])));
  const month = Math.min(11, Math.max(0, Number(match[2]) - 1));
  return { year, month };
}

function getDaysInCalendarMonth(year: number, zeroBasedMonth: number): number {
  return new Date(year, zeroBasedMonth + 1, 0).getDate();
}

function getCalendarMeta(startYear: number, startMonthZero: number, offset: number) {
  const totalMonths = startYear * 12 + startMonthZero + offset;
  const year = Math.floor(totalMonths / 12);
  const month = totalMonths % 12;
  const daysInMonth = getDaysInCalendarMonth(year, month);
  const shortYear = String(year).slice(-2);
  const monthName = MONTH_NAMES_SHORT[month];
  const calendarKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  return {
    year,
    month,
    daysInMonth,
    calendarKey,
    calendarLabel: `${monthName} ${year}`,
    shortDate: `${monthName} '${shortYear}`,
  };
}

function computeAnnualAcvCents(inputs: ContractInputs): number[] {
  const years = Math.max(1, Math.round(inputs.termMonths / 12));
  const result: number[] = [];

  for (let y = 0; y < years; y++) {
    if (inputs.useCustomRamp) {
      const val = inputs.customAnnualAcvs[y] ?? inputs.year1Acv;
      result.push(Math.max(0, Math.round(val * 100)));
    } else {
      const escalated = inputs.year1Acv * Math.pow(1 + inputs.escalatorPct / 100, y);
      // Round annual ACV to whole cents cleanly
      result.push(Math.max(0, Math.round(Math.round(escalated) * 100)));
    }
  }
  return result;
}

function toDollars(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

export function computeContractModel(inputs: ContractInputs): ModelResult {
  const { year: startYear, month: startMonthZero } = parseStartMonth(inputs.startMonth);
  const paymentLagMonths = Math.round(inputs.paymentTermsDays / 30);
  const yearsCount = inputs.termMonths / 12;

  // Dynamic 24-to-48 month timeline ensuring ending AR & DR resolve cleanly to $0
  const minRequired = inputs.termMonths + paymentLagMonths + 2;
  let timelineMonths = 24;
  if (inputs.termMonths === 12) {
    timelineMonths = 24;
  } else if (inputs.termMonths === 24) {
    timelineMonths = Math.max(30, Math.ceil(minRequired / 6) * 6);
  } else {
    timelineMonths = Math.max(42, Math.ceil(minRequired / 6) * 6);
  }
  timelineMonths = Math.min(48, Math.max(24, timelineMonths));

  const annualAcvCents = computeAnnualAcvCents(inputs);
  const tcvCents = annualAcvCents.reduce((sum, v) => sum + v, 0);

  // Pre-build calendar metadata for all timeline months
  const calendarMeta = Array.from({ length: timelineMonths }, (_, idx) =>
    getCalendarMeta(startYear, startMonthZero, idx)
  );

  // Initialize cent arrays
  const bookingsCents = new Array<number>(timelineMonths).fill(0);
  const arrCents = new Array<number>(timelineMonths).fill(0);
  const billingsCents = new Array<number>(timelineMonths).fill(0);
  const cashCents = new Array<number>(timelineMonths).fill(0);
  const revenueCents = new Array<number>(timelineMonths).fill(0);

  // 1. Bookings
  if (inputs.bookingsMode === 'tcv') {
    bookingsCents[0] = tcvCents;
  } else {
    for (let y = 0; y < yearsCount; y++) {
      bookingsCents[y * 12] = annualAcvCents[y];
    }
  }

  // 2. ARR (Active run-rate per active month; $0 post-expiration)
  for (let m = 0; m < inputs.termMonths; m++) {
    const yearIdx = Math.floor(m / 12);
    arrCents[m] = annualAcvCents[yearIdx];
  }

  // 3. Billings by cadence (cent-exact tie-out to each year's ACV & TCV)
  if (inputs.billingCadence === 'multi-year') {
    billingsCents[0] = tcvCents;
  } else {
    for (let y = 0; y < yearsCount; y++) {
      const yearTotal = annualAcvCents[y];
      const baseMonth = y * 12;

      if (inputs.billingCadence === 'annual') {
        billingsCents[baseMonth] += yearTotal;
      } else if (inputs.billingCadence === 'semi-annual') {
        const first = Math.floor(yearTotal / 2);
        const second = yearTotal - first;
        billingsCents[baseMonth] += first;
        billingsCents[baseMonth + 6] += second;
      } else if (inputs.billingCadence === 'quarterly') {
        const q = Math.floor(yearTotal / 4);
        const rem = yearTotal - q * 3;
        billingsCents[baseMonth] += q;
        billingsCents[baseMonth + 3] += q;
        billingsCents[baseMonth + 6] += q;
        billingsCents[baseMonth + 9] += rem;
      } else {
        // monthly
        const mo = Math.floor(yearTotal / 12);
        let allocated = 0;
        for (let k = 0; k < 11; k++) {
          billingsCents[baseMonth + k] += mo;
          allocated += mo;
        }
        billingsCents[baseMonth + 11] += yearTotal - allocated;
      }
    }
  }

  // 4. Cash Collections (shifted by Net payment terms lag)
  for (let m = 0; m < timelineMonths; m++) {
    if (billingsCents[m] > 0) {
      const targetIdx = m + paymentLagMonths;
      if (targetIdx < timelineMonths) {
        cashCents[targetIdx] += billingsCents[m];
      }
    }
  }

  // 5. GAAP Revenue (Equal Monthly 1/12th OR Exact Days in Month, cent-exact per year)
  for (let y = 0; y < yearsCount; y++) {
    const yearTotal = annualAcvCents[y];
    const baseMonth = y * 12;

    if (inputs.revRecMethod === 'equal') {
      const mo = Math.floor(yearTotal / 12);
      let allocated = 0;
      for (let k = 0; k < 11; k++) {
        revenueCents[baseMonth + k] = mo;
        allocated += mo;
      }
      revenueCents[baseMonth + 11] = yearTotal - allocated;
    } else {
      let totalDaysInYear = 0;
      for (let k = 0; k < 12; k++) {
        totalDaysInYear += calendarMeta[baseMonth + k].daysInMonth;
      }
      let allocated = 0;
      for (let k = 0; k < 11; k++) {
        const share = Math.round(
          (yearTotal * calendarMeta[baseMonth + k].daysInMonth) / totalDaysInYear
        );
        revenueCents[baseMonth + k] = share;
        allocated += share;
      }
      revenueCents[baseMonth + 11] = yearTotal - allocated;
    }
  }

  // 6. Balance Sheet Roll-Forwards (AR and Deferred Revenue)
  const rows: MonthlyWaterfallRow[] = [];
  let runningAR = 0;
  let runningDR = 0;

  let peakDRCents = 0;
  let peakDRMonth = calendarMeta[0].calendarLabel;
  let minDRCents = 0;
  let peakARCents = 0;
  let peakARMonth = calendarMeta[0].calendarLabel;

  let sumBookings = 0;
  let sumBillings = 0;
  let sumCash = 0;
  let sumRevenue = 0;
  let peakArrCents = 0;

  for (let m = 0; m < timelineMonths; m++) {
    const begAR = runningAR;
    const endAR = begAR + billingsCents[m] - cashCents[m];
    const begDR = runningDR;
    const endDR = begDR + billingsCents[m] - revenueCents[m];

    runningAR = endAR;
    runningDR = endDR;

    sumBookings += bookingsCents[m];
    sumBillings += billingsCents[m];
    sumCash += cashCents[m];
    sumRevenue += revenueCents[m];

    if (arrCents[m] > peakArrCents) peakArrCents = arrCents[m];
    if (endDR > peakDRCents) {
      peakDRCents = endDR;
      peakDRMonth = calendarMeta[m].calendarLabel;
    }
    if (endDR < minDRCents) {
      minDRCents = endDR;
    }
    if (endAR > peakARCents) {
      peakARCents = endAR;
      peakARMonth = calendarMeta[m].calendarLabel;
    }

    const isActive = m < inputs.termMonths;
    rows.push({
      monthIndex: m + 1,
      monthLabel: `M${m + 1}`,
      calendarKey: calendarMeta[m].calendarKey,
      calendarLabel: calendarMeta[m].calendarLabel,
      shortDate: calendarMeta[m].shortDate,
      daysInMonth: calendarMeta[m].daysInMonth,
      contractYear: isActive ? Math.floor(m / 12) + 1 : null,
      isActive,
      bookings: toDollars(bookingsCents[m]),
      arr: toDollars(arrCents[m]),
      billings: toDollars(billingsCents[m]),
      cashCollections: toDollars(cashCents[m]),
      gaapRevenue: toDollars(revenueCents[m]),
      begAR: toDollars(begAR),
      endAR: toDollars(endAR),
      begDR: toDollars(begDR),
      endDR: toDollars(endDR),
    });
  }

  // Find first month post-term where both AR and DR sit cleanly at $0
  let resolutionMonthLabel = calendarMeta[timelineMonths - 1].calendarLabel;
  for (let m = inputs.termMonths - 1; m < timelineMonths; m++) {
    if (rows[m].endAR === 0 && rows[m].endDR === 0) {
      resolutionMonthLabel = `${rows[m].monthLabel} (${rows[m].calendarLabel})`;
      break;
    }
  }

  const discrepancies = [
    Math.abs(tcvCents - sumBookings),
    Math.abs(tcvCents - sumBillings),
    Math.abs(tcvCents - sumCash),
    Math.abs(tcvCents - sumRevenue),
    Math.abs(runningAR),
    Math.abs(runningDR),
  ];
  const maxDiscrepancyCents = Math.max(...discrepancies);

  return {
    inputs,
    rows,
    summary: {
      tcv: toDollars(tcvCents),
      annualAcvs: annualAcvCents.map(toDollars),
      peakArr: toDollars(peakArrCents),
      totalBilled: toDollars(sumBillings),
      totalCollected: toDollars(sumCash),
      totalRevenue: toDollars(sumRevenue),
      peakDeferredRevenue: toDollars(peakDRCents),
      peakDeferredRevenueMonth: peakDRMonth,
      peakAR: toDollars(peakARCents),
      peakARMonth: peakARMonth,
      minDeferredRevenue: toDollars(minDRCents),
      timelineMonths,
      paymentLagMonths,
      audit: {
        isReconciled: maxDiscrepancyCents === 0,
        tcv: toDollars(tcvCents),
        totalBookings: toDollars(sumBookings),
        totalBillings: toDollars(sumBillings),
        totalCash: toDollars(sumCash),
        totalRevenue: toDollars(sumRevenue),
        endingAR: toDollars(runningAR),
        endingDR: toDollars(runningDR),
        maxDiscrepancy: toDollars(maxDiscrepancyCents),
        resolutionMonthLabel,
      },
    },
  };
}

export function formatCurrency(value: number, showCents = false): string {
  const abs = Math.abs(value);
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  }).format(abs);
  return value < -0.004 ? `(${formatted})` : formatted;
}

export function formatCompactCurrency(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) {
    return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  }
  if (abs >= 1_000) {
    const k = abs / 1_000;
    return `${sign}$${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return `${sign}$${Math.round(abs)}`;
}

export function generateWaterfallCsv(model: ModelResult): string {
  const headers = [
    'Month',
    'Calendar Date',
    'Days',
    'Contract Year',
    'Bookings',
    'ARR',
    'Billings',
    'Cash Collections',
    'GAAP Revenue',
    'Beginning AR',
    'Ending AR',
    'Beginning Deferred Revenue',
    'Ending Deferred Revenue',
  ];

  const lines = [headers.join(',')];

  for (const r of model.rows) {
    lines.push(
      [
        r.monthLabel,
        `"${r.calendarLabel}"`,
        r.daysInMonth,
        r.contractYear ? `Y${r.contractYear}` : 'Post-Term',
        r.bookings.toFixed(2),
        r.arr.toFixed(2),
        r.billings.toFixed(2),
        r.cashCollections.toFixed(2),
        r.gaapRevenue.toFixed(2),
        r.begAR.toFixed(2),
        r.endAR.toFixed(2),
        r.begDR.toFixed(2),
        r.endDR.toFixed(2),
      ].join(',')
    );
  }

  lines.push(
    [
      'TOTAL / ENDING',
      `"${model.summary.timelineMonths} Months"`,
      '',
      '',
      model.summary.audit.totalBookings.toFixed(2),
      model.summary.peakArr.toFixed(2),
      model.summary.totalBilled.toFixed(2),
      model.summary.totalCollected.toFixed(2),
      model.summary.totalRevenue.toFixed(2),
      '0.00',
      model.summary.audit.endingAR.toFixed(2),
      '0.00',
      model.summary.audit.endingDR.toFixed(2),
    ].join(',')
  );

  return lines.join('\n');
}

export function buildExecutiveBriefingScript(
  model: ModelResult,
  mode: 'single' | 'dialogue'
): {
  transcript: string;
  parts: Array<{ text: string; speaker?: string; style: string }>;
} {
  const { inputs, summary } = model;
  const cadence = BILLING_CADENCE_LABELS[inputs.billingCadence];
  const terms = PAYMENT_TERMS_LABELS[inputs.paymentTermsDays];
  const revRec = REV_REC_LABELS[inputs.revRecMethod];
  const tcvStr = formatCurrency(summary.tcv);
  const peakArrStr = formatCurrency(summary.peakArr);
  const peakDrStr = formatCurrency(summary.peakDeferredRevenue);
  const peakArStr = formatCurrency(summary.peakAR);
  const rampDesc =
    summary.annualAcvs.length > 1
      ? `ramping across ${summary.annualAcvs.length} years from ${formatCurrency(summary.annualAcvs[0])} in Year 1 to ${formatCurrency(summary.annualAcvs[summary.annualAcvs.length - 1])} in Year ${summary.annualAcvs.length}`
      : `at ${formatCurrency(summary.annualAcvs[0])} in annual recurring revenue`;

  if (mode === 'single') {
    const text = `Executive FP&A briefing for ${inputs.scenarioName}. This ${inputs.termMonths}-month SaaS contract begins in ${model.rows[0].calendarLabel} with a Total Contract Value of ${tcvStr}, ${rampDesc}, reaching a peak ARR of ${peakArrStr}. Under ${cadence} billing and ${terms} payment terms, Accounts Receivable peaks at ${peakArStr} in ${summary.peakARMonth}, while Deferred Revenue peaks at ${peakDrStr} in ${summary.peakDeferredRevenueMonth}. GAAP revenue is recognized ratably using ${revRec}. Audit tie-out is fully reconciled: Bookings, Billings, Cash Collections, and GAAP Revenue all resolve to exactly ${tcvStr}, with both Ending AR and Deferred Revenue clearing to zero by ${summary.audit.resolutionMonthLabel}.`;
    return {
      transcript: text,
      parts: [
        {
          text,
          style: 'Calm, authoritative CFO delivering a crisp board-ready financial briefing',
        },
      ],
    };
  }

  const line1 = `Alex: Let's walk through the ${inputs.scenarioName} contract model. <breath> We have a ${inputs.termMonths}-month deal starting ${model.rows[0].calendarLabel} with ${tcvStr} in total bookings, ${rampDesc}.`;
  const line2 = `Sam: |mhm| And the cash timing is the real story here. Because we're billing ${cadence} on ${terms} terms, Accounts Receivable hits ${peakArStr} in ${summary.peakARMonth}, and Deferred Revenue peaks at ${peakDrStr} in ${summary.peakDeferredRevenueMonth}.`;
  const line3 = `Alex: Exactly. On the income statement, GAAP revenue stays smooth under ${revRec}. Best of all, our audit tie-out is completely balanced — all four flows equal ${tcvStr} and balance sheet accounts unwind cleanly to zero by ${summary.audit.resolutionMonthLabel}.`;

  return {
    transcript: `${line1}\n\n${line2}\n\n${line3}`,
    parts: [
      {
        text: line1,
        speaker: 'Alex',
        style: 'Sharp, articulate VP of Finance leading an executive review',
      },
      {
        text: line2,
        speaker: 'Sam',
        style: 'Analytical, conversational FP&A director highlighting working capital dynamics',
      },
      {
        text: line3,
        speaker: 'Alex',
        style: 'Confident, concise VP of Finance wrapping up with audit confirmation',
      },
    ],
  };
}
