import { defaultData } from "../data/defaults";
import { AppData, Asset, AssetType, BudgetPocket, FinancialTarget, InvestmentThesis, TargetAllocation, TargetType, Transaction, AssetStrategy, AssetStrategyMode, PortfolioRole } from "../types";
import { createId } from "./id";
import { createEmptyThesis } from "./thesis";

const STORAGE_KEY = "monthly-cashflow-tracker-v1";
const API_DATA_URL = "/api/data";

type ServerDataResponse = {
  exists: boolean;
  data: unknown;
  updatedAt: string | null;
};

export function loadData(): AppData {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultData;

  try {
    return normalizeData(JSON.parse(raw));
  } catch {
    return defaultData;
  }
}

export function normalizeData(value: unknown): AppData {
  const parsed = value && typeof value === "object" ? (value as Partial<AppData>) : {};
  const categories = Array.isArray(parsed.categories) && parsed.categories.length ? parsed.categories : defaultData.categories;

  return {
    transactions: Array.isArray(parsed.transactions) ? parsed.transactions.map(normalizeTransaction) : [],
    categories,
    budgetPockets: Array.isArray(parsed.budgetPockets) ? parsed.budgetPockets.map(normalizePocket) : [],
    assets: Array.isArray(parsed.assets) ? parsed.assets.map(normalizeAsset) : [],
    targets: Array.isArray(parsed.targets) ? parsed.targets.map(normalizeTarget) : [],
    settings: { ...defaultData.settings, ...(parsed.settings || {}) },
    theses: Array.isArray(parsed.theses) ? parsed.theses.map(normalizeThesis) : [],
    assetStrategy: normalizeAssetStrategy(parsed.assetStrategy),
  };
}

function normalizeAsset(value: Partial<Asset> | null | undefined): Asset {
  const now = new Date().toISOString();
  const allowedTypes: AssetType[] = ["Cash", "RDPU", "Saham", "Obligasi", "Deposito", "Reksa Dana", "Emas", "Crypto", "Other"];
  const type = allowedTypes.includes(value?.type as AssetType) ? (value?.type as AssetType) : "Other";

  const allowedRoles: PortfolioRole[] = ["Core", "Stabilizer", "Satellite", "Watchlist Only"];
  const sahamRole = allowedRoles.includes(value?.sahamRole as PortfolioRole) ? (value?.sahamRole as PortfolioRole) : undefined;

  return {
    id: value?.id || createId(),
    name: value?.name || "Aset Tanpa Nama",
    type,
    value: Number(value?.value || 0),
    targetId: value?.targetId || "",
    targetAllocations: normalizeTargetAllocations(value?.targetAllocations),
    thesisId: value?.thesisId || "",
    sahamRole,
    sahamSector: value?.sahamSector || "",
    notes: value?.notes || "",
    createdAt: value?.createdAt || now,
    updatedAt: value?.updatedAt || value?.createdAt || now,
    sharesCount: value?.sharesCount !== undefined && value.sharesCount !== null ? Number(value.sharesCount) : undefined,
    avgPurchasePrice: value?.avgPurchasePrice !== undefined && value.avgPurchasePrice !== null ? Number(value.avgPurchasePrice) : undefined,
    cashSourceType: value?.cashSourceType || "manual",
    cashSourceAccount: value?.cashSourceAccount || "",
    cashSourcePocketId: value?.cashSourcePocketId || "",
  };
}

function normalizeTransaction(value: Partial<Transaction> | null | undefined): Transaction {
  return {
    id: value?.id || createId(),
    date: value?.date || "",
    type: value?.type || "expense",
    category: value?.category || "",
    amount: Number(value?.amount || 0),
    pocketId: value?.pocketId || "",
    allocations: Array.isArray(value?.allocations)
      ? value.allocations
          .filter((allocation) => allocation && typeof allocation === "object")
          .map((allocation) => ({
            id: allocation.id || createId(),
            pocketId: allocation.pocketId || "",
            amount: Number(allocation.amount || 0),
          }))
      : [],
    account: value?.account || "",
    notes: value?.notes || "",
  };
}

