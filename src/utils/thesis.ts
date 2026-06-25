import {
  ConvictionLevel,
  CurrentDecision,
  EmotionCheck,
  InvestmentHorizon,
  InvestmentThesis,
  PortfolioRole,
  ReviewAction,
  ReviewFrequency,
  ReviewValidity,
  SyariahStatus,
  ThesisStatus,
  ThesisType,
} from "../types";
import { todayJakarta } from "./date";
import { createId } from "./id";

export const syariahStatuses: SyariahStatus[] = ["Not Checked", "DES", "Non-DES", "Need Recheck"];
export const thesisStatuses: ThesisStatus[] = [
  "Idea",
  "Researching",
  "Watchlist",
  "Ready to Buy",
  "Bought",
  "Monitoring",
  "Thesis Broken",
  "Closed",
];
export const portfolioRoles: PortfolioRole[] = ["Core", "Stabilizer", "Satellite", "Watchlist Only"];
export const thesisTypes: ThesisType[] = [
  "Dividend",
  "Defensive",
  "Growth",
  "Cyclical",
  "Turnaround",
  "Value",
  "Other",
];
export const investmentHorizons: InvestmentHorizon[] = ["1 Year", "3 Years", "5 Years", "10 Years"];
export const convictionLevels: ConvictionLevel[] = ["Low", "Medium", "High"];
export const reviewFrequencies: ReviewFrequency[] = ["Monthly", "Quarterly", "Semi-Annual", "Annual", "Event-Based"];
export const currentDecisions: CurrentDecision[] = ["No Action", "Watchlist", "Hold", "Add", "Reduce", "Sell", "Review"];
export const reviewValidities: ReviewValidity[] = ["Yes", "No", "Unclear"];
export const reviewActions: ReviewAction[] = ["No Action", "Hold", "Add", "Reduce", "Sell", "Review Again"];
export const emotionChecks: EmotionCheck[] = ["Calm", "FOMO", "Panic", "Greedy", "Confused"];

