export type TransactionType = "income" | "expense";

export type Category = {
  id: string;
  name: string;
  type: TransactionType;
  isDefault?: boolean;
};

export type Transaction = {
  id: string;
  date: string;
  type: TransactionType;
  category: string;
  amount: number;
  pocketId?: string;
  allocations?: IncomeAllocation[];
  account?: string;
  notes?: string;
};

export type Settings = {
  monthlyIncomeTarget: number;
  monthlyExpenseTarget: number;
  currency: "IDR";
  deepseekApiKey?: string;
  deepseekApiKeys?: string[];
  twelveDataApiKey?: string;
  stockProvider?: "yahoo" | "twelvedata";
  autoSyncInterval?: number;
  autoScanInterval?: number;
  autoScanEnabled?: boolean;
  theme?: "light" | "dark";
};

export interface AutoScanAlert {
  id: number;
  timestamp: string;
  symbol: string;
  price: number;
  changePercent: number;
  marketRegime: string;
  algoSignal: string;
  score: number;
  deepseekRecommendation: Record<string, any>;
  createdAt: string;
}


export type AppData = {
  transactions: Transaction[];
  categories: Category[];
  budgetPockets: BudgetPocket[];
  assets: Asset[];
  targets: FinancialTarget[];
  settings: Settings;
  theses: InvestmentThesis[];
  assetStrategy?: AssetStrategy;
};

export type MonthlySummary = {
  month: string;
  totalIncome: number;
  totalExpense: number;
  netCashflow: number;
  expenseRatio: number;
  remainingMoney: number;
  biggestExpenseCategory: string;
  transactionCount: number;
};

