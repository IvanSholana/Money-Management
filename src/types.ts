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
  candidate_id?: string;
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

export interface DividendEvent {
  id: string;
  ticker: string;
  ticker_yahoo?: string;
  company_name?: string;
  action_type: string;
  dividend_per_share: number;
  announcement_date?: string;
  cum_date_regular?: string;
  ex_date_regular?: string;
  cum_date_cash?: string;
  ex_date_cash?: string;
  recording_date?: string;
  payment_date?: string;
  source_name?: string;
  source_url?: string;
  raw_text?: string;
  raw_html?: string;
  confidence_score: number;
  verification_status: "collected" | "auto_verified" | "needs_review" | "rejected" | "manually_verified" | "stale";
  parser_warnings: string[];
  validation_errors: string[];
  created_at?: string;
  updated_at?: string;
  last_collected_at?: string;
}

export interface DividendCollectionResult {
  status: string;
  source_results: Array<{ source: string; status: string; warnings: string[]; errors: string[] }>;
  collected_count: number;
  inserted_count: number;
  updated_count: number;
  duplicate_count: number;
  rejected_count: number;
  needs_review_count: number;
  warnings: string[];
  errors: string[];
}

export interface DividendMomentumCandidate {
  ticker: string;
  ticker_yahoo: string;
  company_name: string;
  dividend_per_share: number;
  current_price: number;
  dividend_yield_percent: number;
  announcement_date?: string;
  cum_date_regular: string;
  ex_date_regular: string;
  recording_date?: string;
  payment_date?: string;
  days_to_cum: number;
  days_to_ex: number;
  price_return_since_announcement: number;
  price_return_5d: number;
  price_return_10d: number;
  volume_ratio_20d: number;
  distance_to_ma20_percent: number;
  historical_runup_score: number;
  ex_date_drop_risk_score: number;
  fundamental_quality_score: number;
  syariah_status: string;
  final_score: number;
  final_status: "AVOID" | "WATCH" | "DIVIDEND_MOMENTUM_CANDIDATE" | "HIGH_CONVICTION_RUN_UP";
  score_components: Record<string, number>;
  entry_plan: string;
  exit_plan: string;
  warnings: string[];
  rejection_reasons: string[];
  source_name: string;
  source_url?: string;
  verification_status: string;
  confidence_score: number;
}

export interface OrderBookRow {
  price: number;
  volume: number;
}

export interface OrderBookSnapshot {
  ticker: string;
  page_url?: string;
  last_price?: number;
  best_bid_price?: number;
  best_offer_price?: number;
  spread_ticks?: number;
  spread_percent?: number;
  bid_rows: OrderBookRow[];
  offer_rows: OrderBookRow[];
  timestamp_read: string;
  read_confidence: number;
  parser_warnings: string[];
}

export interface ExecutionEvaluation {
  ticker: string;
  execution_status: "EXECUTION_OK" | "AVOID_EXECUTION" | "MANUAL_REVIEW" | "CANDIDATE_NOT_FOUND";
  execution_score: number;
  orderbook_metrics: Record<string, any>;
  execution_reasons: string[];
  execution_warnings: string[];
  suggested_action: string;
  manual_only: boolean;
  stale_snapshot: boolean;
}

export interface DeepSeekExecutionReview {
  ai_execution_status: "EXECUTION_OK" | "AVOID_EXECUTION" | "MANUAL_REVIEW";
  ai_confidence: number;
  summary: string;
  execution_risks: string[];
  supporting_factors: string[];
  blocking_factors: string[];
  manual_checklist: string[];
  final_note: string;
}

export interface OrderBookConfirmResult {
  status: "success" | "failed";
  snapshot_id?: string;
  review_id?: string;
  snapshot?: OrderBookSnapshot;
  evaluation?: ExecutionEvaluation;
  error?: string;
  message?: string;
}