export function createEmptyThesis(): InvestmentThesis {
  const now = new Date().toISOString();
  return {
    id: createId(),
    ticker: "",
    companyName: "",
    sector: "",
    syariahStatus: "Not Checked",
    status: "Idea",
    portfolioRole: "Watchlist Only",
    thesisType: "Other",
    investmentHorizon: "3 Years",
    convictionLevel: "Medium",
    summary: "",
    businessQualityNotes: "",
    financialStrengthNotes: "",
    valuationNotes: "",
    portfolioFitNotes: "",
    currentPrice: 0,
    conservativeFairValue: 0,
    moderateFairValue: 0,
    requiredMarginOfSafety: 0,
    firstBuyPrice: 0,
    addPrice: 0,
    strongBuyPrice: 0,
    doNotBuyAbovePrice: 0,
    maxAllocation: 0,
    plannedCapital: 0,
    firstEntryPercent: 0,
    secondEntryPercent: 0,
    thirdEntryPercent: 0,
    entryNotes: "",
    risks: [],
    thesisWrongCriteria: "",
    stopAveragingDownCriteria: "",
    reviewSellReduceCriteria: "",
    lastReviewDate: "",
    nextReviewDate: "",
    reviewFrequency: "Quarterly",
    reviewNotes: "",
    currentDecision: "No Action",
    decisionReason: "",
    reviews: [],
    decisions: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function calculateMarginOfSafety(currentPrice: number, fairValue: number): number | null {
  if (!fairValue || fairValue <= 0) return null;
  return ((fairValue - currentPrice) / fairValue) * 100;
}

export function calculateEntryPlanAmounts(
  plannedCapital: number,
  entryPercentages: [number, number, number],
): [number, number, number] {
  return entryPercentages.map((percent) => (plannedCapital * percent) / 100) as [number, number, number];
}

export function calculateChecklistCompletion(thesis: InvestmentThesis) {
  const checks = [
    { label: "Ticker terisi", complete: Boolean(thesis.ticker.trim()) },
    { label: "Company name terisi", complete: Boolean(thesis.companyName.trim()) },
    { label: "Syariah status sudah dicek", complete: thesis.syariahStatus !== "Not Checked" },
    { label: "Portfolio role dipilih", complete: Boolean(thesis.portfolioRole) },
    { label: "Ringkasan tesis terisi", complete: Boolean(thesis.summary.trim()) },
    { label: "Catatan kualitas bisnis terisi", complete: Boolean(thesis.businessQualityNotes.trim()) },
    { label: "Risiko utama ditambahkan", complete: thesis.risks.some((risk) => risk.name.trim()) },
    { label: "Area beli terisi", complete: thesis.firstBuyPrice > 0 || thesis.addPrice > 0 || thesis.strongBuyPrice > 0 },
    { label: "Max allocation terisi", complete: thesis.maxAllocation > 0 },
    { label: "Kriteria tesis salah terisi", complete: Boolean(thesis.thesisWrongCriteria.trim()) },
    { label: "Alasan keputusan terisi", complete: Boolean(thesis.decisionReason.trim()) },
  ];
  const completed = checks.filter((check) => check.complete).length;
  return {
    checks,
    completed,
    total: checks.length,
    isReady: completed === checks.length,
  };
}

export function getThesisStatusBadge(status: ThesisStatus | ConvictionLevel | SyariahStatus): string {
  if (status === "Ready to Buy" || status === "DES" || status === "High") return "pill-good";
  if (status === "Thesis Broken" || status === "Non-DES") return "pill-bad";
  if (status === "Watchlist" || status === "Need Recheck") return "pill-warning";
  return "pill-neutral";
}

export function getOverdueReviews(theses: InvestmentThesis[], today = todayJakarta()): InvestmentThesis[] {
  const todayKey = today.toISOString().slice(0, 10);
  return theses.filter((thesis) => thesis.nextReviewDate && thesis.nextReviewDate < todayKey);
}

export function getThesesMissingKeyInformation(theses: InvestmentThesis[]): InvestmentThesis[] {
  return theses.filter((thesis) => !calculateChecklistCompletion(thesis).isReady);
}

export function getNeedsAttention(theses: InvestmentThesis[], today = todayJakarta()) {
  const overdue = new Set(getOverdueReviews(theses, today).map((thesis) => thesis.id));
  return theses.filter((thesis) => {
    const checklist = calculateChecklistCompletion(thesis);
    return (
      overdue.has(thesis.id) ||
      (thesis.status === "Ready to Buy" && !checklist.isReady) ||
      ((thesis.status === "Bought" || thesis.status === "Monitoring") && thesis.reviews.length === 0) ||
      thesis.syariahStatus === "Not Checked" ||
      thesis.syariahStatus === "Need Recheck"
    );
  });
}

export function validateThesis(thesis: InvestmentThesis): string[] {
  const errors: string[] = [];
  const entryTotal = thesis.firstEntryPercent + thesis.secondEntryPercent + thesis.thirdEntryPercent;
  if (!thesis.ticker.trim()) errors.push("Ticker wajib diisi.");
  if (!thesis.companyName.trim()) errors.push("Company name wajib diisi.");
  if (thesis.currentPrice < 0) errors.push("Current price tidak boleh negatif.");
  if (thesis.conservativeFairValue < 0 || thesis.moderateFairValue < 0) errors.push("Fair value tidak boleh negatif.");
  if (thesis.maxAllocation < 0 || thesis.maxAllocation > 100) errors.push("Max allocation harus 0 sampai 100%.");
  if (entryTotal > 100) errors.push("Total entry percentage tidak boleh lebih dari 100%.");
  if (thesis.plannedCapital < 0) errors.push("Planned capital tidak boleh negatif.");
  if (thesis.lastReviewDate && thesis.nextReviewDate && thesis.nextReviewDate < thesis.lastReviewDate) {
    errors.push("Next review date tidak boleh sebelum last review date.");
  }
  if (thesis.risks.some((risk) => !risk.name.trim())) errors.push("Risk name wajib diisi jika risiko ditambahkan.");
  return errors;
}

export function exportThesesToCSV(theses: InvestmentThesis[]): string {
  const headers = [
    "Ticker",
    "Company Name",
    "Status",
    "Portfolio Role",
    "Thesis Type",
    "Conviction",
    "Last Review",
    "Next Review",
    "Decision",
    "Updated At",
  ];
  const rows = theses.map((thesis) =>
    [
      thesis.ticker,
      thesis.companyName,
      thesis.status,
      thesis.portfolioRole,
      thesis.thesisType,
      thesis.convictionLevel,
      thesis.lastReviewDate,
      thesis.nextReviewDate,
      thesis.currentDecision,
      thesis.updatedAt,
    ]
      .map((value) => `"${String(value || "").replace(/"/g, '""')}"`)
      .join(","),
  );
  return [headers.join(","), ...rows].join("\n");
}