export type BudgetPocket = {
  id: string;
  name: string;
  initialBalance: number;
  monthlyTarget: number;
  targetId?: string;
  targetAllocations?: TargetAllocation[];
  color: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type IncomeAllocation = {
  id: string;
  pocketId: string;
  amount: number;
};

export type TargetAllocation = {
  id: string;
  targetId: string;
  amount: number;
};

export type TargetType = "Wishlist" | "Savings Goal" | "Installment" | "Debt Payoff" | "Emergency Fund" | "Other";

export type FinancialTarget = {
  id: string;
  name: string;
  type: TargetType;
  targetAmount: number;
  currentAmount: number;
  targetDate?: string;
  notes?: string;
  color: string;
  isCompleted: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AssetType = "Cash" | "RDPU" | "Saham" | "Obligasi" | "Deposito" | "Reksa Dana" | "Emas" | "Crypto" | "Other";

export type Asset = {
  id: string;
  name: string;
  type: AssetType;
  value: number;
  targetId?: string;
  targetAllocations?: TargetAllocation[];
  thesisId?: string;
  sahamRole?: PortfolioRole;
  sahamSector?: string;
  notes?: string;
  updatedAt: string;
  createdAt: string;
  sharesCount?: number;
  avgPurchasePrice?: number;
  cashSourceType?: "manual" | "account" | "pocket" | "all-pockets" | "remaining-money";
  cashSourceAccount?: string;
  cashSourcePocketId?: string;
};

export type SyariahStatus = "Not Checked" | "DES" | "Non-DES" | "Need Recheck";
export type ThesisStatus =
  | "Idea"
  | "Researching"
  | "Watchlist"
  | "Ready to Buy"
  | "Bought"
  | "Monitoring"
  | "Thesis Broken"
  | "Closed";
export type PortfolioRole = "Core" | "Stabilizer" | "Satellite" | "Watchlist Only";
export type ThesisType = "Dividend" | "Defensive" | "Growth" | "Cyclical" | "Turnaround" | "Value" | "Other";
export type InvestmentHorizon = "1 Year" | "3 Years" | "5 Years" | "10 Years";
export type ConvictionLevel = "Low" | "Medium" | "High";
export type RiskLevel = "Low" | "Medium" | "High";
export type ReviewFrequency = "Monthly" | "Quarterly" | "Semi-Annual" | "Annual" | "Event-Based";
export type CurrentDecision = "No Action" | "Watchlist" | "Hold" | "Add" | "Reduce" | "Sell" | "Review";
export type ReviewValidity = "Yes" | "No" | "Unclear";
export type ReviewAction = "No Action" | "Hold" | "Add" | "Reduce" | "Sell" | "Review Again";
export type EmotionCheck = "Calm" | "FOMO" | "Panic" | "Greedy" | "Confused";
export type DecisionStatus = "Open" | "Reviewed" | "Good Decision" | "Bad Decision" | "Neutral";

export type ThesisRisk = {
  id: string;
  name: string;
  impact: RiskLevel;
  probability: RiskLevel;
  mitigation: string;
};

export type ThesisReview = {
  id: string;
  reviewDate: string;
  whatChanged: string;
  thesisStillValid: ReviewValidity;
  action: ReviewAction;
  reason: string;
  emotionCheck: EmotionCheck;
  nextReviewDate: string;
};

export type ThesisDecision = {
  id: string;
  date: string;
  ticker: string;
  decision: CurrentDecision;
  amount?: number;
  price?: number;
  reason: string;
  risk: string;
  expectedOutcome: string;
  actualOutcome: string;
  status: DecisionStatus;
};

export type FundamentalMetric = {
  year: string;
  revenue: number;
  netProfit: number;
  eps: number;
  roe: number;
  der: number;
  pe?: number;
  pbv?: number;
};

export type InvestmentThesis = {
  id: string;
  ticker: string;
  companyName: string;
  fundamentalMetrics?: FundamentalMetric[];
  sector: string;
  syariahStatus: SyariahStatus;
  status: ThesisStatus;
  portfolioRole: PortfolioRole;
  thesisType: ThesisType;
  investmentHorizon: InvestmentHorizon;
  convictionLevel: ConvictionLevel;
  summary: string;
  businessQualityNotes: string;
  financialStrengthNotes: string;
  valuationNotes: string;
  portfolioFitNotes: string;
  currentPrice: number;
  conservativeFairValue: number;
  moderateFairValue: number;
  requiredMarginOfSafety: number;
  firstBuyPrice: number;
  addPrice: number;
  strongBuyPrice: number;
  doNotBuyAbovePrice: number;
  maxAllocation: number;
  plannedCapital: number;
  firstEntryPercent: number;
  secondEntryPercent: number;
  thirdEntryPercent: number;
  entryNotes: string;
  risks: ThesisRisk[];
  thesisWrongCriteria: string;
  stopAveragingDownCriteria: string;
  reviewSellReduceCriteria: string;
  lastReviewDate: string;
  nextReviewDate: string;
  reviewFrequency: ReviewFrequency;
  reviewNotes: string;
  currentDecision: CurrentDecision;
  decisionReason: string;
  reviews: ThesisReview[];
  decisions: ThesisDecision[];
  createdAt: string;
  updatedAt: string;
};

export type AssetStrategyMode = "Free" | "Membangun" | "Konservatif" | "Custom";

export type AssetStrategy = {
  mode: AssetStrategyMode;
  customLimits: { [key in AssetType]?: number };
};

export interface TechnicalMetrics {
  symbol: string;
  name: string;
  price: number;
  prevClose: number;
  changePercent: number;
  currency: string;
  sector: string;
  rsi: number;
  macd: { macd: number; signal: number; hist: number };
  sma50: number;
  sma200: number;
  supports: number[];
  resistances: number[];
  nearestSupport: number | null;
  nearestResistance: number | null;
  poc?: number;
  volumeProfile?: Array<{ price: number; volume: number }>;
  kmeansLevels?: Array<{ support: number; resistance: number }>;
  adx?: number;
  plusDi?: number;
  minusDi?: number;
  stochasticK?: number;
  stochasticD?: number;
  bbUpper?: number;
  bbLower?: number;
  bbMid?: number;
  atr?: number;
  trailingStop?: number;
  vix?: number;
  sp500Correlation?: number;
  marketRegime?: string;
  algoSignal: "BUY" | "SELL" | "HOLD" | "AVOID";
  algoReason: string;
  score?: number;
  confidence?: "low" | "medium" | "high";
  riskReward?: number;
  candidateRankScore?: number;
  rank?: number;
  screeningStatus?: "passed" | "rejected" | "warning";
  rejectionReason?: string | null;
  fundamentalSource?: "yfinance" | "twelve_data" | "thesis" | "unavailable";
  fundamentalAsOf?: string | null;
  fundamentalFreshness?: "fresh" | "statement_fresh" | "manual" | "stale" | "unavailable";
  fundamentalScore?: number;
  fundamentalStatus?: "healthy" | "caution" | "critical" | "unavailable";
  fundamentalWarnings?: string[];
  fundamentalRedFlags?: string[];
  targetProfit1?: number;
  targetProfit2?: number;
  stopLoss?: number;
  entryRange?: { low: number; high: number };
  backtestStatus?: "available" | "unavailable" | "no_trades" | "insufficient_trades" | "failed";
  backtestSummary?: {
    total_return: number;
    cagr: number;
    win_rate: number;
    average_gain: number;
    average_loss: number;
    profit_factor: number;
    max_drawdown: number;
    number_of_trades: number;
    average_holding_period: number;
    expectancy: number;
    false_breakout_count: number;
    recent_stability_score: number;
  };
  entryStatus?: "valid_entry_area" | "wait_for_pullback" | "watch_reversal_confirmation" | "invalid_entry";
  chartPoints?: Array<{
    date: string;
    close: number;
    high: number;
    low: number;
    rsi: number;
    macd: number;
    macdSignal: number;
    macdHist: number;
    atr?: number;
    trailingStop?: number;
    bbUpper?: number;
    bbLower?: number;
    bbMid?: number;
    stochK?: number;
    stochD?: number;
  }>;
  success: boolean;
  error?: string;
}
