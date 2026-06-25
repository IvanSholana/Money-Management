import React, { useState, useEffect, useMemo } from "react";
import {
  TrendingUp,
  Sparkles,
  Search,
  Loader2,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Target,
  ArrowRight,
  Info,
  HelpCircle,
  Activity,
  ShieldCheck,
  Compass,
  Bell,
  Play,
  Trash2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart,
  Area,
  Line,
  ReferenceArea,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid
} from "recharts";
import { Settings, InvestmentThesis, TechnicalMetrics, AutoScanAlert } from "../types";
import { formatIDR } from "../utils/finance";

interface TradingScannerProps {
  settings: Settings;
  theses: InvestmentThesis[];
  onThesesChange?: (theses: InvestmentThesis[]) => void;
}

interface AiTradingAdvice {
  ticker?: string;
  ai_final_signal: "BUY" | "HOLD" | "SELL" | "AVOID";
  ai_confidence: "low" | "medium" | "high";
  ai_reason: string;
  ai_risk_note?: string;
  ai_entry_comment?: string;
  ai_exit_comment?: string;
}

export function TradingScanner({ settings, theses, onThesesChange }: TradingScannerProps) {
  const defaultTickers = useMemo(() => {
    return Array.from(
      new Set(theses.map((t) => t.ticker).filter(Boolean))
    ) as string[];
  }, [theses]);

  const [inputTickers, setInputTickers] = useState<string>(
    defaultTickers.length > 0 ? defaultTickers.join(", ") : "BBRI, TLKM, ASII, GOTO, AAPL"
  );
  const [scanResults, setScanResults] = useState<TechnicalMetrics[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // Selected Stock Details State
  const [selectedMetric, setSelectedMetric] = useState<TechnicalMetrics | null>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [chartRange, setChartRange] = useState<string>("3mo");
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);

  // AI Advice States
  const [aiAdvices, setAiAdvices] = useState<Record<string, AiTradingAdvice>>({});
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Background Auto-Scan States
  const [activeTab, setActiveTab] = useState<"manual" | "auto">("manual");
  const [autoAlerts, setAutoAlerts] = useState<AutoScanAlert[]>([]);
  const [isLoadingAlerts, setIsLoadingAlerts] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<AutoScanAlert | null>(null);
  const [isTriggeringAutoScan, setIsTriggeringAutoScan] = useState(false);
  const [autoScanStatus, setAutoScanStatus] = useState<{
    is_running: boolean;
    current: number;
    total: number;
    current_ticker: string;
  } | null>(null);

  // Request HTML5 notification permission on mount
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Poll status periodically
  useEffect(() => {
    let intervalId: any = null;

    const checkStatus = async () => {
      try {
        const res = await fetch("/api/auto_scan/status");
        if (res.ok) {
          const data = await res.json();
          // Detect transition from is_running: true -> false
          setAutoScanStatus((prev) => {
            if (prev && prev.is_running && !data.is_running) {
              fetchAutoAlerts();
              if ("Notification" in window && Notification.permission === "granted") {
                new Notification("Algo & AI Trading Scanner", {
                  body: "Pemindaian otomatis latar belakang selesai diproses!",
                });
              }
            }
            return data;
          });
        }
      } catch (err) {
        console.error("Gagal check status auto-scan:", err);
      }
    };

    checkStatus();
    intervalId = setInterval(checkStatus, 3000);

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  const fetchAutoAlerts = async () => {
    setIsLoadingAlerts(true);
    try {
      const res = await fetch("/api/auto_scan/alerts");
      if (res.ok) {
        const json = await res.json();
        setAutoAlerts(json.alerts || []);
      }
    } catch (err) {
      console.error("Gagal memuat alert otomatis:", err);
    } finally {
      setIsLoadingAlerts(false);
    }
  };

  const handleTriggerAutoScan = async () => {
    setIsTriggeringAutoScan(true);
    try {
      const res = await fetch("/api/auto_scan/trigger", { method: "POST" });
      if (res.ok) {
        alert("Auto-scanner latar belakang dijalankan! Silakan tunggu beberapa saat lalu segarkan halaman.");
        setTimeout(fetchAutoAlerts, 5000);
      }
    } catch (err) {
      console.error("Gagal trigger scan:", err);
    } finally {
      setIsTriggeringAutoScan(false);
    }
  };

  const handleClearAlerts = async () => {
    if (!confirm("Apakah Anda yakin ingin menghapus seluruh riwayat alert otomatis?")) return;
    try {
      const res = await fetch("/api/auto_scan/alerts", { method: "DELETE" });
      if (res.ok) {
        setAutoAlerts([]);
        setSelectedAlert(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteAlert = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/auto_scan/alerts/${id}`, { method: "DELETE" });
      if (res.ok) {
        setAutoAlerts(prev => prev.filter(a => a.id !== id));
        if (selectedAlert?.id === id) {
          setSelectedAlert(null);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSelectAlert = async (alertObj: AutoScanAlert) => {
    setSelectedAlert(alertObj);
    
    // Construct dummy technical metrics
    const dummyMetric: TechnicalMetrics = {
      symbol: alertObj.symbol,
      name: alertObj.symbol,
      price: alertObj.price,
      prevClose: alertObj.price / (1 + alertObj.changePercent / 100),
      changePercent: alertObj.changePercent,
      currency: "IDR",
      sector: "Lainnya",
      rsi: 50,
      macd: { macd: 0, signal: 0, hist: 0 },
      sma50: alertObj.price,
      sma200: alertObj.price,
      supports: [],
      resistances: [],
      nearestSupport: null,
      nearestResistance: null,
      algoSignal: alertObj.algoSignal as any,
      algoReason: `Alert otomatis terdeteksi pada ${new Date(alertObj.timestamp).toLocaleString("id-ID")}`,
      success: true
    };
    
    setSelectedMetric(dummyMetric);
    setAiAdvices((prev) => ({
      ...prev,
      [alertObj.symbol]: alertObj.deepseekRecommendation as any
    }));
    
    setChartData([]);
    setIsFetchingHistory(true);
    try {
      // Pass include_signal=true so the backend calculates all the technical indicators (ADX, Stochastic, Bollinger, ATR, POC)
      const response = await fetch(`/api/yahoo/history?symbol=${encodeURIComponent(alertObj.symbol)}&range=1y&include_signal=true`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.chartPoints) {
          setChartData(data.chartPoints);
          setSelectedMetric({
            ...dummyMetric,
            ...data
          });
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsFetchingHistory(false);
    }
  };

  useEffect(() => {
    if (activeTab === "auto") {
      fetchAutoAlerts();
    }
  }, [activeTab]);

  // Helper to format currency according to the asset's currency type
  function formatAssetPrice(val: number, currency: string) {
    if (currency === "IDR" || !currency) {
      return formatIDR(val);
    }
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
      maximumFractionDigits: 2
    }).format(val);
  }

  // Handle Scanning
  const handleScan = async () => {
    if (!inputTickers.trim()) {
      setScanError("Masukkan minimal satu ticker saham.");
      return;
    }

    const tickers = inputTickers
      .split(/[\s,]+/)
      .map((t) => t.trim().toUpperCase())
      .filter((t) => t.length > 0);

    if (tickers.length === 0) {
      setScanError("Ticker tidak valid.");
      return;
    }

    setIsScanning(true);
    setScanError(null);
    setSelectedMetric(null);
    setChartData([]);

    try {
      const response = await fetch("/api/yahoo/multi_scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ symbols: tickers })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.results) {
        setScanResults(data.results);
      } else {
        throw new Error("Gagal menerima hasil scanning.");
      }
    } catch (err: any) {
      console.error(err);
      setScanError(err.message || "Terjadi kesalahan saat memproses data.");
    } finally {
      setIsScanning(false);
    }
  };

  // Run initial scan on mount if default tickers are loaded
  useEffect(() => {
    if (defaultTickers.length > 0) {
      handleScan();
    }
  }, []);

  // Fetch full details and history when a stock is selected
  const handleSelectStock = async (metric: TechnicalMetrics) => {
    setSelectedMetric(metric);
    setChartData([]);
    setIsFetchingHistory(true);
    setAiError(null);

    try {
      const response = await fetch(`/api/yahoo/history?symbol=${encodeURIComponent(metric.symbol)}&range=1y`);
      if (!response.ok) {
        throw new Error(`Gagal memuat riwayat harga.`);
      }
      const data = await response.json();
      if (data.success && data.chartPoints) {
        setChartData(data.chartPoints);
        // Merge the chart points and other returned fields into the existing metric object to keep calculated indicators
        setSelectedMetric({
          ...metric,
          ...data
        });
      } else {
        throw new Error(data.error || "Gagal mendapatkan data historis.");
      }
    } catch (err: any) {
      console.error(err);
      setAiError(err.message || "Gagal mengambil data historis chart.");
    } finally {
      setIsFetchingHistory(false);
    }
  };

  // Filter chart points based on selected range
  const filteredChartData = useMemo(() => {
    if (!chartData || chartData.length === 0) return [];
    
    let limit = 60;
    if (chartRange === "1mo") limit = 20;
    else if (chartRange === "3mo") limit = 60;
    else limit = 90;

    return chartData.slice(-limit);
  }, [chartData, chartRange]);

  // Generate AI Swing Strategy using DeepSeek via backend
  const generateAiStrategy = async (metric: TechnicalMetrics) => {
    setIsGeneratingAi(true);
    setAiError(null);

    try {
      const response = await fetch("/api/yahoo/review_single", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          symbol: metric.symbol
        })
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson?.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.success && data.review) {
        setAiAdvices((prev) => ({
          ...prev,
          [metric.symbol]: data.review
        }));
      } else {
        throw new Error(data.error || "Gagal mendapatkan review dari DeepSeek.");
      }
    } catch (err: any) {
      console.error(err);
      setAiError(err.message || "Terjadi kesalahan saat menghubungi DeepSeek.");
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // Quick action to load default watchlist
  const loadWatchlist = () => {
    if (defaultTickers.length > 0) {
      setInputTickers(defaultTickers.join(", "));
    } else {
      setScanError("Tidak ada saham dalam tesis investasi saat ini.");
    }
  };

  // Compute summary stats for current scanResults
  const stats = useMemo(() => {
    const total = scanResults.filter(r => r.success).length;
    const buys = scanResults.filter(r => r.success && r.algoSignal === "BUY").length;
    const sells = scanResults.filter(r => r.success && r.algoSignal === "SELL").length;
    const holds = scanResults.filter(r => r.success && r.algoSignal === "HOLD").length;
    return { total, buys, sells, holds };
  }, [scanResults]);

  const renderDetailsGrid = () => {
    if (!selectedMetric) return null;

    const advice = aiAdvices[selectedMetric.symbol];
    const isBuySignal = selectedMetric.algoSignal === "BUY";

    return (
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 15 }}
        className="grid gap-6 md:grid-cols-3"
      >
        {/* Chart and Technical Indicator (Left/Mid) */}
        <div className="md:col-span-2 space-y-6">
          <div className="glass-card p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800/80 pb-4 mb-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-xl font-black text-white">
                    {selectedMetric.symbol} - {selectedMetric.name}
                  </h3>
                  <span className="text-xs bg-slate-900/60 border border-slate-800 text-teal-400 font-bold px-2 py-0.5 rounded-lg flex items-center gap-1">
                    <Activity size={10} />
                    {selectedMetric.marketRegime}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5 font-semibold">
                  <span>Sektor: {selectedMetric.sector}</span>
                  <span>•</span>
                  <span>Mata Uang: {selectedMetric.currency}</span>
                </p>
              </div>
              
              {/* Chart Timeframe Controls */}
              <div className="flex items-center gap-1.5 bg-slate-900/60 p-1 rounded-xl border border-slate-800">
                {["1mo", "3mo", "6mo"].map((range) => (
                  <button
                    key={range}
                    onClick={() => setChartRange(range)}
                    className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
                      chartRange === range
                        ? "bg-slate-800 text-white shadow-sm border border-slate-700/50"
                        : "text-slate-400 hover:text-white"
                    }`}
                    type="button"
                  >
                    {range === "1mo" ? "1 Bulan" : range === "3mo" ? "3 Bulan" : "6 Bulan"}
                  </button>
                ))}
              </div>
            </div>

            {/* Recharts Render */}
            <div className="h-64 relative flex items-center justify-center">
              {isFetchingHistory ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="text-teal animate-spin" size={32} />
                  <p className="text-slate-400 text-xs font-bold">Memuat riwayat harga...</p>
                </div>
              ) : filteredChartData.length === 0 ? (
                <p className="text-slate-500 text-xs font-bold">Data historis tidak tersedia.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={filteredChartData}>
                    <defs>
                      <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0f9f9a" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="#0f9f9a" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} />
                    <XAxis
                      dataKey="date"
                      stroke="#64748b"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      domain={["auto", "auto"]}
                      stroke="#64748b"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) => val.toLocaleString()}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "rgba(15, 23, 42, 0.95)",
                        borderColor: "rgba(148, 163, 184, 0.15)",
                        borderRadius: "12px",
                        boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.5)",
                        padding: "10px"
                      }}
                      labelStyle={{ color: "#f8fafc", fontWeight: "bold", fontSize: "11px" }}
                      itemStyle={{ color: "#cbd5e1", fontSize: "11px" }}
                      formatter={(val: any) => [formatAssetPrice(Number(val), selectedMetric.currency), "Close"]}
                    />
                    
                    {/* Draw K-Means S&R Shaded Clusters Area */}
                    {selectedMetric.kmeansLevels?.map((level, idx) => {
                      const isSupport = level.support < selectedMetric.price;
                      return (
                        <ReferenceArea
                          key={`kmeans-${idx}`}
                          y1={level.support}
                          y2={level.resistance}
                          fill={isSupport ? "#10b981" : "#f43f5e"}
                          fillOpacity={0.05}
                          stroke={isSupport ? "#10b981" : "#f43f5e"}
                          strokeWidth={0.5}
                          strokeOpacity={0.12}
                        />
                      );
                    })}

                    {/* Draw ReferenceLine for Volume Profile Point of Control (POC) */}
                    {selectedMetric.poc && (
                      <ReferenceLine
                        y={selectedMetric.poc}
                        stroke="#06b6d4"
                        strokeWidth={1.5}
                        strokeDasharray="5 5"
                        label={{
                          value: `POC: ${selectedMetric.poc.toLocaleString()}`,
                          position: "right",
                          fill: "#06b6d4",
                          fontSize: 9,
                          fontWeight: "bold"
                        }}
                      />
                    )}

                    {/* Draw Trailing Stop Line */}
                    <Line
                      type="monotone"
                      dataKey="trailingStop"
                      stroke="#f59e0b"
                      strokeWidth={1.5}
                      strokeDasharray="3 3"
                      dot={false}
                      name="ATR Trailing Stop"
                    />

                    <Area
                      type="monotone"
                      dataKey="close"
                      stroke="#0f9f9a"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#priceGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="flex flex-wrap gap-4 justify-between items-center mt-3 pt-3 border-t border-slate-800/80 text-xs font-bold">
              <div className="flex items-center gap-1 text-emerald-400">
                <CheckCircle2 size={12} />
                <span>POC (Volume Gravity): {selectedMetric.poc ? formatAssetPrice(selectedMetric.poc, selectedMetric.currency) : "-"}</span>
              </div>
              <div className="flex items-center gap-1 text-amber-500">
                <Target size={12} />
                <span>ATR Trailing Stop (3x ATR): {selectedMetric.trailingStop ? formatAssetPrice(selectedMetric.trailingStop, selectedMetric.currency) : "-"}</span>
              </div>
            </div>
          </div>

          {/* Detailed Technical Signals list */}
          <div className="glass-card p-6">
            <h4 className="text-md font-bold text-white mb-3 flex items-center gap-1">
              <Activity size={16} className="text-teal" />
              <span>Analisis Metrik Kuantitatif & Rezim</span>
            </h4>
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-800/60">
                <p className="text-slate-400 text-[10px] font-bold mb-1">ADX (Kekuatan Tren)</p>
                <p className={`text-lg font-black ${
                  (selectedMetric.adx ?? 0) > 25 ? "text-cyan-400" : "text-slate-400"
                }`}>
                  {selectedMetric.adx}
                </p>
                <p className="text-[9px] text-slate-500 mt-1 font-semibold">
                  {(selectedMetric.adx ?? 0) > 25 ? `Tren Kuat (+DI:${selectedMetric.plusDi})` : "Pasar Sideways (Ranging)"}
                </p>
              </div>
              
              <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-800/60">
                <p className="text-slate-400 text-[10px] font-bold mb-1">Stochastic (%K / %D)</p>
                <p className={`text-lg font-black ${
                  (selectedMetric.stochasticK ?? 0) < 20 ? "text-emerald-400" :
                  (selectedMetric.stochasticK ?? 0) > 80 ? "text-rose-400" : "text-white"
                }`}>
                  {selectedMetric.stochasticK}% <span className="text-xs font-normal text-slate-400">/ {selectedMetric.stochasticD}%</span>
                </p>
                <p className="text-[9px] text-slate-500 mt-1 font-semibold">
                  {(selectedMetric.stochasticK ?? 0) < 20 ? "Reversi Naik (Oversold)" :
                   (selectedMetric.stochasticK ?? 0) > 80 ? "Risiko Reversi Turun (Overbought)" : "Fluktuasi Tengah"}
                </p>
              </div>

              <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-800/60">
                <p className="text-slate-400 text-[10px] font-bold mb-1">Bollinger Bandwidth</p>
                <p className="text-lg font-black text-white">
                  {(selectedMetric.bbUpper && selectedMetric.bbLower) ? 
                    ((selectedMetric.bbUpper - selectedMetric.bbLower) / (selectedMetric.bbMid || 1)).toFixed(3) : "0.00"
                  }
                </p>
                <p className="text-[9px] text-slate-500 mt-1 font-semibold">
                  {(selectedMetric.bbUpper && selectedMetric.bbLower && ((selectedMetric.bbUpper - selectedMetric.bbLower) / (selectedMetric.bbMid || 1)) < 0.08) ? 
                    "SQUEEZE (Kompresi Volatilitas)" : "Volatilitas Normal"
                  }
                </p>
              </div>

              <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-800/60">
                <p className="text-slate-400 text-[10px] font-bold mb-1">Indikator Volatilitas ATR</p>
                <p className="text-lg font-black text-white font-mono">
                  {selectedMetric.atr?.toLocaleString()}
                </p>
                <p className="text-[9px] text-slate-500 mt-1 font-semibold">
                  Fluktuasi Wajar Sesi
                </p>
              </div>
            </div>
            
            <div className="bg-slate-900/40 rounded-xl p-3.5 border border-slate-800 mt-4 text-xs font-bold">
              <p className="text-slate-400 text-[10px] uppercase tracking-wider mb-1 text-teal">Alasan Sinyal & Konteks Rezim:</p>
              <p className="text-slate-200 font-medium leading-relaxed">{selectedMetric.algoReason}</p>
            </div>
          </div>
        </div>

        {/* AI Trading Advice (Right Side) */}
        <div className="glass-card p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 border-b border-slate-800/80 pb-3 mb-4">
              <Sparkles size={18} className="text-cyan-300 animate-sparkle" />
              <h4 className="text-md font-bold text-white">Fusi AI Trading (DeepSeek)</h4>
            </div>

            {/* Display VIX and Correlation status in AI sidebar */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-2.5">
                <p className="text-slate-500 text-[10px] font-bold">VIX Index (Global)</p>
                <p className={`text-md font-black mt-0.5 ${(selectedMetric.vix ?? 0) > 20 ? "text-rose-400" : "text-white"}`}>
                  {selectedMetric.vix}
                </p>
                <p className="text-[8px] text-slate-500 font-semibold">
                  {(selectedMetric.vix ?? 0) > 20 ? "Volatile (Risk-Off)" : "Normal (Risk-On)"}
                </p>
              </div>
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-2.5">
                <p className="text-slate-500 text-[10px] font-bold">Korelasi S&P 500</p>
                <p className="text-md font-black text-white mt-0.5">
                  {selectedMetric.sp500Correlation}
                </p>
                <p className="text-[8px] text-slate-500 font-semibold">
                  {(selectedMetric.sp500Correlation ?? 0) > 0.7 ? "Asing Mengalir Keluar" : "Faktor Domestik"}
                </p>
              </div>
            </div>

            {advice ? (
              <div className="space-y-4">
                {/* AI Recommendation Badge */}
                <div>
                  <p className="text-slate-500 text-[10px] font-bold">Hasil Keputusan AI Fusi</p>
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black mt-1 ${
                    advice.ai_final_signal === "BUY"
                      ? "bg-emerald-950/40 text-emerald-400 border border-emerald-500/20"
                      : advice.ai_final_signal === "HOLD"
                      ? "bg-amber-950/40 text-amber-400 border border-amber-500/20"
                      : "bg-rose-950/40 text-rose-400 border border-rose-500/20"
                  }`}>
                    {advice.ai_final_signal}
                  </span>
                </div>

                {/* Confidence Level */}
                <div className="flex justify-between items-center text-xs font-bold py-1 border-b border-slate-800/40">
                  <span className="text-slate-400">Tingkat Keyakinan AI:</span>
                  <span className={`font-black uppercase ${
                    advice.ai_confidence === "high" ? "text-emerald-400" :
                    advice.ai_confidence === "medium" ? "text-amber-500" : "text-slate-400"
                  }`}>
                    {advice.ai_confidence === "high" ? "Tinggi" : advice.ai_confidence === "medium" ? "Sedang" : "Rendah"}
                  </span>
                </div>

                {/* AI Reasoning */}
                <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-3 text-xs font-semibold">
                  <p className="text-teal font-bold mb-1 uppercase tracking-wider text-[9px]">Analisis Review DeepSeek:</p>
                  <p className="text-slate-200 leading-relaxed font-medium">{advice.ai_reason}</p>
                </div>

                {/* Risk Notes */}
                {advice.ai_risk_note && (
                  <div className="bg-rose-950/10 border border-rose-900/30 rounded-xl p-3 text-xs font-semibold">
                    <p className="text-rose-400 font-bold mb-1 uppercase tracking-wider text-[9px]">Catatan Risiko Keamanan:</p>
                    <p className="text-slate-300 leading-relaxed font-medium">{advice.ai_risk_note}</p>
                  </div>
                )}

                {/* Entry/Exit Strategy Grid */}
                <div className="grid grid-cols-2 gap-3 mt-2 text-xs font-semibold">
                  <div className="bg-slate-900/20 border border-slate-850 p-2.5 rounded-xl">
                    <p className="text-emerald-400 font-bold text-[9px] uppercase tracking-wider mb-1">Strategi Entry:</p>
                    <p className="text-slate-300 leading-relaxed text-[11px]">{advice.ai_entry_comment || "-"}</p>
                  </div>
                  <div className="bg-slate-900/20 border border-slate-850 p-2.5 rounded-xl">
                    <p className="text-amber-500 font-bold text-[9px] uppercase tracking-wider mb-1">Strategi Exit:</p>
                    <p className="text-slate-300 leading-relaxed text-[11px]">{advice.ai_exit_comment || "-"}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 space-y-4">
                <div className="p-3 bg-cyan-950/20 border border-cyan-500/20 text-cyan-400 rounded-full inline-block">
                  <Sparkles size={24} className="animate-pulse" />
                </div>
                <div className="space-y-1">
                  <p className="text-white text-sm font-bold">Riset AI Kuantitatif Fusi</p>
                  <p className="text-slate-400 text-xs leading-relaxed max-w-[210px] mx-auto">
                    Mengintegrasikan parameter S&R Volume, Volatilitas ATR, Korelasi makro S&P 500, VIX, PEG, & Div Yield menggunakan DeepSeek AI.
                  </p>
                </div>
                {isBuySignal ? (
                  <button
                    onClick={() => generateAiStrategy(selectedMetric)}
                    disabled={isGeneratingAi}
                    type="button"
                    className="inline-flex items-center justify-center gap-1.5 text-xs font-bold secondary-button !py-2.5 px-4 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-xl shadow border-0 hover:brightness-110 disabled:opacity-50"
                  >
                    {isGeneratingAi ? (
                      <>
                        <Loader2 size={12} className="animate-spin" />
                        <span>Fusi Kuantitatif...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={12} />
                        <span>Analisis AI Fusi Kuantitatif</span>
                      </>
                    )}
                  </button>
                ) : (
                  <p className="text-slate-500 text-xs font-bold leading-relaxed max-w-[200px] mx-auto bg-slate-900/30 p-2.5 rounded-xl border border-slate-850">
                    Analisis DeepSeek AI hanya dapat dijalankan pada saham dengan sinyal kuantitatif BUY.
                  </p>
                )}
              </div>
            )}

            {aiError && (
              <div className="mt-3 text-rose-400 text-xs font-bold flex items-start gap-1 bg-rose-950/20 border border-rose-500/20 p-3 rounded-xl">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>{aiError}</span>
              </div>
            )}
          </div>
          
          <div className="border-t border-slate-800/80 pt-3 mt-4 text-[10px] text-slate-500 flex items-center gap-1">
            <HelpCircle size={10} />
            <span>Fusi Kuantitatif memanfaatkan visualisasi Volume Profile dan fundamental PEG.</span>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header Halaman */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-white flex items-center gap-2">
            <TrendingUp className="text-teal" />
            <span>Algo & AI Trading Scanner</span>
          </h2>
          <p className="text-slate-400 text-sm mt-0.5">
            Pindai multi-saham secara real-time untuk mendeteksi level K-Means S&R, Volatilitas ATR, ADX, Bollinger Squeeze, dan fusi makro-fundamental dari DeepSeek AI.
          </p>
        </div>
      </div>

      {/* Segmented Control Tab Switcher */}
      <div className="flex p-1 bg-slate-900/60 border border-slate-800 rounded-2xl max-w-md">
        <button
          onClick={() => {
            setActiveTab("manual");
            setSelectedMetric(null);
          }}
          type="button"
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${
            activeTab === "manual"
              ? "bg-teal text-slate-950 shadow-md font-bold"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <Search size={14} />
          <span>Pindai Manual</span>
        </button>
        <button
          onClick={() => {
            setActiveTab("auto");
            setSelectedMetric(null);
            fetchAutoAlerts();
          }}
          type="button"
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${
            activeTab === "auto"
              ? "bg-teal text-slate-950 shadow-md font-bold"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <Bell size={14} />
          <span>Alert Otomatis (Auto-Scan)</span>
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === "manual" ? (
          <motion.div
            key="manual-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6"
          >
            {/* Control Console */}
            <div className="grid gap-6 md:grid-cols-3">
              <div className="md:col-span-2 glass-card p-6 flex flex-col justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-3">
                    <Search size={18} className="text-teal" />
                    <span>Daftar Simbol Pemindaian</span>
                  </h3>
                  <textarea
                    className="w-full h-24 rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-white placeholder-slate-500 focus:border-teal/50 focus:outline-none transition-all resize-none text-sm font-semibold"
                    placeholder="Masukkan ticker saham (pisahkan dengan koma atau spasi), contoh: BBRI, TLKM, ASII, GOTO, AAPL, TSLA"
                    value={inputTickers}
                    onChange={(e) => setInputTickers(e.target.value)}
                  />
                  {scanError && (
                    <div className="mt-2 text-rose-400 text-xs font-bold flex items-center gap-1">
                      <AlertCircle size={14} />
                      <span>{scanError}</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
                  <button
                    onClick={loadWatchlist}
                    type="button"
                    className="text-xs font-bold text-teal hover:underline flex items-center gap-1.5"
                  >
                    <RefreshCw size={12} />
                    <span>Muat Saham dari Tesis ({defaultTickers.length})</span>
                  </button>
                  <button
                    onClick={handleScan}
                    disabled={isScanning}
                    type="button"
                    className="secondary-button !py-2.5 px-6 font-bold flex items-center gap-2 bg-gradient-to-r from-teal to-emerald-500 text-white rounded-xl shadow-md border-0 hover:brightness-110 disabled:opacity-50"
                  >
                    {isScanning ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Memindai...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} className="animate-sparkle" />
                        <span>Mulai Scanning</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Stats Summary Panel */}
              <div className="glass-card p-6 flex flex-col justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white mb-4">Ringkasan Sinyal Scan</h3>
                  {scanResults.length === 0 ? (
                    <div className="text-slate-500 text-sm flex items-center gap-2 py-4">
                      <Info size={16} />
                      <span>Belum ada hasil pemindaian. Klik "Mulai Scanning" di sebelah kiri.</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-3 text-center">
                        <p className="text-slate-400 text-xs font-bold">Total Saham</p>
                        <p className="text-2xl font-black text-white mt-1">{stats.total}</p>
                      </div>
                      <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-xl p-3 text-center">
                        <p className="text-emerald-400 text-xs font-bold">Sinyal BUY</p>
                        <p className="text-2xl font-black text-emerald-400 mt-1">{stats.buys}</p>
                      </div>
                      <div className="bg-amber-950/20 border border-amber-500/20 rounded-xl p-3 text-center">
                        <p className="text-amber-400 text-xs font-bold">Sinyal HOLD</p>
                        <p className="text-2xl font-black text-amber-400 mt-1">{stats.holds}</p>
                      </div>
                      <div className="bg-rose-950/20 border border-rose-500/20 rounded-xl p-3 text-center">
                        <p className="text-rose-400 text-xs font-bold">Sinyal SELL</p>
                        <p className="text-2xl font-black text-rose-400 mt-1">{stats.sells}</p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="text-[10px] text-slate-500 mt-2 flex items-center gap-1.5">
                  <Info size={10} />
                  <span>Bobot skoring adaptif berbasis rezim pasar ADX & Bollinger Squeeze.</span>
                </div>
              </div>
            </div>

            {/* Results Table */}
            {scanResults.length > 0 && (
              <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/30 text-xs font-bold tracking-wider text-slate-400">
                        <th className="p-4 pl-6">Kode</th>
                        <th className="p-4">Nama Perusahaan</th>
                        <th className="p-4">Rezim Pasar</th>
                        <th className="p-4 text-right">Harga Terakhir</th>
                        <th className="p-4 text-center">ADX (14)</th>
                        <th className="p-4 text-center">Stochastic %K</th>
                        <th className="p-4 text-center">VIX / Kor SPX</th>
                        <th className="p-4 text-center">Sinyal Algo</th>
                        <th className="p-4 pr-6 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850 text-sm font-semibold text-white">
                      {scanResults.map((result) => {
                        if (!result.success) {
                          return (
                            <tr key={result.symbol} className="hover:bg-slate-800/20">
                              <td className="p-4 pl-6 text-slate-500 font-bold">{result.symbol}</td>
                              <td colSpan={7} className="p-4 text-rose-400 text-xs font-bold">
                                Gagal memuat: {result.error || "Simbol tidak ditemukan"}
                              </td>
                              <td className="p-4 pr-6 text-center">-</td>
                            </tr>
                          );
                        }

                        const isSelected = selectedMetric?.symbol === result.symbol;
                        const signal = result.algoSignal;
                        let signalClass = "bg-amber-950/40 text-amber-400 border border-amber-500/20";
                        if (signal === "BUY") signalClass = "bg-emerald-950/40 text-emerald-400 border border-emerald-500/20";
                        else if (signal === "SELL") signalClass = "bg-rose-950/40 text-rose-400 border border-rose-500/20";

                        return (
                          <tr
                            key={result.symbol}
                            className={`hover:bg-slate-800/20 transition-all cursor-pointer ${
                              isSelected ? "bg-slate-800/40 border-l-4 border-l-teal" : ""
                            }`}
                            onClick={() => handleSelectStock(result)}
                          >
                            <td className="p-4 pl-6 font-black text-teal">{result.symbol}</td>
                            <td className="p-4 truncate max-w-[180px]">{result.name}</td>
                            <td className="p-4 text-xs font-bold text-slate-300">
                              <span className="flex items-center gap-1">
                                <Compass size={12} className="text-cyan-400" />
                                {result.marketRegime}
                              </span>
                            </td>
                            <td className="p-4 text-right">
                              <p>{formatAssetPrice(result.price, result.currency)}</p>
                              <p className={`text-xs ${result.changePercent >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                {result.changePercent >= 0 ? "▲" : "▼"} {Math.abs(result.changePercent)}%
                              </p>
                            </td>
                            <td className="p-4 text-center font-mono">{result.adx ?? "-"}</td>
                            <td className="p-4 text-center font-mono">
                              {result.stochasticK !== undefined ? `${result.stochasticK}%` : "-"}
                            </td>
                            <td className="p-4 text-center text-xs">
                              <p className="font-mono text-slate-300">{result.vix ?? "-"}</p>
                              <p className="text-[10px] text-slate-500 font-mono">Corr: {result.sp500Correlation ?? "-"}</p>
                            </td>
                            <td className="p-4 text-center">
                              <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${signalClass}`}>
                                {signal}
                              </span>
                            </td>
                            <td className="p-4 pr-6 text-center">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectStock(result);
                                }}
                                type="button"
                                className="text-xs font-bold text-teal hover:underline"
                              >
                                Detail
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Details Panel */}
            <AnimatePresence mode="wait">
              {selectedMetric && renderDetailsGrid()}
            </AnimatePresence>
          </motion.div>
        ) : (
          <motion.div
            key="auto-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6"
          >
            {/* Status Background Auto-Scanner Card */}
            <div className="glass-card p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-full ${
                    autoScanStatus?.is_running
                      ? "bg-teal/10 border border-teal/20 text-teal"
                      : settings.autoScanEnabled
                      ? "bg-emerald-950/20 border border-emerald-500/20 text-emerald-400"
                      : "bg-slate-900 border border-slate-800 text-slate-500"
                  }`}>
                    <Activity size={24} className={autoScanStatus?.is_running ? "animate-pulse" : ""} />
                  </div>
                  <div>
                    <h3 className="text-md font-bold text-white flex items-center gap-1.5">
                      <span>Status Background Auto-Scanner</span>
                      {autoScanStatus?.is_running && (
                        <span className="text-xs font-normal text-teal bg-teal/10 px-2 py-0.5 rounded-md flex items-center gap-1">
                          <Loader2 size={10} className="animate-spin" />
                          Running Scan
                        </span>
                      )}
                    </h3>
                    <p className="text-xs font-semibold mt-1">
                      {autoScanStatus?.is_running ? (
                        <span className="text-teal">
                          Memindai {autoScanStatus.current_ticker} ({autoScanStatus.current}/{autoScanStatus.total})
                        </span>
                      ) : settings.autoScanEnabled ? (
                        <span className="text-emerald-400">
                          Aktif (Memindai watchlist setiap {settings.autoScanInterval} menit)
                        </span>
                      ) : (
                        <span className="text-slate-500">Nonaktif (Aktifkan di Pengaturan)</span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleClearAlerts}
                    disabled={autoAlerts.length === 0}
                    type="button"
                    className="secondary-button !py-2 px-4 text-xs font-bold text-slate-400 hover:text-white border border-slate-800 bg-slate-900/40 rounded-xl disabled:opacity-40"
                  >
                    <Trash2 size={12} className="inline mr-1.5 -mt-0.5" />
                    <span>Bersihkan Histori</span>
                  </button>
                  <button
                    onClick={handleTriggerAutoScan}
                    disabled={isTriggeringAutoScan || autoScanStatus?.is_running}
                    type="button"
                    className="secondary-button !py-2 px-4 text-xs font-bold bg-gradient-to-r from-teal to-emerald-500 text-white rounded-xl shadow border-0 hover:brightness-110 disabled:opacity-50"
                  >
                    {isTriggeringAutoScan ? (
                      <>
                        <Loader2 size={12} className="animate-spin inline mr-1.5" />
                        <span>Memicu...</span>
                      </>
                    ) : (
                      <>
                        <Play size={12} className="inline mr-1.5" />
                        <span>Trigger Scan Sekarang</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Progress Bar */}
              {autoScanStatus?.is_running && autoScanStatus.total > 0 && (
                <div className="mt-4">
                  <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800/80">
                    <div
                      className="h-full bg-gradient-to-r from-teal to-cyan-500 transition-all duration-300"
                      style={{ width: `${(autoScanStatus.current / autoScanStatus.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Alerts List & Details Grid */}
            {autoAlerts.length > 0 ? (
              <div className="grid gap-6 md:grid-cols-3">
                {/* Left side: alerts list */}
                <div className="md:col-span-1 glass-card p-4 space-y-3 h-[600px] overflow-y-auto">
                  <h3 className="text-md font-bold text-white border-b border-slate-800 pb-2 mb-2 flex items-center justify-between">
                    <span>Daftar Alert</span>
                    <span className="text-xs bg-slate-900/60 border border-slate-800 text-teal-400 font-bold px-2 py-0.5 rounded-lg">
                      {autoAlerts.length}
                    </span>
                  </h3>
                  <div className="space-y-2">
                    {autoAlerts.map((alert) => {
                      const isSelected = selectedAlert?.id === alert.id;
                      return (
                        <div
                          key={alert.id}
                          onClick={() => {
                            setSelectedAlert(alert);
                            handleSelectAlert(alert);
                          }}
                          className={`p-3.5 rounded-xl border transition-all cursor-pointer relative group flex flex-col gap-1 ${
                            isSelected
                              ? "bg-slate-800/60 border-teal"
                              : "bg-slate-900/40 border-slate-850 hover:border-slate-800"
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-black text-sm text-teal">{alert.symbol}</span>
                            <span className="text-[10px] text-slate-500 font-bold">
                              {new Date(alert.timestamp).toLocaleTimeString("id-ID", {
                                hour: "2-digit",
                                minute: "2-digit"
                              })}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-xs mt-1">
                            <span className="text-white font-bold">{formatAssetPrice(alert.price, "IDR")}</span>
                            <span className="bg-emerald-950/40 text-emerald-400 font-bold px-1.5 py-0.5 rounded text-[10px] border border-emerald-500/10">
                              BUY
                            </span>
                          </div>
                          <button
                            onClick={(e) => handleDeleteAlert(alert.id, e)}
                            className="absolute top-2 right-2 p-1 text-slate-500 hover:text-rose-450 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Hapus Alert"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right side: Selected Alert Details */}
                <div className="md:col-span-2 space-y-6">
                  <AnimatePresence mode="wait">
                    {selectedMetric ? (
                      renderDetailsGrid()
                    ) : (
                      <div className="glass-card p-12 text-center flex flex-col items-center justify-center h-[600px] text-slate-500">
                        <Bell size={48} className="text-slate-700 animate-pulse mb-3" />
                        <p className="font-bold text-white text-sm">Belum Ada Alert yang Dipilih</p>
                        <p className="text-xs mt-1 max-w-xs mx-auto leading-relaxed">
                          Pilih salah satu alert dari daftar di sebelah kiri untuk meninjau detail teknikal dan analisis DeepSeek.
                        </p>
                      </div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            ) : (
              /* Empty State */
              <div className="glass-card p-12 text-center flex flex-col items-center justify-center py-20">
                <div className="p-4 bg-slate-900/60 border border-slate-800 text-slate-500 rounded-full mb-4">
                  <Bell size={32} />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Belum Ada Alert Otomatis</h3>
                <p className="text-slate-400 text-xs leading-relaxed max-w-md mx-auto">
                  Scanner otomatis akan berjalan di latar belakang sesuai interval Anda, menyaring watchlist Anda, dan menyimpan alert di sini apabila mendeteksi sinyal BUY.
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}