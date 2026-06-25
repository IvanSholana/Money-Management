import { useMemo, useState } from "react";
import { Boxes, ChevronDown, ChevronRight, Link2, Pencil, Plus, Trash2, TrendingUp, Wallet, PiggyBank, BarChart3, Landmark, Gem, Bitcoin, CircleDot, ShieldCheck, AlertCircle, CheckCircle2, RefreshCw, Loader2 } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from "framer-motion";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { CurrencyInput } from "../components/CurrencyInput";
import { MetricCard } from "../components/MetricCard";
import { Asset, AssetType, FinancialTarget, InvestmentThesis, TargetAllocation, AssetStrategy, AssetStrategyMode, PortfolioRole, Settings as AppSettings, BudgetPocket, Transaction } from "../types";
import { formatIDR, calculateMonthlySummary } from "../utils/finance";
import { createId } from "../utils/id";
import { sumTargetAllocations } from "../utils/targetAllocations";
import { calculatePocketMonthSummary } from "../utils/pockets";

const commonSectors = [
  "Perbankan",
  "Keuangan",
  "Konsumer",
  "Teknologi",
  "Kesehatan / Farmasi",
  "Infrastruktur",
  "Energi / Tambang",
  "Material Dasar",
  "Properti",
  "Transportasi",
  "Industri",
  "Lainnya"
];

const assetTypeVisuals: Record<string, { color: string; gradient: string; bg: string; icon: typeof Wallet }> = {
  Cash:        { color: "#10b981", gradient: "from-emerald-500 to-green-400", bg: "bg-emerald-50", icon: Wallet },
  RDPU:        { color: "#0f9f9a", gradient: "from-teal to-cyan-400",        bg: "bg-teal-50",    icon: ShieldCheck },
  Saham:       { color: "#2f6fed", gradient: "from-blue-500 to-indigo-500",  bg: "bg-blue-50",    icon: TrendingUp },
  Obligasi:    { color: "#8b5cf6", gradient: "from-violet-500 to-purple-500", bg: "bg-violet-50",  icon: Landmark },
  Deposito:    { color: "#f59e0b", gradient: "from-amber-500 to-yellow-400", bg: "bg-amber-50",   icon: PiggyBank },
  "Reksa Dana":{ color: "#06b6d4", gradient: "from-cyan-500 to-sky-400",    bg: "bg-cyan-50",    icon: BarChart3 },
  Emas:        { color: "#d97706", gradient: "from-yellow-500 to-amber-400", bg: "bg-yellow-50",  icon: Gem },
  Crypto:      { color: "#e11d48", gradient: "from-rose-500 to-pink-500",   bg: "bg-rose-50",    icon: Bitcoin },
  Other:       { color: "#64748b", gradient: "from-slate-500 to-gray-400",   bg: "bg-slate-100",  icon: CircleDot },
};

function getAssetVisual(type: string) {
  return assetTypeVisuals[type] || assetTypeVisuals["Other"];
}

function MoneyTooltipAsset({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl border border-white/70 dark:border-slate-800 bg-white/95 dark:bg-slate-900/90 px-3.5 py-2.5 text-sm shadow-soft backdrop-blur">
      <p className="font-black text-navy">{d.name}</p>
      <p className="text-xs font-semibold text-slate-500 mt-0.5">{d.formatted} ({d.percent.toFixed(1)}%)</p>
    </div>
  );
}

type AssetsProps = {
  assets: Asset[];
  targets: FinancialTarget[];
  theses: InvestmentThesis[];
  assetStrategy: AssetStrategy;
  onAssetsChange: (assets: Asset[]) => void;
  onStrategyChange: (strategy: AssetStrategy) => void;
  onThesesChange: (theses: InvestmentThesis[]) => void;
  onSyncComplete?: (assets: Asset[], theses: InvestmentThesis[]) => void;
  settings: AppSettings;
  pockets?: BudgetPocket[];
  transactions?: Transaction[];
  selectedMonth?: string;
};

function getLimitForType(type: AssetType, strategy: AssetStrategy): number | null {
  if (strategy.mode === "Free") return null;
  if (strategy.mode === "Membangun") {
    return type === "Saham" ? 20 : null;
  }
  if (strategy.mode === "Konservatif") {
    return type === "Saham" ? 10 : null;
  }
  if (strategy.mode === "Custom") {
    const lim = strategy.customLimits?.[type];
    return lim && lim > 0 ? lim : null;
  }
  return null;
}

function validateAllocationLimit(
  draftType: AssetType,
  draftValue: number,
  draftId: string | null,
  assets: Asset[],
  strategy: AssetStrategy,
  existingAssetForMerge?: Asset
): { valid: boolean; message?: string } {
  const limit = getLimitForType(draftType, strategy);
  if (limit === null) return { valid: true };

  const isEdit = Boolean(draftId);
  const oldAsset = isEdit ? assets.find((a) => a.id === draftId) : null;

  let valDiffForType = 0;
  let totalValDiff = 0;

  if (isEdit && oldAsset) {
    if (oldAsset.type !== draftType) {
      valDiffForType = draftValue;
      totalValDiff = draftValue - oldAsset.value;
    } else {
      valDiffForType = draftValue - oldAsset.value;
      totalValDiff = draftValue - oldAsset.value;
    }
  } else if (existingAssetForMerge) {
    valDiffForType = draftValue;
    totalValDiff = draftValue;
  } else {
    valDiffForType = draftValue;
    totalValDiff = draftValue;
  }

  if (valDiffForType > 0) {
    const totalAssetsValue = assets.reduce((sum, a) => sum + a.value, 0);
    const totalTypeAssetsValue = assets
      .filter((a) => a.type === draftType)
      .reduce((sum, a) => sum + a.value, 0);

    let newTypeTotal = totalTypeAssetsValue;
    let newGrandTotal = totalAssetsValue;

    if (isEdit && oldAsset) {
      if (oldAsset.type !== draftType) {
        newTypeTotal = totalTypeAssetsValue + draftValue;
        newGrandTotal = totalAssetsValue + draftValue - oldAsset.value;
      } else {
        newTypeTotal = totalTypeAssetsValue + (draftValue - oldAsset.value);
        newGrandTotal = totalAssetsValue + (draftValue - oldAsset.value);
      }
    } else {
      newTypeTotal = totalTypeAssetsValue + draftValue;
      newGrandTotal = totalAssetsValue + draftValue;
    }

    const newPercentage = newGrandTotal > 0 ? (newTypeTotal / newGrandTotal) * 100 : 0;

    if (newPercentage > limit) {
      const modeName =
        strategy.mode === "Membangun"
          ? "Mode Membangun"
          : strategy.mode === "Konservatif"
          ? "Mode Konservatif"
          : "Kustom";
      return {
        valid: false,
        message: `Gagal menyimpan: Batasan alokasi terlampaui. Menambahkan/mengubah aset ini akan membuat persentase ${draftType} menjadi ${newPercentage.toFixed(
          1
        )}%, melebihi batas maksimal ${limit}% dalam '${modeName}'.`,
      };
    }
  }

  return { valid: true };
}

const assetTypes: AssetType[] = ["Cash", "RDPU", "Saham", "Obligasi", "Deposito", "Reksa Dana", "Emas", "Crypto", "Other"];

const emptyDraft = {
  id: "",
  name: "",
  type: "RDPU" as AssetType,
  value: "",
  targetId: "",
  targetAllocations: [] as Array<{ id: string; targetId: string; amount: string }>,
  thesisId: "",
  sahamRole: "Core" as PortfolioRole,
  sahamSector: "",
  notes: "",
  sharesCount: "",
  avgPurchasePrice: "",
  cashSourceType: "manual" as "manual" | "account" | "pocket" | "all-pockets" | "remaining-money",
  cashSourceAccount: "",
  cashSourcePocketId: "",
};

function getTargetName(targets: FinancialTarget[], targetId?: string) {
  return targets.find((target) => target.id === targetId)?.name || "Tidak dialokasikan";
}

function getTargetAllocationLabel(targets: FinancialTarget[], allocations: TargetAllocation[] | undefined, targetId?: string, value = 0) {
  if (allocations?.length) {
    return allocations
      .map((allocation) => `${getTargetName(targets, allocation.targetId)}: ${formatIDR(allocation.amount)}`)
      .join(", ");
  }
  return targetId ? `${getTargetName(targets, targetId)}: ${formatIDR(value)}` : "Tidak dialokasikan";
}

function getThesisName(theses: InvestmentThesis[], thesisId?: string) {
  const thesis = theses.find((item) => item.id === thesisId);
  if (!thesis) return "Tidak terhubung";
  return `${thesis.ticker || "-"} · ${thesis.companyName || "Tanpa nama"}`;
}

