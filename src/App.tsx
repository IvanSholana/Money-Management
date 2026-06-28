import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { Layout } from "./components/Layout";
import { defaultData } from "./data/defaults";
import { AiLanding } from "./pages/AiLanding";
import { Assets } from "./pages/Assets";
import { Dashboard } from "./pages/Dashboard";
import { MonthlyReport } from "./pages/MonthlyReport";
import { Pockets } from "./pages/Pockets";
import { Settings } from "./pages/Settings";
import { Targets } from "./pages/Targets";
import { Thesis } from "./pages/Thesis";
import { Transactions } from "./pages/Transactions";
import { TradingScanner } from "./pages/TradingScanner";
import { DividendMomentumScanner } from "./pages/DividendMomentumScanner";
import { AppData, Transaction } from "./types";
import { getMonthKey, todayJakarta } from "./utils/date";
import { formatIDR } from "./utils/finance";
import { loadData, loadDataFromDatabase, saveData, saveDataToDatabase } from "./utils/storage";

type Page = "ai-landing" | "dashboard" | "transactions" | "monthly" | "pockets" | "assets" | "targets" | "thesis" | "scanner" | "dividend-scanner" | "settings";

export function App() {
  const [data, setData] = useState<AppData>(() => loadData());
  const [storageStatus, setStorageStatus] = useState<"loading" | "database" | "browser">("loading");
  const [page, setPage] = useState<Page>("ai-landing");
  const [selectedMonth, setSelectedMonth] = useState(getMonthKey(todayJakarta()));
  const [transactionToEditFromReport, setTransactionToEditFromReport] = useState<Transaction | null>(null);
  const [transactionToDelete, setTransactionToDelete] = useState<Transaction | null>(null);

  function saveMultipleTransactions(newTransactions: Transaction[]) {
    setData((current) => ({
      ...current,
      transactions: [...current.transactions, ...newTransactions],
    }));
  }

  function saveApiKeyFromDrawer(apiKey: string) {
    setData((current) => ({
      ...current,
      settings: {
        ...current.settings,
        deepseekApiKey: apiKey,
      },
    }));
  }

  useEffect(() => {
    let isMounted = true;
    void loadDataFromDatabase().then((result) => {
      if (!isMounted) return;
      setData(result.data);
      setStorageStatus(result.source === "database" ? "database" : "browser");
    });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (storageStatus === "loading") return;
    saveData(data);
    void saveDataToDatabase(data).then((savedToDatabase) => {
      setStorageStatus(savedToDatabase ? "database" : "browser");
    });
  }, [data, storageStatus]);

  const mergedData = useMemo<AppData>(
    () => ({
      ...defaultData,
      ...data,
      transactions: Array.isArray(data.transactions) ? data.transactions : [],
      categories: Array.isArray(data.categories) && data.categories.length ? data.categories : defaultData.categories,
      budgetPockets: Array.isArray(data.budgetPockets) ? data.budgetPockets : [],
      assets: Array.isArray(data.assets) ? data.assets : [],
      targets: Array.isArray(data.targets) ? data.targets : [],
      theses: Array.isArray(data.theses) ? data.theses : [],
      settings: { ...defaultData.settings, ...(data.settings || {}) },
      assetStrategy: data.assetStrategy || defaultData.assetStrategy,
    }),
    [data],
  );

  const assetsRef = useRef(mergedData.assets);
  const thesesRef = useRef(mergedData.theses);

  useEffect(() => {
    assetsRef.current = mergedData.assets;
    thesesRef.current = mergedData.theses;
  }, [mergedData.assets, mergedData.theses]);

  useEffect(() => {
    const minutes = mergedData.settings.autoSyncInterval !== undefined ? mergedData.settings.autoSyncInterval : 30;
    if (minutes <= 0) return;

    const ms = minutes * 60 * 1000;

    const syncAction = async () => {
      const currentAssets = assetsRef.current;
      const currentTheses = thesesRef.current;
      
      const tickers = Array.from(
        new Set(
          currentTheses
            .map((t) => t.ticker)
            .filter(Boolean)
        )
      ) as string[];

      if (tickers.length === 0) return;

      try {
        const activeProvider = mergedData.settings.stockProvider || "yahoo";
        let updatedQuotes: Record<string, { price: number; name?: string; sector?: string }> = {};

        if (activeProvider === "twelvedata" && mergedData.settings.twelveDataApiKey) {
          const csvTickers = tickers.join(",");
          const res = await fetch(`https://api.twelvedata.com/quote?symbol=${encodeURIComponent(csvTickers)}&apikey=${encodeURIComponent(mergedData.settings.twelveDataApiKey)}`);
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
        setData((prev) => {
          const nextAssets = prev.assets.map((a) => {
            if (a.type === "Saham" && a.thesisId) {
              const thesis = prev.theses.find((t) => t.id === a.thesisId);
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

          const nextTheses = prev.theses.map((t) => {
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

          return {
            ...prev,
            assets: nextAssets,
            theses: nextTheses,
          };
        });
        console.log("Stock price auto-sync succeeded:", new Date().toLocaleTimeString());
      } catch (err) {
        console.error("Stock price auto-sync failed:", err);
      }
    };

    // Run once immediately on mount
    void syncAction();

    // Set interval to run periodically
    const intervalId = setInterval(() => {
      void syncAction();
    }, ms);

    return () => clearInterval(intervalId);
  }, [mergedData.settings.autoSyncInterval, mergedData.settings.stockProvider, mergedData.settings.twelveDataApiKey]);

  useEffect(() => {
    const isDark = mergedData.settings.theme === "dark";
    document.documentElement.classList.toggle("dark", isDark);
  }, [mergedData.settings.theme]);

  function toggleTheme() {
    setData((current) => {
      const nextTheme = current.settings?.theme === "dark" ? "light" : "dark";
      return {
        ...current,
        settings: {
          ...current.settings,
          theme: nextTheme,
        },
      };
    });
  }

  function saveTransaction(transaction: Transaction) {
    setData((current) => {
      const exists = current.transactions.some((item) => item.id === transaction.id);
      return {
        ...current,
        transactions: exists
          ? current.transactions.map((item) => (item.id === transaction.id ? transaction : item))
          : [...current.transactions, transaction],
      };
    });
  }

  function deleteTransaction(id: string) {
    setTransactionToDelete(mergedData.transactions.find((transaction) => transaction.id === id) || null);
  }

  function confirmDeleteTransaction() {
    if (!transactionToDelete) return;
    setData((current) => ({
      ...current,
      transactions: current.transactions.filter((transaction) => transaction.id !== transactionToDelete.id),
    }));
    setTransactionToDelete(null);
  }

  function editFromMonthlyReport(transaction: Transaction) {
    setTransactionToEditFromReport(transaction);
    setPage("transactions");
  }

  return (
    <Layout
      page={page}
      storageStatus={storageStatus}
      theme={mergedData.settings.theme || "light"}
      onThemeToggle={toggleTheme}
      onPageChange={setPage}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={page}
          initial={{ opacity: 0, y: 16, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          {page === "ai-landing" ? (
            <AiLanding
              pockets={mergedData.budgetPockets}
              categories={mergedData.categories}
              transactions={mergedData.transactions}
              onSaveTransactions={saveMultipleTransactions}
              apiKey={mergedData.settings.deepseekApiKey}
              onSaveApiKey={saveApiKeyFromDrawer}
              onGoToDashboard={() => setPage("dashboard")}
            />
          ) : null}

          {page === "dashboard" ? (
            <Dashboard
              categories={mergedData.categories}
              pockets={mergedData.budgetPockets}
              onSaveTransaction={saveTransaction}
              onSelectedMonthChange={setSelectedMonth}
              selectedMonth={selectedMonth}
              transactions={mergedData.transactions}
            />
          ) : null}

          {page === "transactions" ? (
            <Transactions
              categories={mergedData.categories}
              pockets={mergedData.budgetPockets}
              initialEditingTransaction={transactionToEditFromReport}
              onDeleteTransaction={deleteTransaction}
              onSaveTransaction={(transaction) => {
                saveTransaction(transaction);
                setTransactionToEditFromReport(null);
              }}
              selectedMonth={selectedMonth}
              transactions={mergedData.transactions}
            />
          ) : null}

          {page === "monthly" ? (
            <MonthlyReport
              categories={mergedData.categories}
              pockets={mergedData.budgetPockets}
              onDeleteTransaction={deleteTransaction}
              onEditTransaction={editFromMonthlyReport}
              onSelectedMonthChange={setSelectedMonth}
              selectedMonth={selectedMonth}
              transactions={mergedData.transactions}
            />
          ) : null}

          {page === "pockets" ? (
            <Pockets
              transactions={mergedData.transactions}
              pockets={mergedData.budgetPockets}
              targets={mergedData.targets}
              selectedMonth={selectedMonth}
              onSelectedMonthChange={setSelectedMonth}
              onPocketsChange={(budgetPockets) => setData((current) => ({ ...current, budgetPockets }))}
            />
          ) : null}

          {page === "assets" ? (
            <Assets
              assets={mergedData.assets}
              targets={mergedData.targets}
              theses={mergedData.theses}
              assetStrategy={mergedData.assetStrategy || { mode: "Free", customLimits: {} }}
              settings={mergedData.settings}
              pockets={mergedData.budgetPockets}
              transactions={mergedData.transactions}
              selectedMonth={selectedMonth}
              onAssetsChange={(assets) => setData((current) => ({ ...current, assets }))}
              onStrategyChange={(assetStrategy) => setData((current) => ({ ...current, assetStrategy }))}
              onThesesChange={(theses) => setData((current) => ({ ...current, theses }))}
              onSyncComplete={(assets, theses) => setData((current) => ({ ...current, assets, theses }))}
            />
          ) : null}

          {page === "targets" ? (
            <Targets
              assets={mergedData.assets}
              pockets={mergedData.budgetPockets}
              selectedMonth={selectedMonth}
              targets={mergedData.targets}
              transactions={mergedData.transactions}
              onTargetsChange={(targets) => setData((current) => ({ ...current, targets }))}
            />
          ) : null}

          {page === "thesis" ? (
            <Thesis
              assets={mergedData.assets}
              theses={mergedData.theses}
              settings={mergedData.settings}
              onThesesChange={(theses) => {
                setData((current) => ({ ...current, theses }));
              }}
            />
          ) : null}

          {page === "scanner" ? (
            <TradingScanner
              settings={mergedData.settings}
              theses={mergedData.theses}
              onThesesChange={(theses) => {
                setData((current) => ({ ...current, theses }));
              }}
            />
          ) : null}

          {page === "dividend-scanner" ? (
            <DividendMomentumScanner
              settings={mergedData.settings}
              theses={mergedData.theses}
              onThesesChange={(theses) => {
                setData((current) => ({ ...current, theses }));
              }}
            />
          ) : null}

          {page === "settings" ? <Settings data={mergedData} onDataChange={setData} /> : null}
        </motion.div>
      </AnimatePresence>
      <ConfirmDialog
        open={Boolean(transactionToDelete)}
        title="Hapus transaksi?"
        description="Transaksi ini akan dihapus dari database lokal. Aksi ini tidak bisa dibatalkan kecuali kamu punya backup JSON."
        confirmLabel="Hapus transaksi"
        cancelLabel="Tidak jadi"
        onCancel={() => setTransactionToDelete(null)}
        onConfirm={confirmDeleteTransaction}
        details={
          transactionToDelete ? (
            <div className="grid gap-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className={transactionToDelete.type === "income" ? "pill-good" : "pill-bad"}>
                  {transactionToDelete.type === "income" ? "Income" : "Expense"}
                </span>
                <span className="font-bold text-navy">{transactionToDelete.date}</span>
                <span className="text-slate-500">{transactionToDelete.category}</span>
              </div>
              <p className={`text-2xl font-black ${transactionToDelete.type === "income" ? "text-emerald-700" : "text-rose-700"}`}>
                {formatIDR(transactionToDelete.amount)}
              </p>
              <p className="text-slate-600">
                <span className="font-semibold text-slate-500">Catatan:</span> {transactionToDelete.notes || "-"}
              </p>
            </div>
          ) : null
        }
      />
    </Layout>
  );
}