function normalizePocket(value: Partial<BudgetPocket> | null | undefined): BudgetPocket {
  const now = new Date().toISOString();
  return {
    id: value?.id || createId(),
    name: value?.name || "Kantong Tanpa Nama",
    initialBalance: Number(value?.initialBalance || 0),
    monthlyTarget: Number(value?.monthlyTarget || 0),
    targetId: value?.targetId || "",
    targetAllocations: normalizeTargetAllocations(value?.targetAllocations),
    color: value?.color || "#0f9f9a",
    isArchived: Boolean(value?.isArchived),
    createdAt: value?.createdAt || now,
    updatedAt: value?.updatedAt || value?.createdAt || now,
  };
}

function normalizeTarget(value: Partial<FinancialTarget> | null | undefined): FinancialTarget {
  const now = new Date().toISOString();
  const targetAmount = Number(value?.targetAmount || 0);
  const currentAmount = Number(value?.currentAmount || 0);
  const targetTypes: TargetType[] = ["Wishlist", "Savings Goal", "Installment", "Debt Payoff", "Emergency Fund", "Other"];
  const type = targetTypes.includes(value?.type as TargetType) ? (value?.type as TargetType) : "Wishlist";

  return {
    id: value?.id || createId(),
    name: value?.name || "Target Tanpa Nama",
    type,
    targetAmount,
    currentAmount,
    targetDate: value?.targetDate || "",
    notes: value?.notes || "",
    color: value?.color || "#0f9f9a",
    isCompleted: Boolean(value?.isCompleted || (targetAmount > 0 && currentAmount >= targetAmount)),
    createdAt: value?.createdAt || now,
    updatedAt: value?.updatedAt || value?.createdAt || now,
  };
}

function normalizeTargetAllocations(value: Partial<TargetAllocation>[] | null | undefined): TargetAllocation[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((allocation) => allocation && typeof allocation === "object")
    .map((allocation) => ({
      id: allocation.id || createId(),
      targetId: allocation.targetId || "",
      amount: Number(allocation.amount || 0),
    }))
    .filter((allocation) => allocation.targetId && allocation.amount > 0);
}

function normalizeThesis(value: Partial<InvestmentThesis> | null | undefined): InvestmentThesis {
  const base = createEmptyThesis();
  if (!value || typeof value !== "object") return base;

  return {
    ...base,
    ...value,
    id: value.id || base.id,
    risks: Array.isArray(value.risks) ? value.risks : [],
    reviews: Array.isArray(value.reviews) ? value.reviews : [],
    decisions: Array.isArray(value.decisions) ? value.decisions : [],
    createdAt: value.createdAt || base.createdAt,
    updatedAt: value.updatedAt || value.createdAt || base.updatedAt,
  };
}

function normalizeAssetStrategy(value: any): AssetStrategy {
  const allowedModes: AssetStrategyMode[] = ["Free", "Membangun", "Konservatif", "Custom"];
  const mode = allowedModes.includes(value?.mode as AssetStrategyMode) ? (value.mode as AssetStrategyMode) : "Free";
  const customLimits = value?.customLimits && typeof value.customLimits === "object" ? { ...value.customLimits } : {};
  return { mode, customLimits };
}

export function saveData(data: AppData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function hasBrowserData(): boolean {
  return Boolean(localStorage.getItem(STORAGE_KEY));
}

export async function loadDataFromDatabase(): Promise<{ data: AppData; source: "database" | "browser" | "default" }> {
  const browserData = loadData();

  try {
    const response = await fetch(API_DATA_URL);
    if (!response.ok) throw new Error("Database lokal tidak merespons.");
    const result = (await response.json()) as ServerDataResponse;

    if (result.exists) {
      return { data: normalizeData(result.data), source: "database" };
    }

    if (hasBrowserData()) {
      await saveDataToDatabase(browserData);
      return { data: browserData, source: "browser" };
    }

    await saveDataToDatabase(defaultData);
    return { data: defaultData, source: "default" };
  } catch {
    return { data: browserData, source: hasBrowserData() ? "browser" : "default" };
  }
}

export async function saveDataToDatabase(data: AppData): Promise<boolean> {
  try {
    const response = await fetch(API_DATA_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("Gagal menyimpan ke database lokal.");
    return true;
  } catch {
    saveData(data);
    return false;
  }
}

export function clearData(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function downloadFile(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