export function Assets({
  assets,
  targets,
  theses,
  assetStrategy,
  onAssetsChange,
  onStrategyChange,
  onThesesChange,
  onSyncComplete,
  settings,
  pockets = [],
  transactions = [],
  selectedMonth = "",
}: AssetsProps) {
  const [draft, setDraft] = useState(emptyDraft);
  const [subTab, setSubTab] = useState<"summary" | "manage" | "strategy" | "stocks">("summary");
  const [message, setMessage] = useState("");
  const [assetToDelete, setAssetToDelete] = useState<Asset | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  function calculateAccountBalance(txs: Transaction[], accountName: string): number {
    let balance = 0;
    const target = accountName.toLowerCase();
    txs.forEach((tx) => {
      if (tx.account && tx.account.toLowerCase() === target) {
        if (tx.type === "income") {
          balance += tx.amount;
        } else if (tx.type === "expense") {
          balance -= tx.amount;
        }
      }
    });
    return balance;
  }

  const uniqueAccounts = useMemo(() => {
    const accounts = new Set<string>();
    transactions.forEach((tx) => {
      if (tx.account) {
        const trimmed = tx.account.trim();
        if (trimmed) accounts.add(trimmed);
      }
    });
    return Array.from(accounts);
  }, [transactions]);

  const computedAssets = useMemo(() => {
    return assets.map((asset) => {
      if (asset.type !== "Cash" || !asset.cashSourceType || asset.cashSourceType === "manual") {
        return asset;
      }
      let val = asset.value;
      if (asset.cashSourceType === "all-pockets") {
        const pSummary = calculatePocketMonthSummary(transactions, pockets, selectedMonth);
        val = pSummary.pockets.reduce((sum, p) => sum + p.availableBalance, 0);
      } else if (asset.cashSourceType === "pocket" && asset.cashSourcePocketId) {
        const pSummary = calculatePocketMonthSummary(transactions, pockets, selectedMonth);
        const p = pSummary.pockets.find((item) => item.pocket.id === asset.cashSourcePocketId);
        val = p ? p.availableBalance : 0;
      } else if (asset.cashSourceType === "account" && asset.cashSourceAccount) {
        val = calculateAccountBalance(transactions, asset.cashSourceAccount);
      } else if (asset.cashSourceType === "remaining-money") {
        const mSummary = calculateMonthlySummary(transactions, selectedMonth);
        val = mSummary.remainingMoney;
      }
      return {
        ...asset,
        value: val,
      };
    });
  }, [assets, transactions, pockets, selectedMonth]);

  async function syncStockPrices() {
    const tickers = Array.from(
      new Set(
        theses
          .map((t) => t.ticker)
          .filter(Boolean)
      )
    ) as string[];

    if (tickers.length === 0) {
      setMessage("Tidak ada ticker saham yang valid di Tesis Investasi untuk disinkronisasi.");
      return;
    }

    setIsSyncing(true);
    setMessage("");

    try {
      const activeProvider = settings.stockProvider || "yahoo";
      let updatedQuotes: Record<string, { price: number; name?: string; sector?: string }> = {};

      if (activeProvider === "twelvedata" && settings.twelveDataApiKey) {
        const csvTickers = tickers.join(",");
        const res = await fetch(`https://api.twelvedata.com/quote?symbol=${encodeURIComponent(csvTickers)}&apikey=${encodeURIComponent(settings.twelveDataApiKey)}`);
        if (res.ok) {
          const json = await res.json();
          if (tickers.length === 1) {
            const sym = tickers[0];
            if (json.close || json.price) {
              updatedQuotes[sym] = {
                price: Number(json.close || json.price),
                name: json.name,
              };
            }
          } else {
            for (const sym of tickers) {
              const q = json[sym];
              if (q && (q.close || q.price)) {
                updatedQuotes[sym] = {
                  price: Number(q.close || q.price),
                  name: q.name,
                };
              }
            }
          }
        }
      } else {
        const res = await fetch("/api/yahoo/sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ symbols: tickers }),
        });

        if (res.ok) {
          const json = await res.json();
          if (json.quotes) {
            for (const [sym, q] of Object.entries(json.quotes)) {
              if (q) {
                const quote = q as any;
                updatedQuotes[sym] = {
                  price: quote.price,
                  name: quote.name,
                  sector: quote.sector,
                };
              }
            }
          }
        }
      }

      const now = new Date().toISOString();
      const nextAssets = assets.map((a) => {
        if (a.type === "Saham" && a.thesisId) {
          const thesis = theses.find((t) => t.id === a.thesisId);
          if (thesis && thesis.ticker && updatedQuotes[thesis.ticker]) {
            const q = updatedQuotes[thesis.ticker];
            const nextValue = a.sharesCount ? (a.sharesCount * q.price) : a.value;
            return {
              ...a,
              value: nextValue,
              updatedAt: now,
            };
          }
        }
        return a;
      });

      const nextTheses = theses.map((t) => {
        if (t.ticker && updatedQuotes[t.ticker]) {
          const q = updatedQuotes[t.ticker];
          return {
            ...t,
            currentPrice: q.price,
            companyName: q.name || t.companyName,
            sector: q.sector || t.sector,
            updatedAt: now,
          };
        }
        return t;
      });

      // Use atomic combined update to avoid race condition
      if (onSyncComplete) {
        onSyncComplete(nextAssets, nextTheses);
      } else {
        onAssetsChange(nextAssets);
        onThesesChange(nextTheses);
      }
      setMessage("Harga saham berhasil diperbarui!");
    } catch (err: any) {
      console.error("Gagal sinkronisasi harga saham:", err);
      setMessage("Gagal memperbarui harga saham. Periksa koneksi internet.");
    } finally {
      setIsSyncing(false);
    }
  }

  const sahamAssets = useMemo(() => computedAssets.filter((asset) => asset.type === "Saham"), [computedAssets]);
  const totalSaham = useMemo(() => sahamAssets.reduce((sum, a) => sum + a.value, 0), [sahamAssets]);

  const portfolioBreakdown = useMemo(() => {
    const breakdown: Record<
      string,
      {
        total: number;
        sectors: Record<
          string,
          {
            total: number;
            assets: Asset[];
          }
        >;
        types: Record<string, number>;
        assets: Asset[];
      }
    > = {
      Core: { total: 0, sectors: {}, types: {}, assets: [] },
      Stabilizer: { total: 0, sectors: {}, types: {}, assets: [] },
      Satellite: { total: 0, sectors: {}, types: {}, assets: [] },
      "Watchlist Only": { total: 0, sectors: {}, types: {}, assets: [] },
      "Tanpa Peran": { total: 0, sectors: {}, types: {}, assets: [] },
    };

    sahamAssets.forEach((asset) => {
      const thesis = theses.find((t) => t.id === asset.thesisId);
      const role = asset.sahamRole || (thesis ? thesis.portfolioRole : "Tanpa Peran");
      const sector = asset.sahamSector || (thesis && thesis.sector ? thesis.sector.trim() : "Tanpa Sektor");
      const type = thesis ? thesis.thesisType : "Tanpa Tipe";

      const roleKey = role || "Tanpa Peran";
      if (!breakdown[roleKey]) {
        breakdown[roleKey] = { total: 0, sectors: {}, types: {}, assets: [] };
      }

      breakdown[roleKey].total += asset.value;
      breakdown[roleKey].assets.push(asset);

      const sectorKey = sector || "Tanpa Sektor";
      if (!breakdown[roleKey].sectors[sectorKey]) {
        breakdown[roleKey].sectors[sectorKey] = { total: 0, assets: [] };
      }
      breakdown[roleKey].sectors[sectorKey].total += asset.value;
      breakdown[roleKey].sectors[sectorKey].assets.push(asset);

      breakdown[roleKey].types[type] = (breakdown[roleKey].types[type] || 0) + asset.value;
    });

    return breakdown;
  }, [sahamAssets, theses]);
  const [filters, setFilters] = useState({
    search: "",
    type: "all",
    targetId: "all",
    thesis: "all",
    sort: "updated-desc",
  });

  const summary = useMemo(() => {
    const totalAssets = computedAssets.reduce((sum, asset) => sum + asset.value, 0);
    const allocatedToTargets = computedAssets.reduce((sum, asset) => {
      if (asset.targetAllocations?.length) return sum + Math.min(asset.value, sumTargetAllocations(asset.targetAllocations));
      return sum + (asset.targetId ? asset.value : 0);
    }, 0);
    const byType = assetTypes
      .map((type) => ({
        type,
        value: computedAssets.filter((asset) => asset.type === type).reduce((sum, asset) => sum + asset.value, 0),
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);

    return {
      totalAssets,
      allocatedToTargets,
      unallocated: totalAssets - allocatedToTargets,
      byType,
    };
  }, [computedAssets]);

  const filteredAssets = useMemo(() => {
    const search = filters.search.trim().toLowerCase();

    return computedAssets
      .filter((asset) => {
        const targetText = getTargetAllocationLabel(targets, asset.targetAllocations, asset.targetId, asset.value).toLowerCase();
        const thesisText = getThesisName(theses, asset.thesisId).toLowerCase();
        const matchesSearch =
          !search ||
          asset.name.toLowerCase().includes(search) ||
          asset.type.toLowerCase().includes(search) ||
          (asset.notes || "").toLowerCase().includes(search) ||
          targetText.includes(search) ||
          thesisText.includes(search);

        const matchesType = filters.type === "all" || asset.type === filters.type;
        const matchesTarget =
          filters.targetId === "all" ||
          (filters.targetId === "unallocated" && !asset.targetId && !asset.targetAllocations?.length) ||
          asset.targetId === filters.targetId ||
          Boolean(asset.targetAllocations?.some((allocation) => allocation.targetId === filters.targetId));
        const matchesThesis =
          filters.thesis === "all" ||
          (filters.thesis === "linked" && Boolean(asset.thesisId)) ||
          (filters.thesis === "unlinked" && !asset.thesisId);

        return matchesSearch && matchesType && matchesTarget && matchesThesis;
      })
      .sort((a, b) => {
        if (filters.sort === "value-desc") return b.value - a.value;
        if (filters.sort === "value-asc") return a.value - b.value;
        if (filters.sort === "name-asc") return a.name.localeCompare(b.name);
        return b.updatedAt.localeCompare(a.updatedAt);
      });
  }, [computedAssets, filters, targets, theses]);

  function resetDraft() {
    setDraft(emptyDraft);
  }

  function saveAsset() {
    const name = draft.name.trim();
    const value = Number(draft.value || 0);

    if (!name) {
      setMessage("Nama aset wajib diisi.");
      return;
    }

    if (!Number.isFinite(value) || value < 0) {
      setMessage("Nilai aset tidak valid.");
      return;
    }

    const draftAllocations = draft.targetAllocations
      .map((allocation) => ({
        id: allocation.id || createId(),
        targetId: allocation.targetId,
        amount: Number(allocation.amount || 0),
      }))
      .filter((allocation) => allocation.targetId && allocation.amount > 0);
    const allocatedAmount = sumTargetAllocations(draftAllocations);

    if (allocatedAmount > value) {
      setMessage("Total alokasi target tidak boleh melebihi nilai aset.");
      return;
    }

    const now = new Date().toISOString();
    const isEdit = Boolean(draft.id);

    if (!isEdit) {
      // 1. Check for Auto-Merge
      const existing = assets.find(
        (asset) => asset.name.toLowerCase() === name.toLowerCase() && asset.type === draft.type
      );

      if (existing) {
        // Validate limit first
        const limitCheck = validateAllocationLimit(draft.type, value, null, computedAssets, assetStrategy, existing);
        if (!limitCheck.valid) {
          setMessage(limitCheck.message || "Batas alokasi terlampaui.");
          return;
        }

        const new_value = existing.value + value;

        // Merge target allocations
        const existingAllocations = existing.targetAllocations || [];
        const mergedAllocations = [...existingAllocations];
        for (const draftAlloc of draftAllocations) {
          const match = mergedAllocations.find((a) => a.targetId === draftAlloc.targetId);
          if (match) {
            match.amount += draftAlloc.amount;
          } else {
            mergedAllocations.push({
              id: createId(),
              targetId: draftAlloc.targetId,
              amount: draftAlloc.amount,
            });
          }
        }

        // Verify merged allocations don't exceed new value
        if (sumTargetAllocations(mergedAllocations) > new_value) {
          setMessage("Gagal menggabungkan: total alokasi target gabungan melebihi nilai aset gabungan.");
          return;
        }

        const mergedNotes = [existing.notes, draft.notes.trim()].filter(Boolean).join("\n");
        const mergedSharesCount = draft.type === "Saham" ? ((existing.sharesCount || 0) + Number(draft.sharesCount || 0)) : undefined;
        const mergedAvgPrice = draft.type === "Saham" && mergedSharesCount && mergedSharesCount > 0
          ? (((existing.avgPurchasePrice || 0) * (existing.sharesCount || 0) + Number(draft.avgPurchasePrice || 0) * Number(draft.sharesCount || 0)) / mergedSharesCount)
          : undefined;

        const updatedAsset: Asset = {
          ...existing,
          value: new_value,
          targetAllocations: mergedAllocations,
          notes: mergedNotes,
          updatedAt: now,
          sharesCount: mergedSharesCount,
          avgPurchasePrice: mergedAvgPrice,
        };

        onAssetsChange(assets.map((item) => (item.id === existing.id ? updatedAsset : item)));
        setMessage(`Aset "${name}" sudah ada. Nilai ditambahkan dari ${formatIDR(existing.value)} menjadi ${formatIDR(new_value)}.`);
        resetDraft();
        return;
      } else {
        // Standard insert
        const limitCheck = validateAllocationLimit(draft.type, value, null, computedAssets, assetStrategy);
        if (!limitCheck.valid) {
          setMessage(limitCheck.message || "Batas alokasi terlampaui.");
          return;
        }

        const asset: Asset = {
          id: createId(),
          name,
          type: draft.type,
          value,
          targetId: "",
          targetAllocations: draftAllocations,
          thesisId: draft.type === "Saham" ? draft.thesisId : "",
          sahamRole: draft.type === "Saham" ? draft.sahamRole : undefined,
          sahamSector: draft.type === "Saham" ? draft.sahamSector : "",
          notes: draft.notes.trim(),
          createdAt: now,
          updatedAt: now,
          sharesCount: draft.type === "Saham" ? (Number(draft.sharesCount) || undefined) : undefined,
          avgPurchasePrice: draft.type === "Saham" ? (Number(draft.avgPurchasePrice) || undefined) : undefined,
          cashSourceType: draft.type === "Cash" ? draft.cashSourceType : undefined,
          cashSourceAccount: draft.type === "Cash" ? draft.cashSourceAccount : undefined,
          cashSourcePocketId: draft.type === "Cash" ? draft.cashSourcePocketId : undefined,
        };

        onAssetsChange([asset, ...assets]);
        setMessage("Aset baru berhasil ditambahkan.");
        resetDraft();
        return;
      }
    } else {
      // 2. Edit existing asset
      // Check duplicate name & type with other assets
      const duplicate = assets.find(
        (asset) =>
          asset.id !== draft.id &&
          asset.name.toLowerCase() === name.toLowerCase() &&
          asset.type === draft.type
      );
      if (duplicate) {
        setMessage(`Sudah ada aset lain bernama "${name}" dengan jenis ${draft.type}. Silakan gunakan nama lain.`);
        return;
      }

      // Validate limit
      const limitCheck = validateAllocationLimit(draft.type, value, draft.id, computedAssets, assetStrategy);
      if (!limitCheck.valid) {
        setMessage(limitCheck.message || "Batas alokasi terlampaui.");
        return;
      }

      const previousAsset = assets.find((asset) => asset.id === draft.id);
      const asset: Asset = {
        id: draft.id,
        name,
        type: draft.type,
        value,
        targetId: "",
        targetAllocations: draftAllocations,
        thesisId: draft.type === "Saham" ? draft.thesisId : "",
        sahamRole: draft.type === "Saham" ? draft.sahamRole : undefined,
        sahamSector: draft.type === "Saham" ? draft.sahamSector : "",
        notes: draft.notes.trim(),
        createdAt: previousAsset?.createdAt || now,
        updatedAt: now,
        sharesCount: draft.type === "Saham" ? (Number(draft.sharesCount) || undefined) : undefined,
        avgPurchasePrice: draft.type === "Saham" ? (Number(draft.avgPurchasePrice) || undefined) : undefined,
        cashSourceType: draft.type === "Cash" ? draft.cashSourceType : undefined,
        cashSourceAccount: draft.type === "Cash" ? draft.cashSourceAccount : undefined,
        cashSourcePocketId: draft.type === "Cash" ? draft.cashSourcePocketId : undefined,
      };

      onAssetsChange(assets.map((item) => (item.id === draft.id ? asset : item)));
      setMessage("Aset berhasil diperbarui.");
      resetDraft();
    }
  }

  function editAsset(asset: Asset) {
    setDraft({
      id: asset.id,
      name: asset.name,
      type: asset.type,
      value: String(asset.value || ""),
      targetId: asset.targetId || "",
      targetAllocations: asset.targetAllocations?.length
        ? asset.targetAllocations.map((allocation) => ({
            id: allocation.id,
            targetId: allocation.targetId,
            amount: String(allocation.amount || ""),
          }))
        : asset.targetId
          ? [{ id: createId(), targetId: asset.targetId, amount: String(asset.value || "") }]
          : [],
      thesisId: asset.thesisId || "",
      sahamRole: asset.sahamRole || "Core",
      sahamSector: asset.sahamSector || "",
      notes: asset.notes || "",
      sharesCount: asset.sharesCount ? String(asset.sharesCount) : "",
      avgPurchasePrice: asset.avgPurchasePrice ? String(asset.avgPurchasePrice) : "",
      cashSourceType: asset.cashSourceType || "manual",
      cashSourceAccount: asset.cashSourceAccount || "",
      cashSourcePocketId: asset.cashSourcePocketId || "",
    });
    setSubTab("manage");
    setMessage("");
  }

  function confirmDeleteAsset() {
    if (!assetToDelete) return;
    onAssetsChange(assets.filter((asset) => asset.id !== assetToDelete.id));
    setAssetToDelete(null);
    setMessage("Aset sudah dihapus.");
  }

  return (
    <>
      <div className="grid gap-5">
        <section className="hero-card flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-teal">Asset allocation</p>
            <h2 className="section-title">Aset & Alokasi Target</h2>
            <p className="text-sm text-slate-500">
              Catat aset seperti RDPU, saham, deposito, dan hubungkan ke target yang sedang kamu kejar.
            </p>
          </div>
          <div className="rounded-2xl bg-teal/10 px-4 py-3 text-sm font-bold text-navy">
            {computedAssets.length} aset tercatat
          </div>
        </section>

        {/* Sub-tab Navigation */}
        <div className="flex flex-wrap gap-1.5 rounded-2xl bg-slate-100/80 dark:bg-slate-900/60 p-1 w-fit shadow-inner border border-slate-200/50 dark:border-slate-800/60 relative z-0">
          <button
            type="button"
            onClick={() => setSubTab("summary")}
            className={`relative min-h-9 px-4 py-1.5 rounded-xl text-xs font-black transition-all duration-300 outline-none ${
              subTab === "summary" ? "text-navy dark:text-slate-200 z-10" : "text-slate-500 hover:text-navy dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-800/40"
            }`}
          >
            {subTab === "summary" && (
              <motion.div
                layoutId="activeSubTab"
                className="absolute inset-0 rounded-xl bg-white dark:bg-slate-800 shadow-sm border border-slate-200/40 dark:border-slate-700/50 z-[-1]"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            Ringkasan Aset
          </button>
          <button
            type="button"
            onClick={() => setSubTab("manage")}
            className={`relative min-h-9 px-4 py-1.5 rounded-xl text-xs font-black transition-all duration-300 outline-none ${
              subTab === "manage" ? "text-navy dark:text-slate-200 z-10" : "text-slate-500 hover:text-navy dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-800/40"
            }`}
          >
            {subTab === "manage" && (
              <motion.div
                layoutId="activeSubTab"
                className="absolute inset-0 rounded-xl bg-white dark:bg-slate-800 shadow-sm border border-slate-200/40 dark:border-slate-700/50 z-[-1]"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            Kelola Aset
          </button>
          <button
            type="button"
            onClick={() => setSubTab("strategy")}
            className={`relative min-h-9 px-4 py-1.5 rounded-xl text-xs font-black transition-all duration-300 outline-none ${
              subTab === "strategy" ? "text-navy dark:text-slate-200 z-10" : "text-slate-500 hover:text-navy dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-800/40"
            }`}
          >
            {subTab === "strategy" && (
              <motion.div
                layoutId="activeSubTab"
                className="absolute inset-0 rounded-xl bg-white dark:bg-slate-800 shadow-sm border border-slate-200/40 dark:border-slate-700/50 z-[-1]"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            Atur Strategi
          </button>
          {totalSaham > 0 && (
            <button
              type="button"
              onClick={() => setSubTab("stocks")}
              className={`relative min-h-9 px-4 py-1.5 rounded-xl text-xs font-black transition-all duration-300 outline-none ${
                subTab === "stocks" ? "text-navy dark:text-slate-200 z-10" : "text-slate-500 hover:text-navy dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-800/40"
              }`}
            >
              {subTab === "stocks" && (
                <motion.div
                  layoutId="activeSubTab"
                  className="absolute inset-0 rounded-xl bg-white dark:bg-slate-800 shadow-sm border border-slate-200/40 dark:border-slate-700/50 z-[-1]"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              Analisis Saham
            </button>
          )}
        </div>

        {/* Tab Contents */}
        <AnimatePresence mode="wait">
          {subTab === "summary" && (
            <motion.div
              key="summary"
              initial={{ opacity: 0, y: 15, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              {(() => {
                const chartData = summary.byType.map((item) => ({
                  name: item.type,
                  value: item.value,
                  formatted: formatIDR(item.value),
                  percent: summary.totalAssets > 0 ? (item.value / summary.totalAssets) * 100 : 0,
                  color: getAssetVisual(item.type).color,
                }));
                const topAssets = [...computedAssets].sort((a, b) => b.value - a.value).slice(0, 5);
                const allocatedPercent = summary.totalAssets > 0 ? (summary.allocatedToTargets / summary.totalAssets) * 100 : 0;

                return (
                  <div className="grid gap-5">
                    {/* Metric Cards */}
                    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <MetricCard label="Total Aset" value={formatIDR(summary.totalAssets)} tone="good" index={0} />
                      <MetricCard label="Dialokasikan ke Target" value={formatIDR(summary.allocatedToTargets)} helper={`${allocatedPercent.toFixed(1)}% dari total`} index={1} />
                      <MetricCard label="Belum Dialokasikan" value={formatIDR(summary.unallocated)} tone={summary.unallocated > 0 ? "bad" : "default"} index={2} />
                      <MetricCard label="Jumlah Aset" value={String(computedAssets.length)} helper={`${summary.byType.length} jenis aset`} index={3} />
                    </section>

                    {/* Main Content: Chart + Composition side-by-side */}
                    <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
                      {/* Donut Chart Card */}
                      <motion.div
                        className="panel flex flex-col items-center justify-center"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.4, delay: 0.1 }}
                      >
                        <h3 className="section-title mb-1 self-start">Distribusi Aset</h3>
                        <p className="text-xs text-slate-500 mb-4 self-start font-semibold">Proporsi alokasi berdasarkan jenis aset.</p>

                        {chartData.length === 0 ? (
                          <div className="empty-state w-full">Belum ada aset.</div>
                        ) : (
                          <div className="relative w-full" style={{ height: 260 }}>
                            <ResponsiveContainer width="100%" height={260}>
                              <PieChart>
                                <Pie
                                  data={chartData}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={72}
                                  outerRadius={110}
                                  paddingAngle={3}
                                  dataKey="value"
                                  strokeWidth={0}
                                  animationBegin={0}
                                  animationDuration={900}
                                >
                                  {chartData.map((entry, i) => (
                                    <Cell key={i} fill={entry.color} style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.1))" }} />
                                  ))}
                                </Pie>
                                <Tooltip content={<MoneyTooltipAsset />} />
                              </PieChart>
                            </ResponsiveContainer>
                            {/* Center label */}
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total</p>
                              <p className="text-lg font-black text-navy tracking-tight">{formatIDR(summary.totalAssets)}</p>
                            </div>
                          </div>
                        )}

                        {/* Chart Legend */}
                        {chartData.length > 0 && (
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2 w-full">
                            {chartData.map((d) => (
                              <div key={d.name} className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                                <span className="truncate">{d.name}</span>
                                <span className="ml-auto font-black text-navy">{d.percent.toFixed(0)}%</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </motion.div>

                      {/* Asset Type Breakdown Cards */}
                      <motion.div
                        className="grid gap-3 content-start"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.4, delay: 0.15 }}
                      >
                        <div className="flex items-center justify-between">
                          <h3 className="section-title">Komposisi Per Jenis</h3>
                          <span className="text-xs font-bold text-slate-400">{summary.byType.length} jenis aktif</span>
                        </div>

                        {summary.byType.length === 0 ? (
                          <div className="empty-state">Belum ada aset. Tambahkan di tab "Kelola Aset".</div>
                        ) : (
                          summary.byType.map((item, idx) => {
                            const vis = getAssetVisual(item.type);
                            const Icon = vis.icon;
                            const limit = getLimitForType(item.type, assetStrategy);
                            const percent = summary.totalAssets > 0 ? (item.value / summary.totalAssets) * 100 : 0;
                            const isExceeded = limit !== null && percent > limit;
                            const typeAssets = computedAssets.filter((a) => a.type === item.type);

                            return (
                              <AssetTypeCard
                                key={item.type}
                                type={item.type}
                                value={item.value}
                                percent={percent}
                                limit={limit}
                                isExceeded={isExceeded}
                                icon={Icon}
                                gradient={vis.gradient}
                                bg={vis.bg}
                                color={vis.color}
                                typeAssets={typeAssets}
                                totalTypeValue={item.value}
                                index={idx}
                              />
                            );
                          })
                        )}
                      </motion.div>
                    </div>

                    {/* Top 5 Assets */}
                    {topAssets.length > 0 && (
                      <motion.div
                        className="panel"
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.25 }}
                      >
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h3 className="section-title">Top 5 Aset Terbesar</h3>
                            <p className="text-xs text-slate-500 font-semibold mt-0.5">Aset dengan nilai tertinggi di portofolio kamu.</p>
                          </div>
                        </div>
                        <div className="grid gap-2.5">
                          {topAssets.map((asset, i) => {
                            const vis = getAssetVisual(asset.type);
                            const Icon = vis.icon;
                            const assetPercent = summary.totalAssets > 0 ? (asset.value / summary.totalAssets) * 100 : 0;
                            const medals = ["🥇", "🥈", "🥉"];

                            return (
                              <motion.div
                                key={asset.id}
                                className="flex items-center gap-3 rounded-2xl border border-slate-100/80 dark:border-slate-800 bg-gradient-to-r from-white to-slate-50/50 dark:from-slate-900/40 dark:to-slate-800/20 p-3.5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-default"
                                initial={{ opacity: 0, x: -12 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.3, delay: 0.3 + i * 0.06 }}
                              >
                                <div className="flex h-9 w-9 items-center justify-center rounded-xl text-lg shrink-0">
                                  {i < 3 ? medals[i] : <span className="text-xs font-black text-slate-400">#{i + 1}</span>}
                                </div>
                                <div className={`flex h-10 w-10 items-center justify-center rounded-xl shrink-0 ${vis.bg}`} style={{ color: vis.color }}>
                                  <Icon size={20} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="font-black text-navy text-sm truncate">{asset.name}</p>
                                  <p className="text-[11px] font-semibold text-slate-400">{asset.type}</p>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="font-black text-navy text-sm">{formatIDR(asset.value)}</p>
                                  <p className="text-[11px] font-bold text-slate-400">{assetPercent.toFixed(1)}%</p>
                                </div>
                                {/* Mini bar */}
                                <div className="hidden sm:block w-20 shrink-0">
                                  <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full bg-gradient-to-r ${vis.gradient}`}
                                      style={{ width: `${Math.min(100, assetPercent)}%` }}
                                    />
                                  </div>
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </div>
                );
              })()}
            </motion.div>
          )}

        {subTab === "manage" && (
          <motion.div
            key="manage"
            initial={{ opacity: 0, y: 15, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <section className="grid items-start gap-5 xl:grid-cols-[380px_1fr]">
              {/* Form Column */}
              <div className="glass-card p-5 self-start shadow-xl animate-slide-in-up">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="section-title">{draft.id ? "Edit Aset" : "Tambah Aset"}</h3>
                  {draft.id ? (
                    <button className="secondary-button font-bold px-3 min-h-9 rounded-xl text-xs w-auto" type="button" onClick={resetDraft}>
                      Batal
                    </button>
                  ) : null}
                </div>
                {message ? (
                  <p className="mb-3 rounded-xl bg-teal-50 dark:bg-teal-950/20 border border-teal-100 dark:border-teal-900/30 px-3.5 py-2.5 text-xs font-bold text-teal-800 dark:text-teal-400 flex items-center gap-2 animate-fade-in">
                    <AlertCircle size={14} />
                    <span>{message}</span>
                  </p>
                ) : null}
                <div className="grid gap-3">
                  <label className="field">
                    <span>Nama Aset</span>
                    <input
                      value={draft.name}
                      onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                      placeholder="Contoh: RDPU Bibit, BBCA, Deposito BCA"
                    />
                  </label>
                  <label className="field">
                    <span>Jenis Aset</span>
                    <select
                      value={draft.type}
                      onChange={(event) => {
                        const newType = event.target.value as AssetType;
                        setDraft({
                          ...draft,
                          type: newType,
                          cashSourceType: "manual",
                          cashSourcePocketId: "",
                          cashSourceAccount: "",
                          sahamRole: "Core",
                          sahamSector: "",
                          sharesCount: "",
                          avgPurchasePrice: "",
                        });
                      }}
                    >
                      {assetTypes.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </label>

                  {draft.type === "Cash" && (
                    <>
                      <label className="field">
                        <span>Sumber Nilai Kas</span>
                        <select
                          value={draft.cashSourceType || "manual"}
                          onChange={(event) => {
                            const srcType = event.target.value as any;
                            let nextVal = draft.value;
                            if (srcType === "all-pockets") {
                              const pocketSummary = calculatePocketMonthSummary(transactions, pockets, selectedMonth);
                              nextVal = String(pocketSummary.pockets.reduce((sum, p) => sum + p.availableBalance, 0));
                            } else if (srcType === "pocket") {
                              const activePock = pockets.filter(p => !p.isArchived)[0];
                              const pocketSummary = calculatePocketMonthSummary(transactions, pockets, selectedMonth);
                              const matchedPocket = pocketSummary.pockets.find((p) => p.pocket.id === activePock?.id);
                              nextVal = matchedPocket ? String(matchedPocket.availableBalance) : "0";
                            } else if (srcType === "account") {
                              const activeAcc = uniqueAccounts[0] || "";
                              nextVal = String(calculateAccountBalance(transactions, activeAcc));
                            } else if (srcType === "remaining-money") {
                              const monthlySummary = calculateMonthlySummary(transactions, selectedMonth);
                              nextVal = String(monthlySummary.remainingMoney);
                            }
                            setDraft({
                              ...draft,
                              cashSourceType: srcType,
                              cashSourcePocketId: srcType === "pocket" ? (pockets.filter(p => !p.isArchived)[0]?.id || "") : "",
                              cashSourceAccount: srcType === "account" ? (uniqueAccounts[0] || "") : "",
                              value: nextVal,
                            });
                          }}
                        >
                          <option value="manual">Input Manual</option>
                          <option value="all-pockets">Total Saldo Semua Kantong</option>
                          <option value="pocket">Kantong Spesifik</option>
                          <option value="account">Saldo Akun Transaksi (e.g. BCA, GoPay)</option>
                          <option value="remaining-money">Sisa Uang Bulan Ini (Net Cashflow)</option>
                        </select>
                      </label>

                      {draft.cashSourceType === "pocket" && (
                        <label className="field">
                          <span>Pilih Kantong</span>
                          <select
                            value={draft.cashSourcePocketId || ""}
                            onChange={(event) => {
                              const pocketId = event.target.value;
                              const pocketSummary = calculatePocketMonthSummary(transactions, pockets, selectedMonth);
                              const matchedPocket = pocketSummary.pockets.find((p) => p.pocket.id === pocketId);
                              setDraft({
                                ...draft,
                                cashSourcePocketId: pocketId,
                                value: matchedPocket ? String(matchedPocket.availableBalance) : "0",
                              });
                            }}
                          >
                            <option value="">Pilih kantong</option>
                            {pockets.filter(p => !p.isArchived).map((pocket) => (
                              <option key={pocket.id} value={pocket.id}>
                                {pocket.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}

                      {draft.cashSourceType === "account" && (
                        <label className="field">
                          <span>Pilih Akun Transaksi</span>
                          <select
                            value={draft.cashSourceAccount || ""}
                            onChange={(event) => {
                              const account = event.target.value;
                              setDraft({
                                ...draft,
                                cashSourceAccount: account,
                                value: String(calculateAccountBalance(transactions, account)),
                              });
                            }}
                          >
                            <option value="">Pilih akun</option>
                            {uniqueAccounts.map((acc) => (
                              <option key={acc} value={acc}>
                                {acc}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </>
                  )}

                  <label className="field">
                    <span>Nilai Saat Ini</span>
                    <CurrencyInput
                      value={draft.value}
                      onValueChange={(value) => setDraft({ ...draft, value: value ? String(value) : "" })}
                      disabled={draft.type === "Cash" && draft.cashSourceType !== "manual" && draft.cashSourceType !== undefined}
                    />
                  </label>
                  <label className="field">
                    <span>Alokasi ke Target</span>
                    <div className="grid gap-2.5">
                      {draft.targetAllocations.map((allocation) => (
                        <div key={allocation.id} className="grid gap-2 rounded-2xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-900/40 p-3 sm:grid-cols-[1fr_1fr_auto] hover:border-slate-200 dark:hover:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-900/60 transition-all duration-200">
                          <select
                            value={allocation.targetId}
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                targetAllocations: draft.targetAllocations.map((item) =>
                                  item.id === allocation.id ? { ...item, targetId: event.target.value } : item,
                                ),
                              })
                            }
                          >
                            <option value="">Pilih target</option>
                            {targets.map((target) => (
                              <option key={target.id} value={target.id}>
                                {target.name}
                              </option>
                            ))}
                          </select>
                          <CurrencyInput
                            value={allocation.amount}
                            onValueChange={(amount) =>
                              setDraft({
                                ...draft,
                                targetAllocations: draft.targetAllocations.map((item) =>
                                  item.id === allocation.id ? { ...item, amount: amount ? String(amount) : "" } : item,
                                ),
                              })
                            }
                          />
                          <button
                            className="danger-button font-bold min-h-10 px-3 text-xs flex items-center gap-1 hover:bg-rose-50"
                            type="button"
                            onClick={() =>
                              setDraft({
                                ...draft,
                                targetAllocations: draft.targetAllocations.filter((item) => item.id !== allocation.id),
                              })
                            }
                          >
                            Hapus
                          </button>
                        </div>
                      ))}
                      <button
                        className="secondary-button font-bold text-xs py-2 px-3 border border-dashed border-slate-300 hover:border-teal hover:bg-teal/[0.02] rounded-xl"
                        type="button"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            targetAllocations: [...draft.targetAllocations, { id: createId(), targetId: "", amount: "" }],
                          })
                        }
                      >
                        Tambah Alokasi Target
                      </button>
                      <small className="text-[11px] font-semibold text-slate-400">Contoh: RDPU Rp10 juta, Rp3 juta untuk Dana Darurat dan sisanya target lain.</small>
                    </div>
                  </label>
                  {draft.type === "Saham" ? (
                    <>
                      <label className="field">
                        <span>Peran Portofolio (Jenis)</span>
                        <select
                          value={draft.sahamRole || "Core"}
                          onChange={(event) =>
                            setDraft({ ...draft, sahamRole: event.target.value as PortfolioRole })
                          }
                        >
                          <option value="Core">Core (Utama)</option>
                          <option value="Stabilizer">Stabilizer (Penyeimbang)</option>
                          <option value="Satellite">Satellite (Taktis)</option>
                          <option value="Watchlist Only">Watchlist Only</option>
                        </select>
                      </label>

                      <label className="field">
                        <span>Sektor Saham</span>
                        <select
                          value={draft.sahamSector && !commonSectors.includes(draft.sahamSector) ? "Kustom" : (draft.sahamSector || "")}
                          onChange={(event) => {
                            const val = event.target.value;
                            if (val === "Kustom") {
                              setDraft({ ...draft, sahamSector: "" });
                            } else {
                              setDraft({ ...draft, sahamSector: val });
                            }
                          }}
                        >
                          <option value="">Pilih Sektor</option>
                          {commonSectors.map((sec) => (
                            <option key={sec} value={sec}>
                              {sec}
                            </option>
                          ))}
                          <option value="Kustom">Kustom (Tulis Sendiri)</option>
                        </select>
                        {(draft.sahamSector === "" || (draft.sahamSector !== undefined && !commonSectors.includes(draft.sahamSector))) && (
                          <input
                            className="mt-1.5"
                            value={draft.sahamSector || ""}
                            onChange={(event) => setDraft({ ...draft, sahamSector: event.target.value })}
                            placeholder="Masukkan nama sektor kustom"
                          />
                        )}
                      </label>

                      <label className="field">
                        <span>Tesis Terkait</span>
                        <select
                          value={draft.thesisId}
                          onChange={(event) => {
                            const thesisId = event.target.value;
                            const thesis = theses.find((t) => t.id === thesisId);
                            const nextDraft = {
                              ...draft,
                              thesisId,
                              sahamRole: thesis ? thesis.portfolioRole : draft.sahamRole,
                              sahamSector: (thesis && thesis.sector) ? thesis.sector : draft.sahamSector,
                            };
                            if (thesis && thesis.currentPrice > 0 && draft.sharesCount) {
                              nextDraft.value = String(Number(draft.sharesCount) * thesis.currentPrice);
                            }
                            setDraft(nextDraft);
                          }}
                        >
                          <option value="">Tidak terhubung</option>
                          {theses.map((thesis) => (
                            <option key={thesis.id} value={thesis.id}>
                              {thesis.ticker || "-"} · {thesis.companyName || "Tanpa nama"}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="field">
                        <span>Jumlah Lembar Saham</span>
                        <input
                          type="number"
                          min="0"
                          value={draft.sharesCount}
                          onChange={(event) => {
                            const count = event.target.value;
                            const nextDraft = { ...draft, sharesCount: count };
                            if (draft.thesisId) {
                              const thesis = theses.find((t) => t.id === draft.thesisId);
                              if (thesis && thesis.currentPrice > 0) {
                                nextDraft.value = String(Number(count || 0) * thesis.currentPrice);
                              }
                            }
                            setDraft(nextDraft);
                          }}
                          placeholder="Contoh: 100"
                        />
                      </label>

                      <label className="field">
                        <span>Harga Beli Rata-Rata</span>
                        <CurrencyInput
                          value={draft.avgPurchasePrice}
                          onValueChange={(price) => setDraft({ ...draft, avgPurchasePrice: price ? String(price) : "" })}
                        />
                      </label>
                    </>
                  ) : null}
                  <label className="field">
                    <span>Catatan</span>
                    <textarea
                      className="min-h-24"
                      value={draft.notes}
                      onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                      placeholder="Misal: dipakai untuk target laptop, instrumen rendah risiko, dll."
                    />
                  </label>
                  <button className="primary-button min-h-11 flex items-center justify-center gap-2 text-sm font-black shadow-lg shadow-teal/10 rounded-xl" type="button" onClick={saveAsset}>
                    <Plus size={18} />
                    {draft.id ? "Simpan Aset" : "Tambah Aset"}
                  </button>
                </div>
              </div>

              {/* List Column */}
              <div className="glass-card p-5 shadow-xl animate-slide-in-up stagger-1">
                <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                  <div>
                    <h3 className="section-title">Daftar Aset</h3>
                    <p className="text-xs text-slate-500 font-semibold mt-0.5">
                      Menampilkan {filteredAssets.length} dari {assets.length} aset.
                    </p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {sahamAssets.length > 0 && (
                      <button
                        className="primary-button font-bold px-3.5 min-h-9 rounded-xl text-xs w-auto flex items-center justify-center gap-1.5 bg-gradient-to-r from-teal to-emerald-600 hover:from-teal-600 hover:to-emerald-700 disabled:from-slate-300 disabled:to-slate-400 disabled:cursor-not-allowed"
                        type="button"
                        onClick={syncStockPrices}
                        disabled={isSyncing}
                      >
                        <RefreshCw size={13} className={isSyncing ? "animate-spin" : ""} />
                        {isSyncing ? "Mensinkronkan..." : "Sinkronisasi Harga Saham"}
                      </button>
                    )}
                    <button
                      className="secondary-button font-bold px-3 min-h-9 rounded-xl text-xs w-auto"
                      type="button"
                      onClick={() => setFilters({ search: "", type: "all", targetId: "all", thesis: "all", sort: "updated-desc" })}
                    >
                      Reset Filter
                    </button>
                  </div>
                </div>
                {assets.length === 0 ? (
                  <div className="empty-state">Belum ada aset. Tambahkan RDPU, saham, cash, atau aset lain.</div>
                ) : (
                  <div className="grid gap-3">
                    <div className="grid gap-3 rounded-2xl border border-slate-100 bg-slate-50/40 p-4 xl:grid-cols-[1.35fr_1fr_1fr_1fr_1fr]">
                      <label className="field">
                        <span>Cari aset</span>
                        <input
                          value={filters.search}
                          onChange={(event) => setFilters({ ...filters, search: event.target.value })}
                          placeholder="Nama, catatan, target"
                        />
                      </label>
                      <label className="field">
                        <span>Jenis</span>
                        <select value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })}>
                          <option value="all">Semua jenis</option>
                          {assetTypes.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Target</span>
                        <select value={filters.targetId} onChange={(event) => setFilters({ ...filters, targetId: event.target.value })}>
                          <option value="all">Semua target</option>
                          <option value="unallocated">Belum dialokasikan</option>
                          {targets.map((target) => (
                            <option key={target.id} value={target.id}>
                              {target.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Tesis</span>
                        <select value={filters.thesis} onChange={(event) => setFilters({ ...filters, thesis: event.target.value })}>
                          <option value="all">Semua tesis</option>
                          <option value="linked">Ada tesis</option>
                          <option value="unlinked">Tanpa tesis</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>Urutkan</span>
                        <select value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value })}>
                          <option value="updated-desc">Update terbaru</option>
                          <option value="value-desc">Nilai terbesar</option>
                          <option value="value-asc">Nilai terkecil</option>
                          <option value="name-asc">Nama A-Z</option>
                        </select>
                      </label>
                    </div>

                    {filteredAssets.length === 0 ? (
                      <div className="empty-state">Tidak ada aset yang cocok dengan filter ini.</div>
                    ) : (
                      <div className="flex flex-col max-h-[min(760px,calc(100vh-18rem))] gap-3.5 overflow-y-auto pr-2">
                        {filteredAssets.map((asset, idx) => (
                          <AssetItemCard
                            key={asset.id}
                            asset={asset}
                            targets={targets}
                            theses={theses}
                            onEdit={editAsset}
                            onDelete={setAssetToDelete}
                            totalAssets={summary.totalAssets}
                            index={idx}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          </motion.div>
        )}

        {subTab === "strategy" && (
          <motion.div
            key="strategy"
            initial={{ opacity: 0, y: 15, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <div className="grid gap-5 md:grid-cols-[380px_1fr]">
              {/* Strategy Configuration */}
              <div className="glass-card p-5 self-start shadow-xl animate-slide-in-up">
                <h3 className="section-title mb-4">Pengaturan Strategi</h3>
                <div className="grid gap-3">
                  <label className="field">
                    <span>Mode Strategi Aktif</span>
                    <select
                      value={assetStrategy.mode}
                      onChange={(e) => {
                        const mode = e.target.value as AssetStrategyMode;
                        onStrategyChange({ ...assetStrategy, mode });
                      }}
                    >
                      <option value="Free">Tanpa Strategi (Bebas)</option>
                      <option value="Membangun">Mode Membangun (Maks Saham 20%)</option>
                      <option value="Konservatif">Mode Konservatif (Maks Saham 10%)</option>
                      <option value="Custom">Kustom (Atur Batas Sendiri)</option>
                    </select>
                  </label>

                  {assetStrategy.mode === "Custom" && (
                    <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-3.5 grid gap-2.5 mt-2 animate-fade-in">
                      <p className="text-[10px] font-bold text-navy uppercase tracking-wider mb-1">Set Batas Maksimal (%)</p>
                      {assetTypes.map((type) => (
                        <div key={type} className="flex items-center justify-between gap-3 border-b border-slate-100/50 pb-2 last:border-0 last:pb-0">
                          <span className="text-xs font-bold text-slate-600">{type}</span>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              className="w-16 min-h-8 text-xs py-1 px-1.5 text-center bg-white/80"
                              placeholder="-"
                              value={assetStrategy.customLimits?.[type] ?? ""}
                              onChange={(e) => {
                                const val = e.target.value === "" ? undefined : Math.min(100, Math.max(0, Number(e.target.value)));
                                const nextLimits = { ...assetStrategy.customLimits, [type]: val };
                                onStrategyChange({ ...assetStrategy, customLimits: nextLimits });
                              }}
                            />
                            <span className="text-xs font-bold text-slate-400">%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Allocation Limits Status */}
              <div className="glass-card p-5 shadow-xl animate-slide-in-up stagger-1">
                <h3 className="section-title mb-1">Status Batas Alokasi</h3>
                <p className="text-xs text-slate-500 mb-4 font-semibold">
                  Kepatuhan alokasi aset saat ini terhadap aturan strategi aktif.
                </p>
                <div className="pt-4 border-t border-slate-100 grid gap-4">
                  {summary.byType.length === 0 ? (
                    <div className="empty-state">Belum ada aset untuk dianalisis.</div>
                  ) : (
                    <div className="grid gap-4">
                      {summary.byType.map((item, idx) => {
                        const limit = getLimitForType(item.type, assetStrategy);
                        const percent = summary.totalAssets > 0 ? (item.value / summary.totalAssets) * 100 : 0;
                        const isExceeded = limit !== null && percent > limit;
                        const vis = getAssetVisual(item.type);

                        return (
                          <div key={item.type} className="text-xs font-semibold pb-1 last:pb-0">
                            <div className="flex justify-between items-center mb-1.5">
                              <span className="text-navy font-extrabold text-sm flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: vis.color }} />
                                {item.type}
                              </span>
                              <span className={`font-black flex items-center gap-1.5 text-xs ${isExceeded ? "text-rose-600 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-100 animate-pulse" : "text-slate-500"}`}>
                                {isExceeded ? (
                                  <AlertCircle size={13} className="text-rose-500" />
                                ) : limit !== null ? (
                                  <CheckCircle2 size={13} className="text-emerald-500" />
                                ) : null}
                                <span>{percent.toFixed(1)}% {limit !== null ? `(Batas: ${limit}%)` : ""}</span>
                              </span>
                            </div>
                            <div className="h-3 bg-slate-100/80 rounded-full overflow-hidden border border-slate-200/20 relative shadow-inner">
                              <motion.div
                                className={`h-full rounded-full ${
                                  isExceeded ? "bg-gradient-to-r from-rose-500 to-red-600 shadow-md shadow-rose-500/20" : `bg-gradient-to-r ${vis.gradient}`
                                }`}
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min(100, percent)}%` }}
                                transition={{ duration: 0.8, delay: idx * 0.05 + 0.1, ease: "easeOut" }}
                              />
                              {limit !== null && (
                                <div
                                  className="absolute top-0 bottom-0 w-0.5 bg-navy/40 rounded-full z-10"
                                  style={{ left: `${Math.min(100, limit)}%` }}
                                  title={`Batas: ${limit}%`}
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {subTab === "stocks" && totalSaham > 0 && (
          <motion.div
            key="stocks"
            initial={{ opacity: 0, y: 15, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <div className="glass-card p-5 shadow-xl animate-slide-in-up">
              <h3 className="section-title mb-1">Analisis Portofolio Saham</h3>
              <p className="text-xs text-slate-500 mb-4 font-semibold">
                Rincian komposisi saham berdasarkan peran portofolio, sektor, dan tipe investasi.
              </p>

              <div className="grid gap-4 mt-2">
                {Object.entries(portfolioBreakdown)
                  .filter(([_, data]) => data.total > 0)
                  .map(([role, data], idx) => {
                    const rolePercent = totalSaham > 0 ? (data.total / totalSaham) * 100 : 0;
                    
                    const roleColor = role === "Core" ? "#0f9f9a" : role === "Stabilizer" ? "#12324a" : role === "Satellite" ? "#f59e0b" : "#64748b";
                    const roleGradient = 
                      role === "Core" ? "bg-gradient-to-r from-teal to-cyan-400" :
                      role === "Stabilizer" ? "bg-gradient-to-r from-navy via-slate-800 to-indigo-600" :
                      role === "Satellite" ? "bg-gradient-to-r from-amber-500 to-rose-400" :
                      "bg-gradient-to-r from-slate-400 to-gray-500";

                    return (
                      <div key={role} className="rounded-2xl border border-slate-100 dark:border-slate-800/60 bg-slate-50/40 dark:bg-slate-900/30 p-4 shadow-sm hover:shadow-md transition-shadow duration-200">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-extrabold text-navy text-sm flex items-center gap-2">
                            <span className="inline-block h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: roleColor }} />
                            {role}
                          </span>
                          <span className="font-black text-teal text-sm">
                            {formatIDR(data.total)} ({rolePercent.toFixed(1)}%)
                          </span>
                        </div>

                        <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mb-4 shadow-inner">
                          <motion.div
                            className={`h-full rounded-full ${roleGradient}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${rolePercent}%` }}
                            transition={{ duration: 0.8, delay: idx * 0.05, ease: "easeOut" }}
                          />
                        </div>

                        {/* Nested Sectors & Assets Hierarchy */}
                        <div className="pl-2.5 grid gap-4 mt-2.5 pt-3.5 border-t border-slate-200/50 dark:border-slate-700/40">
                          {Object.entries(data.sectors).map(([sector, secData]) => {
                            const secPercent = data.total > 0 ? (secData.total / data.total) * 100 : 0;
                            return (
                              <div key={sector} className="pl-3.5 border-l-2" style={{ borderColor: roleColor }}>
                                <div className="flex justify-between items-center text-xs font-black text-navy dark:text-slate-200 mb-2">
                                  <span className="flex items-center gap-1.5">
                                    <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: roleColor }} />
                                    {sector}
                                  </span>
                                  <span className="text-teal font-extrabold bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-lg px-2 py-0.5 shadow-sm">
                                    {formatIDR(secData.total)} ({secPercent.toFixed(0)}%)
                                  </span>
                                </div>
                                
                                <div className="grid gap-1.5 pl-1.5">
                                  {secData.assets.map((asset) => {
                                    const assetPercent = secData.total > 0 ? (asset.value / secData.total) * 100 : 0;
                                    return (
                                      <div key={asset.id} className="flex justify-between items-center text-xs font-bold text-slate-600 dark:text-slate-300 bg-white/70 dark:bg-slate-900/30 rounded-xl px-3 py-2 border border-slate-100/50 dark:border-slate-800/60 hover:bg-white dark:hover:bg-slate-900/50 hover:border-slate-200 dark:hover:border-slate-700/80 hover:shadow-sm transition-all duration-200">
                                        <span className="truncate">{asset.name}</span>
                                        <span className="font-extrabold text-navy shrink-0">{formatIDR(asset.value)} ({assetPercent.toFixed(0)}%)</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>

      <ConfirmDialog
        open={Boolean(assetToDelete)}
        title="Hapus aset?"
        description="Aset ini akan dihapus dari database lokal. Jika aset ini terhubung ke target, progress target ikut berkurang."
        confirmLabel="Hapus aset"
        cancelLabel="Tidak jadi"
        onCancel={() => setAssetToDelete(null)}
        onConfirm={confirmDeleteAsset}
        details={
          assetToDelete ? (
            <div>
              <p className="text-lg font-black text-navy">{assetToDelete.name}</p>
              <p className="mt-1 text-sm text-slate-600">
                <Link2 className="mr-1 inline" size={14} />
                {assetToDelete.type} - {formatIDR(assetToDelete.value)} - {getTargetAllocationLabel(targets, assetToDelete.targetAllocations, assetToDelete.targetId, assetToDelete.value)}
              </p>
            </div>
          ) : null
        }
      />
    </>
  );
}
function AssetTypeCard({
  type, value, percent, limit, isExceeded, icon: Icon, gradient, bg, color, typeAssets, totalTypeValue, index,
}: {
  type: string; value: number; percent: number; limit: number | null; isExceeded: boolean;
  icon: typeof Wallet; gradient: string; bg: string; color: string;
  typeAssets: Asset[]; totalTypeValue: number; index: number;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      className="relative rounded-2xl border border-slate-100/80 dark:border-slate-800/80 bg-white/95 dark:bg-slate-900/35 shadow-sm overflow-hidden hover:shadow-md transition-shadow duration-200"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 + index * 0.05 }}
    >
      {/* Gradient accent top bar */}
      <div className={`h-1 bg-gradient-to-r ${isExceeded ? "from-rose-500 to-red-600" : gradient}`} />

      <div className="p-4">
        <div className="flex items-center gap-3">
          {/* Icon */}
          <div className={`flex h-11 w-11 items-center justify-center rounded-xl shrink-0 ${bg}`} style={{ color }}>
            <Icon size={22} />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-black text-navy text-sm">{type}</h4>
              <div className="text-right">
                <p className="font-black text-navy text-sm">{formatIDR(value)}</p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 mt-0.5">
              <span className="text-[11px] font-bold text-slate-400">{typeAssets.length} produk</span>
              <span className={`text-[11px] font-black ${isExceeded ? "text-rose-600" : "text-slate-500"}`}>
                {percent.toFixed(1)}%{limit !== null ? ` / ${limit}%` : ""}
              </span>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 relative">
          <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <motion.div
              className={`h-full rounded-full bg-gradient-to-r ${isExceeded ? "from-rose-500 to-red-600" : gradient}`}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, percent)}%` }}
              transition={{ duration: 0.8, delay: 0.2 + index * 0.05, ease: "easeOut" }}
            />
          </div>
          {/* Limit marker */}
          {limit !== null && (
            <div
              className="absolute top-0 h-2 w-0.5 bg-navy/40 rounded-full"
              style={{ left: `${Math.min(100, limit)}%` }}
              title={`Batas: ${limit}%`}
            />
          )}
        </div>

        {/* Expand toggle */}
        {typeAssets.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 mt-3 text-[11px] font-bold text-slate-400 hover:text-navy dark:hover:text-slate-200 transition-colors min-h-0 px-0 py-0"
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {expanded ? "Sembunyikan detail" : "Lihat detail produk"}
          </button>
        )}

        {/* Expanded product list */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800 grid gap-1.5">
                {typeAssets.map((asset) => {
                  const assetPercentInType = totalTypeValue > 0 ? (asset.value / totalTypeValue) * 100 : 0;
                  return (
                    <div key={asset.id} className="flex items-center justify-between gap-2 py-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className="text-xs font-semibold text-slate-600 truncate">{asset.name}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs font-black text-navy">{formatIDR(asset.value)}</span>
                        <span className="text-[10px] font-bold text-slate-400 w-10 text-right">{assetPercentInType.toFixed(0)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function InfoTile({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "good" }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 break-words text-sm font-black ${tone === "good" ? "text-emerald-700" : "text-navy"}`}>{value}</p>
    </div>
  );
}

function AssetItemCard({
  asset,
  targets,
  theses,
  onEdit,
  onDelete,
  totalAssets,
  index,
}: {
  asset: Asset;
  targets: FinancialTarget[];
  theses: InvestmentThesis[];
  onEdit: (asset: Asset) => void;
  onDelete: (asset: Asset) => void;
  totalAssets: number;
  index: number;
}) {
  const vis = getAssetVisual(asset.type);
  const Icon = vis.icon;
  const percent = totalAssets > 0 ? (asset.value / totalAssets) * 100 : 0;
  
  // Target Allocations
  const allocatedAmount = asset.targetAllocations?.length
    ? sumTargetAllocations(asset.targetAllocations)
    : (asset.targetId ? asset.value : 0);
  const allocatedPercent = asset.value > 0 ? (allocatedAmount / asset.value) * 100 : 0;

  // 3D Tilt Logic
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const xSpring = useSpring(x, { damping: 25, stiffness: 250, mass: 0.5 });
  const ySpring = useSpring(y, { damping: 25, stiffness: 250, mass: 0.5 });
  const rotateX = useTransform(ySpring, [-0.5, 0.5], [6, -6]);
  const rotateY = useTransform(xSpring, [-0.5, 0.5], [-6, 6]);

  const handleMouseMove = (event: React.MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = event.clientX - rect.left - width / 2;
    const mouseY = event.clientY - rect.top - height / 2;
    x.set(mouseX / width);
    y.set(mouseY / height);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  const thesisObj = theses.find(t => t.id === asset.thesisId);
  const sharesCount = asset.sharesCount || 0;
  const avgPurchasePrice = asset.avgPurchasePrice || 0;
  const marketPrice = thesisObj?.currentPrice || 0;
  
  const hasPlInfo = asset.type === "Saham" && sharesCount > 0 && avgPurchasePrice > 0 && marketPrice > 0;
  const totalCost = sharesCount * avgPurchasePrice;
  const profitNominal = hasPlInfo ? (asset.value - totalCost) : 0;
  const profitPercent = hasPlInfo && totalCost > 0 ? (profitNominal / totalCost) * 100 : 0;
  const formattedPl = `${profitNominal >= 0 ? "+" : "-"}${formatIDR(Math.abs(profitNominal))} (${profitNominal >= 0 ? "+" : ""}${profitPercent.toFixed(1)}%)`;

  return (
    <motion.article
      className="relative rounded-2xl border border-slate-200/60 dark:border-slate-700/50 bg-white dark:bg-slate-900/70 shadow-soft overflow-hidden card-3d p-4 cursor-default select-none shrink-0"
      style={{ rotateX, rotateY, perspective: 1000 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05, ease: "easeOut" }}
    >
      {/* Left border accent */}
      <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b" style={{ backgroundImage: `linear-gradient(to bottom, ${vis.color}, rgba(255,255,255,0.1))` }} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className={`flex h-9 w-9 items-center justify-center rounded-xl shrink-0 ${vis.bg}`} style={{ color: vis.color }}>
              <Icon size={18} />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-black text-navy leading-tight">{asset.name}</h4>
                {hasPlInfo && (
                  <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-black ${
                    profitNominal >= 0 
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400" 
                      : "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400"
                  }`}>
                    {profitNominal >= 0 ? "▲" : "▼"} {formattedPl}
                  </span>
                )}
              </div>
              <p className="text-[10px] font-bold text-slate-400 mt-0.5">{asset.type} • {percent.toFixed(1)}% dari total aset</p>
            </div>
          </div>

          <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 p-2.5">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Nilai</span>
              <p className="font-extrabold text-navy text-xs mt-0.5" style={{ color: vis.color }}>{formatIDR(asset.value)}</p>
            </div>
            <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 p-2.5 min-w-0">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Terhubung ke Target</span>
              <p className="font-bold text-slate-600 dark:text-slate-300 text-xs mt-0.5 truncate" title={getTargetAllocationLabel(targets, asset.targetAllocations, asset.targetId, asset.value)}>
                {getTargetAllocationLabel(targets, asset.targetAllocations, asset.targetId, asset.value)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 p-2.5">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Update Terakhir</span>
              <p className="font-bold text-slate-600 dark:text-slate-300 text-xs mt-0.5">{asset.updatedAt.slice(0, 10)}</p>
            </div>
            
            {asset.type === "Saham" && (
              <>
                <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 p-2.5 min-w-0">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Jumlah Lembar</span>
                  <p className="font-bold text-slate-600 dark:text-slate-300 text-xs mt-0.5 truncate">{asset.sharesCount ? `${asset.sharesCount} lembar` : "-"}</p>
                </div>
                <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 p-2.5 min-w-0">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Harga Beli Rata-Rata</span>
                  <p className="font-bold text-slate-600 dark:text-slate-300 text-xs mt-0.5 truncate">{asset.avgPurchasePrice ? formatIDR(asset.avgPurchasePrice) : "-"}</p>
                </div>
                <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 p-2.5 min-w-0">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Harga Terakhir</span>
                  <p className="font-bold text-slate-600 dark:text-slate-300 text-xs mt-0.5 truncate">{marketPrice ? formatIDR(marketPrice) : "-"}</p>
                </div>
                <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 p-2.5 min-w-0">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Sektor</span>
                  <p className="font-bold text-slate-600 dark:text-slate-300 text-xs mt-0.5 truncate">{asset.sahamSector || (theses.find(t => t.id === asset.thesisId)?.sector) || "Tanpa Sektor"}</p>
                </div>
                <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 p-2.5 min-w-0">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Peran Saham</span>
                  <p className="font-bold text-slate-600 dark:text-slate-300 text-xs mt-0.5 truncate">{asset.sahamRole || (theses.find(t => t.id === asset.thesisId)?.portfolioRole) || "Tanpa Peran"}</p>
                </div>
                <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 p-2.5 min-w-0">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Tesis Investasi</span>
                  <p className="font-bold text-teal text-xs mt-0.5 truncate">{getThesisName(theses, asset.thesisId)}</p>
                </div>
              </>
            )}
          </div>

          {/* Allocation Progress Bar inside Card */}
          {allocatedAmount > 0 && (
            <div className="mt-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-2 border border-slate-100/50 dark:border-slate-700/40">
              <div className="flex items-center justify-between text-[9px] font-bold text-slate-400 dark:text-slate-500 mb-1">
                <span>Dialokasikan ke Target</span>
                <span className="text-teal">{formatIDR(allocatedAmount)} ({allocatedPercent.toFixed(0)}%)</span>
              </div>
              <div className="h-1.5 w-full bg-slate-200/50 dark:bg-slate-700/60 rounded-full overflow-hidden">
                <div 
                  className="h-full rounded-full bg-gradient-to-r from-teal to-cyan-400"
                  style={{ width: `${Math.min(100, allocatedPercent)}%` }}
                />
              </div>
            </div>
          )}

          {asset.notes && (
            <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400 font-medium italic border-t border-dashed border-slate-100 dark:border-slate-700/50 pt-2">
              💡 {asset.notes}
            </p>
          )}
        </div>

        {/* Action buttons side column */}
        <div className="flex flex-row items-center gap-2 lg:w-24 lg:flex-col lg:justify-start shrink-0">
          <button 
            className="secondary-button w-full min-h-9 text-xs font-bold flex items-center justify-center gap-1.5 rounded-xl" 
            type="button" 
            onClick={() => onEdit(asset)}
          >
            <Pencil size={13} /> Edit
          </button>
          <button 
            className="danger-button w-full min-h-9 text-xs font-bold flex items-center justify-center gap-1.5 rounded-xl hover:bg-rose-50" 
            type="button" 
            onClick={() => onDelete(asset)}
          >
            <Trash2 size={13} /> Hapus
          </button>
        </div>
      </div>
    </motion.article>
  );
}

