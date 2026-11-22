export type ContractTermMonths = 12 | 24 | 36;

export type BillingCadence =
  | 'monthly'
  | 'quarterly'
  | 'semi-annual'
  | 'annual'
  | 'multi-year';

export type PaymentTermsDays = 0 | 30 | 60 | 90;

export type RevRecMethod = 'equal' | 'exact-days';

export type BookingsMode = 'tcv' | 'annual';

export type PresetKey = 'standard' | 'enterprise-ramp' | 'cash-flow-crunch' | 'custom';

export interface ContractInputs {
  scenarioName: string;
  presetKey: PresetKey;
  startMonth: string; // YYYY-MM
  termMonths: ContractTermMonths;
  year1Acv: number; // Whole dollars
  escalatorPct: number; // 0 to 50
  useCustomRamp: boolean;
  customAnnualAcvs: [number, number, number]; // Y1, Y2, Y3 in dollars
  billingCadence: BillingCadence;
  paymentTermsDays: PaymentTermsDays;
  revRecMethod: RevRecMethod;
  bookingsMode: BookingsMode;
}

export interface MonthlyWaterfallRow {
  monthIndex: number; // 1-indexed (1..N)
  monthLabel: string; // "M1"
  calendarKey: string; // "2026-01"
  calendarLabel: string; // "Jan 2026"
  shortDate: string; // "Jan '26"
  daysInMonth: number;
  contractYear: number | null; // 1, 2, 3 during active term; null post-expiration
  isActive: boolean;
  bookings: number;
  arr: number;
  billings: number;
  cashCollections: number;
  gaapRevenue: number;
  begAR: number;
  endAR: number;
  begDR: number;
  endDR: number;
}

export interface AuditTieOut {
  isReconciled: boolean;
  tcv: number;
  totalBookings: number;
  totalBillings: number;
  totalCash: number;
  totalRevenue: number;
  endingAR: number;
  endingDR: number;
  maxDiscrepancy: number;
  resolutionMonthLabel: string;
}

export interface ModelSummary {
  tcv: number;
  annualAcvs: number[];
  peakArr: number;
  totalBilled: number;
  totalCollected: number;
  totalRevenue: number;
  peakDeferredRevenue: number;
  peakDeferredRevenueMonth: string;
  peakAR: number;
  peakARMonth: string;
  minDeferredRevenue: number; // Detects temporary unbilled contract asset under exact-days monthly billing
  timelineMonths: number;
  paymentLagMonths: number;
  audit: AuditTieOut;
}

export interface ModelResult {
  inputs: ContractInputs;
  rows: MonthlyWaterfallRow[];
  summary: ModelSummary;
}

export type GeminiChatModel =
  | 'gemini-4-hydrogen'
  | 'gemini-3.1-flash-lite'
  | 'gemini-4-neon'
  | 'gemini-4-carbon';

export interface ProposedScenarioPatch {
  scenarioName?: string;
  startMonth?: string;
  termMonths?: ContractTermMonths;
  year1Acv?: number;
  escalatorPct?: number;
  useCustomRamp?: boolean;
  customAnnualAcvs?: [number, number, number];
  billingCadence?: BillingCadence;
  paymentTermsDays?: PaymentTermsDays;
  revRecMethod?: RevRecMethod;
  bookingsMode?: BookingsMode;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  modelUsed?: GeminiChatModel;
  timestamp: string;
  proposedScenario?: ProposedScenarioPatch;
}

export interface ExtractedContractAnalysis {
  customerName: string;
  contractSummary: string;
  startMonth: string;
  termMonths: ContractTermMonths;
  year1Acv: number;
  escalatorPct: number;
  useCustomRamp: boolean;
  customAnnualAcvs: [number, number, number];
  billingCadence: BillingCadence;
  paymentTermsDays: PaymentTermsDays;
  revRecMethod: RevRecMethod;
  keyClauses: string[];
  accountingNotes: string[];
}
