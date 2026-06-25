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
}

interface AiTradingAdvice {
  actionable_signal: "STRONG_BUY" | "BUY" | "HOLD" | "SELL_SHORT";
  swing_trading_tactics: {
    recommended_entry_range: [number, number];
    profit_taking_target_1: number;
    dynamic_stop_loss_level: number;
    holding_period_weeks: number;
  };
  risk_assessment: {
    risk_to_reward_ratio: number;
    macro_vulnerability_index: number;
    fundamental_safety_shield: string;
  };
}

export function TradingScanner({ settings, theses }: TradingScannerProps) {
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
      [alertObj.symbol]: alertObj.geminiRecommendation
    }));
    
    setChartData([]);
    setIsFetchingHistory(true);
    try {
      const response = await fetch(`/api/yahoo/history?symbol=${encodeURIComponent(alertObj.symbol)}&range=1y`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.chartPoints) {
          setChartData(data.chartPoints);
          setSelectedMetric(data);
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
        setSelectedMetric(data);
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

  // Generate AI Swing Strategy using Gemini
  const generateAiStrategy = async (metric: TechnicalMetrics) => {
    // Collect all available Gemini API Keys for rotation
    const keys: string[] = [];
    if (settings.geminiApiKeys && settings.geminiApiKeys.length > 0) {
      settings.geminiApiKeys.forEach((k) => {
        if (k && k.trim()) keys.push(k.trim());
      });
    }
    if (settings.geminiApiKey && settings.geminiApiKey.trim() && !keys.includes(settings.geminiApiKey.trim())) {
      keys.push(settings.geminiApiKey.trim());
    }
    const envKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;
    if (envKey && envKey.trim() && !keys.includes(envKey.trim())) {
      keys.push(envKey.trim());
    }

    if (keys.length === 0) {
      setAiError("Kunci API Gemini belum diatur. Silakan masukkan di halaman Pengaturan.");
      return;
    }

    setIsGeneratingAi(true);
    setAiError(null);

    // Dynamic extraction of fundamental parameters from existing investment theses
    const matchingThesis = theses.find(t => t.ticker.toUpperCase() === metric.symbol.toUpperCase());
    let peVal = "N/A";
    let roeVal = "N/A";
    let pegVal = "N/A";
    let divYield = "N/A";
    
    if (matchingThesis) {
      divYield = "3.5%"; // Default placeholder for dividend
      if (matchingThesis.fundamentalMetrics && matchingThesis.fundamentalMetrics.length > 0) {
        const latestMetric = [...matchingThesis.fundamentalMetrics].sort((a, b) => b.year.localeCompare(a.year))[0];
        if (latestMetric.pe) peVal = latestMetric.pe.toString();
        roeVal = `${latestMetric.roe}%`;
        
        // Est. PEG as PE / ROE
        if (latestMetric.pe && latestMetric.roe > 0) {
          pegVal = (latestMetric.pe / latestMetric.roe).toFixed(2);
        }
      }
    }

    const promptText = `
{
  "system_directive": "Anda dikonfigurasi sebagai AI Kuantitatif Senior. Tugas Anda adalah melakukan fusi analitik metrik historis, profil volume harga, rasio nilai perusahaan (PEG), dan indikator makroekonomi (VIX/IHSG) untuk emiten yang disuplai. Jangan sertakan argumentasi tekstual bebas. Hasil akhir wajib distrukturkan secara murni sesuai output_schema yang diwajibkan tanpa prolog apa pun.",
  "context_injection": {
    "macro_environment": {
      "IHSG_trend": "${(metric.sp500Correlation ?? 0) > 0.7 ? 'Korelasi Kuat dengan S&P 500' : 'Konsolidasi Lokal'}",
      "SP500_correlation_coefficient": ${metric.sp500Correlation || 0.5},
      "global_VIX_index": ${metric.vix || 15.0},
      "macro_status": "${(metric.vix ?? 15) > 20 ? 'Volatilitas tinggi, arus keluar modal' : 'Pasar stabil, wajar'}"
    },
    "fundamental_metrics": {
      "ticker": "${metric.symbol}",
      "company_name": "${metric.name}",
      "PE_ratio": "${peVal}",
      "ROE_ratio": "${roeVal}",
      "PEG_ratio": ${pegVal !== "N/A" ? pegVal : 1.0},
      "dividend_yield_percent": ${divYield.replace("%", "")},
      "valuation_state": "${pegVal !== "N/A" && parseFloat(pegVal) < 1.0 ? 'Undervalued' : 'Wajar'}"
    }
  },
  "quantitative_technical_data": {
    "current_price": ${metric.price},
    "currency": "${metric.currency}",
    "trend_classification": "${metric.marketRegime} (ADX = ${metric.adx})",
    "momentum_state": "RSI = ${metric.rsi}, Stochastic K = ${metric.stochasticK}",
    "volatility_ATR": ${metric.atr},
    "volume_profile": {
      "point_of_control_POC": ${metric.poc},
      "supports_kmeans": [${metric.supports?.join(", ")}],
      "resistances_kmeans": [${metric.resistances?.join(", ")}]
    },
    "nearest_support": ${metric.nearestSupport},
    "nearest_resistance": ${metric.nearestResistance}
  },
  "output_schema": {
    "actionable_signal": "STRONG_BUY | BUY | HOLD | SELL_SHORT",
    "swing_trading_tactics": {
      "recommended_entry_range": [min_price, max_price],
      "profit_taking_target_1": target_price,
      "dynamic_stop_loss_level": stop_loss_price,
      "holding_period_weeks": number_of_weeks
    },
    "risk_assessment": {
      "risk_to_reward_ratio": ratio_value,
      "macro_vulnerability_index": integer_1_to_10,
      "fundamental_safety_shield": "penjelasan mengapa valuasi atau PEG memitigasi kejatuhan teknikal"
    }
  }
}
`;

    const systemInstruction = `Kamu adalah asisten algo trading dan analis kuantitatif profesional. Analisis data input yang disediakan dan kembalikan response murni sesuai output_schema JSON tanpa penjelasan di luar JSON.`;

    let success = false;
    let lastErrorMsg = "";
    let parsedAdvice: AiTradingAdvice | null = null;

    for (let i = 0; i < keys.length; i++) {
      const activeApiKey = keys[i];
      try {
        console.log(`Menghubungi Gemini AI dengan API Key indeks #${i + 1}...`);
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${activeApiKey}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              contents: [
                {
                  role: "user",
                  parts: [{ text: promptText }]
                }
              ],
              systemInstruction: {
                parts: [{ text: systemInstruction }]
              },
              generationConfig: {
                responseMimeType: "application/json"
              }
            })
          }
        );

        if (!response.ok) {
          const errJson = await response.json().catch(() => ({}));
          throw new Error(errJson?.error?.message || `HTTP error! status: ${response.status}`);
        }

        const resJson = await response.json();
        const textResponse = resJson?.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!textResponse) {
          throw new Error("Gagal menerima respon dari asisten AI.");
        }

        parsedAdvice = JSON.parse(textResponse) as AiTradingAdvice;
        success = true;
        break; // Success! Break loop
      } catch (err: any) {
        console.warn(`Panggilan Gemini menggunakan API Key indeks #${i + 1} gagal:`, err.message);
        lastErrorMsg = err.message || "Unknown error";
      }
    }

    if (success && parsedAdvice) {
      setAiAdvices((prev) => ({
        ...prev,
        [metric.symbol]: parsedAdvice!
      }));
    } else {
      setAiError(`Gagal menghubungi Gemini AI dengan seluruh kunci API Anda. Error terakhir: ${lastErrorMsg}`);
    }
    setIsGeneratingAi(false);
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
            Pindai multi-saham secara real-time untuk mendeteksi level K-Means S&R, Volatilitas ATR, ADX, Bollinger Squeeze, dan fusi makro-fundamental dari Gemini AI.
          </p>
        </div>
      </div>

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

      {/* Results Table & Details Grid */}
      <AnimatePresence mode="wait">
        {scanResults.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6"
          >
            {/* Table */}
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
                          <td className="p-4 text-center">
                            <span className={`text-xs px-2.5 py-1 rounded-lg ${
                              (result.adx ?? 0) > 25 ? "bg-cyan-950/30 text-cyan-400 border border-cyan-500/20 font-bold" : "bg-slate-800 text-slate-400"
                            }`}>
                              {result.adx}
                            </span>
                          </td>
                          <td className="p-4 text-center">
                            <span className={`text-xs px-2.5 py-1 rounded-lg ${
                              (result.stochasticK ?? 0) < 20 ? "bg-emerald-950/30 text-emerald-400 border border-emerald-500/20 font-bold" :
                              (result.stochasticK ?? 0) > 80 ? "bg-rose-950/30 text-rose-400 border border-rose-500/20 font-bold" :
                              "bg-slate-850 text-slate-300"
                            }`}>
                              {result.stochasticK}%
                            </span>
                          </td>
                          <td className="p-4 text-center text-xs text-slate-400">
                            <span className="font-mono">{result.vix}</span>
                            <span className="mx-1">/</span>
                            <span className={`font-semibold ${(result.sp500Correlation ?? 0) > 0.7 ? "text-rose-400" : "text-slate-400"}`}>
                              {result.sp500Correlation}
                            </span>
                          </td>
                          <td className="p-4 text-center">
                            <span className={`text-xs px-3 py-1 rounded-full font-black ${signalClass}`}>
                              {signal}
                            </span>
                          </td>
                          <td className="p-4 pr-6 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => handleSelectStock(result)}
                              type="button"
                              className="inline-flex items-center gap-1 text-xs text-teal hover:underline font-bold"
                            >
                              <span>Analisis</span>
                              <ChevronRight size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Interactive Detail Section */}
            <AnimatePresence>
              {selectedMetric && (
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
                        <h4 className="text-md font-bold text-white">Fusi AI Trading (Gemini)</h4>
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

                      {aiAdvices[selectedMetric.symbol] ? (
                        <div className="space-y-4">
                          {/* AI Recommendation Badge */}
                          <div>
                            <p className="text-slate-500 text-[10px] font-bold">Hasil Keputusan AI Fusi</p>
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black mt-1 ${
                              aiAdvices[selectedMetric.symbol].actionable_signal.includes("BUY")
                                ? "bg-emerald-950/40 text-emerald-400 border border-emerald-500/20"
                                : aiAdvices[selectedMetric.symbol].actionable_signal.includes("SELL")
                                ? "bg-rose-950/40 text-rose-400 border border-rose-500/20"
                                : "bg-amber-950/40 text-amber-400 border border-amber-500/20"
                            }`}>
                              {aiAdvices[selectedMetric.symbol].actionable_signal}
                            </span>
                          </div>

                          {/* Trading Targets Grid */}
                          <div className="grid grid-cols-1 gap-2.5 bg-slate-900/40 border border-slate-800/80 rounded-xl p-3 text-xs font-bold">
                            <div className="flex justify-between items-center py-1">
                              <span className="text-slate-400 flex items-center gap-1"><Target size={12} className="text-emerald-400" /> Entry Range:</span>
                              <span className="text-white font-mono">
                                {aiAdvices[selectedMetric.symbol].swing_trading_tactics.recommended_entry_range ? 
                                  `${aiAdvices[selectedMetric.symbol].swing_trading_tactics.recommended_entry_range[0]} - ${aiAdvices[selectedMetric.symbol].swing_trading_tactics.recommended_entry_range[1]}` : "-"
                                }
                              </span>
                            </div>
                            <div className="flex justify-between items-center py-1 border-t border-slate-800/40">
                              <span className="text-slate-400 flex items-center gap-1"><ArrowRight size={12} className="text-teal" /> Target Profit:</span>
                              <span className="text-white font-mono">
                                {aiAdvices[selectedMetric.symbol].swing_trading_tactics.profit_taking_target_1?.toLocaleString()}
                              </span>
                            </div>
                            <div className="flex justify-between items-center py-1 border-t border-slate-800/40">
                              <span className="text-slate-400 flex items-center gap-1"><AlertCircle size={12} className="text-rose-400" /> Stop Loss (ATR):</span>
                              <span className="text-white font-mono">
                                {aiAdvices[selectedMetric.symbol].swing_trading_tactics.dynamic_stop_loss_level?.toLocaleString()}
                              </span>
                            </div>
                            <div className="flex justify-between items-center py-1 border-t border-slate-800/40">
                              <span className="text-slate-400 flex items-center gap-1"><Activity size={12} className="text-cyan-400" /> Waktu Simpan:</span>
                              <span className="text-white font-mono">
                                {aiAdvices[selectedMetric.symbol].swing_trading_tactics.holding_period_weeks} Minggu
                              </span>
                            </div>
                          </div>

                          {/* Risk to Reward and Vulnerability */}
                          <div className="grid grid-cols-2 gap-3 bg-slate-900/20 border border-slate-850 p-2.5 rounded-xl text-xs font-semibold">
                            <div>
                              <p className="text-slate-500 text-[10px] font-bold">Rasio Risk-Reward</p>
                              <p className="text-sm font-black text-teal-300 mt-0.5">
                                1 : {aiAdvices[selectedMetric.symbol].risk_assessment.risk_to_reward_ratio}
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-500 text-[10px] font-bold">Vulnerability Index</p>
                              <p className={`text-sm font-black mt-0.5 ${
                                aiAdvices[selectedMetric.symbol].risk_assessment.macro_vulnerability_index > 6 ? "text-rose-400" : "text-white"
                              }`}>
                                {aiAdvices[selectedMetric.symbol].risk_assessment.macro_vulnerability_index} / 10
                              </p>
                            </div>
                          </div>

                          {/* Fundamental Safety Shield Explanation */}
                          <div>
                            <p className="text-slate-400 text-xs font-bold mb-1 flex items-center gap-1">
                              <ShieldCheck size={14} className="text-teal" />
                              <span>Fundamental Safety Shield:</span>
                            </p>
                            <p className="text-slate-300 text-xs leading-relaxed font-medium bg-slate-900/30 p-3 rounded-lg border border-slate-850">
                              {aiAdvices[selectedMetric.symbol].risk_assessment.fundamental_safety_shield}
                            </p>
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
                              Mengintegrasikan parameter S&R Volume, Volatilitas ATR, Korelasi makro S&P 500, VIX, PEG, & Div Yield menggunakan Gemini.
                            </p>
                          </div>
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
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}