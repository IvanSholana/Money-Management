import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarDays,
  Coins,
  Sparkles,
  TrendingUp,
  Play,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Plus,
  Search,
  HelpCircle,
  Activity,
  Edit2,
  Trash2,
  Check,
  RefreshCw,
  Info,
  Calendar,
  BookOpenCheck
} from "lucide-react";
import { DividendEvent, DividendMomentumCandidate } from "../types";

type ScannerProps = {
  settings: any;
  theses: any[];
  onThesesChange: (theses: any[]) => void;
};

export function DividendMomentumScanner({ settings, theses, onThesesChange }: ScannerProps) {
  const [activeTab, setActiveTab] = useState<"candidates" | "review-queue" | "backtest">("candidates");
  const [isScanning, setIsScanning] = useState(false);
  const [candidates, setCandidates] = useState<DividendMomentumCandidate[]>([]);
  const [rejected, setRejected] = useState<any[]>([]);
  const [eventsQueue, setEventsQueue] = useState<DividendEvent[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<DividendMomentumCandidate | null>(null);
  
  // Scanning parameters
  const [syariahOnly, setSyariahOnly] = useState(true);
  const [minYield, setMinYield] = useState<number>(1.5);
  const [minDays, setMinDays] = useState<number>(2);
  const [maxDays, setMaxDays] = useState<number>(30);
  const [includeReviewQueue, setIncludeReviewQueue] = useState(false);
  
  // Collection run stats summary
  const [collectionStats, setCollectionStats] = useState<any | null>(null);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  
  // Backtest state
  const [backtestSymbol, setBacktestSymbol] = useState("TLKM");
  const [backtestYears, setBacktestYears] = useState(5);
  const [backtestStrategy, setBacktestStrategy] = useState("buy_h10_sell_h1");
  const [backtestResult, setBacktestResult] = useState<any | null>(null);
  const [isBacktesting, setIsBacktesting] = useState(false);
  const [backtestError, setBacktestError] = useState<string | null>(null);

  // Manual fallback input form state
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualForm, setManualForm] = useState({
    ticker: "",
    dividend_per_share: "",
    announcement_date: "",
    cum_date_regular: "",
    ex_date_regular: "",
    recording_date: "",
    payment_date: "",
    source_name: "Manual Fallback"
  });
  const [manualSubmitStatus, setManualSubmitStatus] = useState<string | null>(null);

  // Editing queue event state
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingFields, setEditingFields] = useState<Partial<DividendEvent>>({});

  // 1. Run scanner
  const handleRunScan = async (forceRefresh = false) => {
    setIsScanning(true);
    setScanError(null);
    setScanMessage(null);
    setCollectionStats(null);
    setSelectedCandidate(null);

    try {
      const response = await fetch("/api/dividend/scan-auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          syariah_only: syariahOnly,
          min_dividend_yield_percent: minYield,
          min_days_to_cum: minDays,
          max_days_to_cum: maxDays,
          include_needs_review: includeReviewQueue,
          auto_collect_first: true,
          force_refresh: forceRefresh
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.status === "success") {
        setCandidates(data.candidates || []);
        setRejected(data.rejected || []);
        if (data.collection_summary) {
          setCollectionStats(data.collection_summary);
        }
        setScanMessage("Scan dividen berhasil diselesaikan.");
        
        // Select first candidate by default if any
        if (data.candidates && data.candidates.length > 0) {
          setSelectedCandidate(data.candidates[0]);
        }
      } else {
        throw new Error(data.errors?.join(", ") || "Terjadi kesalahan scanning.");
      }
    } catch (err: any) {
      console.error(err);
      setScanError(err.message || "Gagal menghubungi backend.");
    } finally {
      setIsScanning(false);
    }
  };

  // 2. Fetch Review Queue Events
  const fetchReviewQueue = async () => {
    try {
      const response = await fetch("/api/dividend/events");
      if (response.ok) {
        const data = await response.json();
        // Filter: needs_review
        const filtered = (data.events || []).filter(
          (e: DividendEvent) => e.verification_status === "needs_review"
        );
        setEventsQueue(filtered);
      }
    } catch (err) {
      console.error("Gagal memuat antrean dividen:", err);
    }
  };

  useEffect(() => {
    handleRunScan(false);
    fetchReviewQueue();
  }, []);

  // 3. Verify event manually
  const handleVerifyEvent = async (id: string) => {
    try {
      const response = await fetch(`/api/dividend/events/${id}/verify`, { method: "POST" });
      if (response.ok) {
        setEventsQueue((prev) => prev.filter((e) => e.id !== id));
        handleRunScan(true); // reload candidates
      }
    } catch (err) {
      console.error("Gagal memverifikasi event:", err);
    }
  };

  // 4. Reject event manually
  const handleRejectEvent = async (id: string) => {
    try {
      const response = await fetch(`/api/dividend/events/${id}/reject`, { method: "POST" });
      if (response.ok) {
        setEventsQueue((prev) => prev.filter((e) => e.id !== id));
      }
    } catch (err) {
      console.error("Gagal menolak event:", err);
    }
  };

  // 5. Update event manually
  const handleUpdateEvent = async (id: string) => {
    try {
      const response = await fetch(`/api/dividend/events/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingFields)
      });
      if (response.ok) {
        setEditingEventId(null);
        setEditingFields({});
        fetchReviewQueue();
        handleRunScan(true);
      }
    } catch (err) {
      console.error("Gagal menyimpan editan:", err);
    }
  };

  // 6. Submit manual form
  const handleManualFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setManualSubmitStatus("submitting");
    try {
      const id = manualForm.ticker.toUpperCase() + "_" + manualForm.cum_date_regular;
      const payload = {
        ...manualForm,
        id,
        ticker: manualForm.ticker.toUpperCase(),
        dividend_per_share: parseFloat(manualForm.dividend_per_share),
        action_type: "CASH_DIVIDEND",
        confidence_score: 100.0,
        verification_status: "manually_verified"
      };

      const response = await fetch(`/api/dividend/events/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        setManualSubmitStatus("success");
        setManualForm({
          ticker: "",
          dividend_per_share: "",
          announcement_date: "",
          cum_date_regular: "",
          ex_date_regular: "",
          recording_date: "",
          payment_date: "",
          source_name: "Manual Fallback"
        });
        setTimeout(() => {
          setShowManualForm(false);
          setManualSubmitStatus(null);
        }, 1500);
        handleRunScan(true);
      } else {
        setManualSubmitStatus("failed");
      }
    } catch (err) {
      console.error(err);
      setManualSubmitStatus("failed");
    }
  };

  // 7. Run Backtest
  const handleRunBacktest = async () => {
    setIsBacktesting(true);
    setBacktestError(null);
    setBacktestResult(null);

    try {
      const response = await fetch("/api/dividend/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: backtestSymbol,
          years: backtestYears,
          strategy_variant: backtestStrategy
        })
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson?.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }
      setBacktestResult(data);
    } catch (err: any) {
      console.error(err);
      setBacktestError(err.message || "Gagal menjalankan backtest.");
    } finally {
      setIsBacktesting(false);
    }
  };

  const getConvictionColor = (status: string) => {
    switch (status) {
      case "HIGH_CONVICTION_RUN_UP":
        return "bg-emerald-950/40 text-emerald-400 border border-emerald-500/30";
      case "DIVIDEND_MOMENTUM_CANDIDATE":
        return "bg-cyan-950/40 text-cyan-400 border border-cyan-500/30";
      case "WATCH":
        return "bg-amber-950/40 text-amber-400 border border-amber-500/30";
      default:
        return "bg-rose-950/40 text-rose-400 border border-rose-500/30";
    }
  };

  return (
    <div className="space-y-6">
      {/* Tab Navigation Tray */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-1 bg-slate-900/60 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab("candidates")}
            className={`flex items-center gap-2 text-xs font-bold px-4 py-2.5 rounded-lg transition-all ${
              activeTab === "candidates"
                ? "bg-slate-800 text-white shadow-sm border border-slate-700/50"
                : "text-slate-400 hover:text-white"
            }`}
            type="button"
          >
            <Coins size={14} />
            <span>Kandidat Momentum</span>
          </button>
          <button
            onClick={() => {
              setActiveTab("review-queue");
              fetchReviewQueue();
            }}
            className={`flex items-center gap-2 text-xs font-bold px-4 py-2.5 rounded-lg relative transition-all ${
              activeTab === "review-queue"
                ? "bg-slate-800 text-white shadow-sm border border-slate-700/50"
                : "text-slate-400 hover:text-white"
            }`}
            type="button"
          >
            <CalendarDays size={14} />
            <span>Antrean Review</span>
            {eventsQueue.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 bg-rose-600 text-white text-[10px] font-black rounded-full flex items-center justify-center border border-slate-950 px-1 shadow">
                {eventsQueue.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("backtest")}
            className={`flex items-center gap-2 text-xs font-bold px-4 py-2.5 rounded-lg transition-all ${
              activeTab === "backtest"
                ? "bg-slate-800 text-white shadow-sm border border-slate-700/50"
                : "text-slate-400 hover:text-white"
            }`}
            type="button"
          >
            <TrendingUp size={14} />
            <span>Backtester Event</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowManualForm(!showManualForm)}
            className="flex items-center gap-1.5 text-xs font-bold bg-slate-900/60 border border-slate-800 hover:bg-slate-800 text-white px-4 py-2.5 rounded-xl shadow-sm outline-none transition-all"
            type="button"
          >
            <Plus size={14} />
            <span>Manual Fallback Input</span>
          </button>

          <button
            onClick={() => handleRunScan(true)}
            disabled={isScanning}
            className="flex items-center gap-1.5 text-xs font-bold bg-gradient-to-r from-teal to-emerald-500 hover:brightness-110 text-white px-5 py-2.5 rounded-xl shadow-md border-0 outline-none transition-all disabled:opacity-50"
            type="button"
          >
            {isScanning ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>Scanning Dividen...</span>
              </>
            ) : (
              <>
                <Play size={14} fill="currentColor" />
                <span>Auto Scan Dividend Events</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Manual Input Form Drawer */}
      <AnimatePresence>
        {showManualForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="glass-card p-6 overflow-hidden border-teal/20"
          >
            <div className="flex items-center gap-2 border-b border-slate-850 pb-3 mb-4">
              <Plus className="text-teal" size={18} />
              <h3 className="font-bold text-white text-sm">Form Koreksi / Fallback Aksi Korporasi Dividen</h3>
            </div>
            
            <form onSubmit={handleManualFormSubmit} className="grid gap-4 md:grid-cols-4">
              <div>
                <label className="text-slate-400 text-xs font-bold block mb-1">Ticker Saham</label>
                <input
                  type="text"
                  placeholder="e.g. TLKM"
                  value={manualForm.ticker}
                  onChange={(e) => setManualForm({ ...manualForm, ticker: e.target.value })}
                  className="w-full text-xs font-semibold px-3 py-2 border border-slate-800 rounded-xl bg-slate-950 text-white outline-none"
                  required
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs font-bold block mb-1">Dividen per Saham (DPS)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 150"
                  value={manualForm.dividend_per_share}
                  onChange={(e) => setManualForm({ ...manualForm, dividend_per_share: e.target.value })}
                  className="w-full text-xs font-semibold px-3 py-2 border border-slate-800 rounded-xl bg-slate-950 text-white outline-none"
                  required
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs font-bold block mb-1">Announcement Date</label>
                <input
                  type="date"
                  value={manualForm.announcement_date}
                  onChange={(e) => setManualForm({ ...manualForm, announcement_date: e.target.value })}
                  className="w-full text-xs font-semibold px-3 py-2 border border-slate-800 rounded-xl bg-slate-950 text-white outline-none"
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs font-bold block mb-1">Cum Date Regular</label>
                <input
                  type="date"
                  value={manualForm.cum_date_regular}
                  onChange={(e) => setManualForm({ ...manualForm, cum_date_regular: e.target.value })}
                  className="w-full text-xs font-semibold px-3 py-2 border border-slate-800 rounded-xl bg-slate-950 text-white outline-none"
                  required
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs font-bold block mb-1">Ex Date Regular</label>
                <input
                  type="date"
                  value={manualForm.ex_date_regular}
                  onChange={(e) => setManualForm({ ...manualForm, ex_date_regular: e.target.value })}
                  className="w-full text-xs font-semibold px-3 py-2 border border-slate-800 rounded-xl bg-slate-950 text-white outline-none"
                  required
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs font-bold block mb-1">Recording Date</label>
                <input
                  type="date"
                  value={manualForm.recording_date}
                  onChange={(e) => setManualForm({ ...manualForm, recording_date: e.target.value })}
                  className="w-full text-xs font-semibold px-3 py-2 border border-slate-800 rounded-xl bg-slate-950 text-white outline-none"
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs font-bold block mb-1">Payment Date</label>
                <input
                  type="date"
                  value={manualForm.payment_date}
                  onChange={(e) => setManualForm({ ...manualForm, payment_date: e.target.value })}
                  className="w-full text-xs font-semibold px-3 py-2 border border-slate-800 rounded-xl bg-slate-950 text-white outline-none"
                />
              </div>
              <div className="flex items-end justify-end">
                <button
                  type="submit"
                  disabled={manualSubmitStatus === "submitting"}
                  className="bg-teal hover:brightness-110 text-white text-xs font-bold px-5 py-2.5 rounded-xl border-0 shadow outline-none transition-all w-full flex items-center justify-center gap-1.5"
                >
                  {manualSubmitStatus === "submitting" ? (
                    <>
                      <RefreshCw size={12} className="animate-spin" />
                      <span>Mengirim...</span>
                    </>
                  ) : manualSubmitStatus === "success" ? (
                    <>
                      <CheckCircle2 size={12} />
                      <span>Tersimpan!</span>
                    </>
                  ) : (
                    <>
                      <Plus size={12} />
                      <span>Simpan Event Dividen</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Collection run stats banner */}
      {collectionStats && (
        <div className="flex flex-wrap items-center gap-3 bg-teal-950/20 border border-teal-500/20 px-4 py-3 rounded-xl text-xs font-semibold">
          <Info size={14} className="text-teal" />
          <span className="text-slate-300">Hasil Scraping Otomatis KSEI & IDX:</span>
          <span className="pill-good">Dikoleksi: {collectionStats.collected}</span>
          <span className="pill-good">Ditambahkan: {collectionStats.inserted}</span>
          <span className="pill-good">Diperbarui: {collectionStats.updated}</span>
          <span className="pill-bad">Ditolak: {collectionStats.rejected}</span>
          <span className="bg-amber-900/40 text-amber-300 border border-amber-500/20 px-2 py-0.5 rounded-lg font-bold">
            Perlu Review: {collectionStats.needs_review}
          </span>
          <span className="text-slate-500 ml-auto font-medium">Run ID: {collectionStats.run_id || "-"}</span>
        </div>
      )}

      {/* Tab: Candidates list */}
      {activeTab === "candidates" && (
        <div className="grid gap-6 md:grid-cols-3">
          {/* Filters Sidebar */}
          <div className="space-y-6">
            <div className="glass-card p-6">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-3 mb-4">
                <Search size={16} className="text-teal" />
                <h4 className="font-bold text-white text-xs">Filter Scan Parameter</h4>
              </div>

              <div className="space-y-4 text-xs font-semibold">
                <div className="flex items-center justify-between bg-slate-900/30 p-2.5 rounded-xl border border-slate-850">
                  <span className="text-slate-300">Hanya Efek Syariah (DES)</span>
                  <input
                    type="checkbox"
                    checked={syariahOnly}
                    onChange={(e) => setSyariahOnly(e.target.checked)}
                    className="w-4 h-4 rounded text-teal bg-slate-950 border-slate-800 focus:ring-teal cursor-pointer"
                  />
                </div>

                <div>
                  <label className="text-slate-400 text-[10px] font-bold block mb-1">Yield Dividen Minimum (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={minYield}
                    onChange={(e) => setMinYield(parseFloat(e.target.value) || 0)}
                    className="w-full text-xs font-semibold px-3 py-2 border border-slate-800 rounded-xl bg-slate-950 text-white outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 text-[10px] font-bold block mb-1">Min Days to Cum</label>
                    <input
                      type="number"
                      value={minDays}
                      onChange={(e) => setMinDays(parseInt(e.target.value) || 0)}
                      className="w-full text-xs font-semibold px-3 py-2 border border-slate-800 rounded-xl bg-slate-950 text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 text-[10px] font-bold block mb-1">Max Days to Cum</label>
                    <input
                      type="number"
                      value={maxDays}
                      onChange={(e) => setMaxDays(parseInt(e.target.value) || 0)}
                      className="w-full text-xs font-semibold px-3 py-2 border border-slate-800 rounded-xl bg-slate-950 text-white outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between bg-slate-900/30 p-2.5 rounded-xl border border-slate-850">
                  <span className="text-slate-300">Sertakan Antrean Review</span>
                  <input
                    type="checkbox"
                    checked={includeReviewQueue}
                    onChange={(e) => setIncludeReviewQueue(e.target.checked)}
                    className="w-4 h-4 rounded text-teal bg-slate-950 border-slate-800 focus:ring-teal cursor-pointer"
                  />
                </div>

                <button
                  onClick={() => handleRunScan(true)}
                  disabled={isScanning}
                  className="w-full text-xs font-bold secondary-button py-2.5 border border-slate-850 hover:bg-slate-800 text-white rounded-xl shadow outline-none transition-all flex items-center justify-center gap-1.5"
                  type="button"
                >
                  <RefreshCw size={12} className={isScanning ? "animate-spin" : ""} />
                  <span>Jalankan Ulang Scan</span>
                </button>
              </div>
            </div>
          </div>

          {/* Results List */}
          <div className="md:col-span-2 space-y-6">
            {scanError && (
              <div className="bg-rose-950/20 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-xs font-semibold flex items-start gap-1.5">
                <XCircle size={16} className="shrink-0 mt-0.5" />
                <span>{scanError}</span>
              </div>
            )}

            {candidates.length === 0 ? (
              <div className="glass-card p-12 text-center space-y-4">
                <Coins size={36} className="text-slate-500 mx-auto" />
                <div>
                  <h4 className="text-white font-bold text-sm">Tidak Ada Kandidat Dividen Ditemukan</h4>
                  <p className="text-slate-400 text-xs mt-1 leading-relaxed max-w-sm mx-auto">
                    Cobalah memperluas rentang "Days to Cum" atau turunkan "Yield Dividen Minimum" pada panel filter.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2">
                {/* Candidates List Column */}
                <div className="space-y-3">
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Hasil Scan Kategori Dividen Momentum:</p>
                  {candidates.map((cand) => (
                    <div
                      key={cand.ticker}
                      onClick={() => setSelectedCandidate(cand)}
                      className={`glass-card p-4 cursor-pointer transition-all duration-300 ${
                        selectedCandidate?.ticker === cand.ticker
                          ? "border-teal bg-slate-900/60 ring-1 ring-teal/20"
                          : "hover:bg-slate-900/40 border-slate-850"
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-md font-black text-white">{cand.ticker}</span>
                            {cand.syariah_status.includes("DES") && (
                              <span className="text-[8px] bg-emerald-950/60 text-emerald-400 font-bold border border-emerald-500/20 px-1 py-0.5 rounded">
                                Syariah
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 leading-none truncate max-w-[150px]">{cand.company_name}</p>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-lg font-bold ${getConvictionColor(cand.final_status)}`}>
                          {cand.final_status === "HIGH_CONVICTION_RUN_UP" ? "HIGH CONVICTION" : cand.final_status}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 mt-4 text-[10px] font-semibold text-slate-400">
                        <div>
                          <p className="text-slate-500 text-[8px] font-bold">Dividend Yield</p>
                          <p className="text-sm font-black text-white mt-0.5">{cand.dividend_yield_percent.toFixed(2)}%</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-[8px] font-bold">DPS (Rupiah)</p>
                          <p className="text-sm font-black text-white mt-0.5">Rp {cand.dividend_per_share.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-[8px] font-bold">H-Cum Date</p>
                          <p className={`text-sm font-black mt-0.5 ${cand.days_to_cum <= 4 ? "text-amber-400" : "text-emerald-400"}`}>
                            {cand.days_to_cum} Hari
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Candidate Detail Column */}
                {selectedCandidate && (
                  <div className="space-y-4">
                    <div className="glass-card p-6 border-teal/20 sticky top-4">
                      <div className="flex justify-between items-start border-b border-slate-850 pb-3 mb-4">
                        <div>
                          <h4 className="text-lg font-black text-white">{selectedCandidate.ticker}</h4>
                          <p className="text-xs text-slate-400">{selectedCandidate.company_name}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-slate-500 text-[9px] font-bold">Score Momentum</p>
                          <p className="text-2xl font-black text-teal">{selectedCandidate.final_score.toFixed(0)}</p>
                        </div>
                      </div>

                      {/* Trade Setup Plans */}
                      <div className="space-y-3">
                        <div className="bg-slate-900/40 border border-slate-850 rounded-xl p-3 text-xs font-semibold">
                          <p className="text-emerald-400 font-bold text-[9px] uppercase tracking-wider mb-1">Rencana Entry (Trade Plan):</p>
                          <p className="text-slate-200 leading-relaxed font-medium">{selectedCandidate.entry_plan}</p>
                        </div>

                        <div className="bg-slate-900/40 border border-slate-850 rounded-xl p-3 text-xs font-semibold">
                          <p className="text-amber-500 font-bold text-[9px] uppercase tracking-wider mb-1">Rencana Exit (Trade Plan):</p>
                          <p className="text-slate-200 leading-relaxed font-medium">{selectedCandidate.exit_plan}</p>
                        </div>
                      </div>

                      {/* Technical Details Grid */}
                      <div className="grid grid-cols-2 gap-3 mt-4 text-[10px] font-semibold text-slate-400 border-t border-slate-850/60 pt-3">
                        <div>
                          <span className="text-slate-500 font-bold">Harga Saat Ini:</span>
                          <p className="text-xs font-black text-white mt-0.5">Rp {selectedCandidate.current_price.toLocaleString()}</p>
                        </div>
                        <div>
                          <span className="text-slate-500 font-bold">Distance to MA20:</span>
                          <p className="text-xs font-black text-white mt-0.5">{selectedCandidate.distance_to_ma20_percent.toFixed(2)}%</p>
                        </div>
                        <div>
                          <span className="text-slate-500 font-bold">Volume Ratio 20D:</span>
                          <p className="text-xs font-black text-white mt-0.5">{selectedCandidate.volume_ratio_20d.toFixed(2)}x</p>
                        </div>
                        <div>
                          <span className="text-slate-500 font-bold">Syariah Status:</span>
                          <p className="text-xs font-black text-white mt-0.5 truncate">{selectedCandidate.syariah_status}</p>
                        </div>
                        <div>
                          <span className="text-slate-500 font-bold">Cum Date Regular:</span>
                          <p className="text-xs font-black text-white mt-0.5">{selectedCandidate.cum_date_regular}</p>
                        </div>
                        <div>
                          <span className="text-slate-500 font-bold">Ex Date Regular:</span>
                          <p className="text-xs font-black text-white mt-0.5">{selectedCandidate.ex_date_regular}</p>
                        </div>
                        <div>
                          <span className="text-slate-500 font-bold">Payment Date (Info):</span>
                          <p className="text-xs font-black text-slate-300 mt-0.5">{selectedCandidate.payment_date || "-"}</p>
                        </div>
                      </div>

                      {/* Score break down */}
                      <div className="mt-4 border-t border-slate-850/60 pt-3 text-[10px] font-semibold text-slate-400 space-y-2">
                        <span className="text-slate-500 font-bold uppercase tracking-wider text-[8px]">Rincian Komponen Skor:</span>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-300">
                          <div className="flex justify-between">
                            <span>Yield Attractiveness:</span>
                            <span className="font-bold">{selectedCandidate.score_components.yield_attractiveness}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Days to Cum:</span>
                            <span className="font-bold">{selectedCandidate.score_components.days_to_cum}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Price Momentum:</span>
                            <span className="font-bold">{selectedCandidate.score_components.price_momentum}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Volume Confirmation:</span>
                            <span className="font-bold">{selectedCandidate.score_components.volume_confirmation}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Needs Review Queue */}
      {activeTab === "review-queue" && (
        <div className="glass-card p-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <CalendarDays size={18} className="text-amber-500" />
              <h3 className="font-bold text-white text-sm">Antrean Review Corporate Action Dividen</h3>
            </div>
            <button
              onClick={fetchReviewQueue}
              className="text-xs font-bold text-slate-400 hover:text-white flex items-center gap-1 bg-slate-900/60 border border-slate-850 px-3 py-1.5 rounded-xl outline-none"
              type="button"
            >
              <RefreshCw size={10} />
              <span>Muat Ulang Antrean</span>
            </button>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed mb-6 font-semibold">
            Di bawah adalah data dividen yang dikoleksi secara otomatis oleh crawler KSEI/IDX namun ditandai untuk review manual karena status kepastian rendah (confidence score &lt; 85%) atau format tanggal tidak lazim.
          </p>

          {eventsQueue.length === 0 ? (
            <div className="text-center py-12 space-y-4">
              <CheckCircle2 size={36} className="text-emerald-500 mx-auto" />
              <div>
                <h4 className="text-white font-bold text-sm">Antrean Review Bersih</h4>
                <p className="text-slate-400 text-xs mt-1">Semua event dividen otomatis telah sukses divalidasi oleh sistem.</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-semibold text-slate-300">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500 font-bold">
                    <th className="py-3 px-4">Emiten</th>
                    <th className="py-3 px-4">Nilai DPS</th>
                    <th className="py-3 px-4">Cum Date</th>
                    <th className="py-3 px-4">Ex Date</th>
                    <th className="py-3 px-4">Payment Date</th>
                    <th className="py-3 px-4">Peringatan Parser</th>
                    <th className="py-3 px-4 text-right">Aksi Tindakan</th>
                  </tr>
                </thead>
                <tbody>
                  {eventsQueue.map((ev) => {
                    const isEditing = editingEventId === ev.id;
                    return (
                      <tr key={ev.id} className="border-b border-slate-850/80 hover:bg-slate-900/35 transition-colors">
                        <td className="py-3 px-4">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editingFields.ticker || ev.ticker}
                              onChange={(e) => setEditingFields({ ...editingFields, ticker: e.target.value.toUpperCase() })}
                              className="text-xs px-2 py-1 bg-slate-950 border border-slate-800 rounded text-white"
                            />
                          ) : (
                            <span className="font-bold text-white">{ev.ticker}</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {isEditing ? (
                            <input
                              type="number"
                              value={editingFields.dividend_per_share !== undefined ? editingFields.dividend_per_share : ev.dividend_per_share}
                              onChange={(e) => setEditingFields({ ...editingFields, dividend_per_share: parseFloat(e.target.value) || 0 })}
                              className="text-xs px-2 py-1 bg-slate-950 border border-slate-800 rounded text-white w-20"
                            />
                          ) : (
                            <span>Rp {ev.dividend_per_share.toLocaleString()}</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {isEditing ? (
                            <input
                              type="date"
                              value={editingFields.cum_date_regular || ev.cum_date_regular || ""}
                              onChange={(e) => setEditingFields({ ...editingFields, cum_date_regular: e.target.value })}
                              className="text-xs px-2 py-1 bg-slate-950 border border-slate-800 rounded text-white"
                            />
                          ) : (
                            <span>{ev.cum_date_regular || "-"}</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {isEditing ? (
                            <input
                              type="date"
                              value={editingFields.ex_date_regular || ev.ex_date_regular || ""}
                              onChange={(e) => setEditingFields({ ...editingFields, ex_date_regular: e.target.value })}
                              className="text-xs px-2 py-1 bg-slate-950 border border-slate-800 rounded text-white"
                            />
                          ) : (
                            <span>{ev.ex_date_regular || "-"}</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {isEditing ? (
                            <input
                              type="date"
                              value={editingFields.payment_date || ev.payment_date || ""}
                              onChange={(e) => setEditingFields({ ...editingFields, payment_date: e.target.value })}
                              className="text-xs px-2 py-1 bg-slate-950 border border-slate-800 rounded text-white"
                            />
                          ) : (
                            <span>{ev.payment_date || "-"}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 max-w-[200px] truncate text-slate-500">
                          {(ev.parser_warnings || []).join(", ") || (ev.validation_errors || []).join(", ") || "-"}
                        </td>
                        <td className="py-3 px-4 text-right space-x-2">
                          {isEditing ? (
                            <>
                              <button
                                onClick={() => handleUpdateEvent(ev.id)}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white p-1.5 rounded-lg outline-none transition-all inline-flex items-center"
                                type="button"
                              >
                                <Check size={12} />
                              </button>
                              <button
                                onClick={() => {
                                  setEditingEventId(null);
                                  setEditingFields({});
                                }}
                                className="bg-slate-700 hover:bg-slate-600 text-white p-1.5 rounded-lg outline-none transition-all inline-flex items-center"
                                type="button"
                              >
                                <XCircle size={12} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => {
                                  setEditingEventId(ev.id);
                                  setEditingFields(ev);
                                }}
                                className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-1.5 rounded-lg outline-none transition-all inline-flex items-center"
                                type="button"
                                title="Koreksi Manual"
                              >
                                <Edit2 size={12} />
                              </button>
                              <button
                                onClick={() => handleVerifyEvent(ev.id)}
                                className="bg-emerald-950/40 hover:bg-emerald-900 border border-emerald-500/20 text-emerald-400 p-1.5 rounded-lg outline-none transition-all inline-flex items-center"
                                type="button"
                                title="Verifikasi"
                              >
                                <CheckCircle2 size={12} />
                              </button>
                              <button
                                onClick={() => handleRejectEvent(ev.id)}
                                className="bg-rose-950/40 hover:bg-rose-900 border border-rose-500/20 text-rose-400 p-1.5 rounded-lg outline-none transition-all inline-flex items-center"
                                type="button"
                                title="Reject"
                              >
                                <XCircle size={12} />
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: Backtester Panel */}
      {activeTab === "backtest" && (
        <div className="glass-card p-6">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3 mb-4">
            <TrendingUp size={18} className="text-teal" />
            <h3 className="font-bold text-white text-sm">Backtester Event-Driven Dividend Run-Up</h3>
          </div>

          <div className="grid gap-6 md:grid-cols-4">
            <div className="space-y-4 text-xs font-semibold">
              <div>
                <label className="text-slate-400 text-xs font-bold block mb-1">Ticker Saham</label>
                <input
                  type="text"
                  value={backtestSymbol}
                  onChange={(e) => setBacktestSymbol(e.target.value.toUpperCase())}
                  className="w-full text-xs font-semibold px-3 py-2 border border-slate-800 rounded-xl bg-slate-950 text-white outline-none"
                />
              </div>

              <div>
                <label className="text-slate-400 text-xs font-bold block mb-1">Durasi Backtest (Tahun)</label>
                <select
                  value={backtestYears}
                  onChange={(e) => setBacktestYears(parseInt(e.target.value) || 5)}
                  className="w-full text-xs font-semibold px-3 py-2 border border-slate-800 rounded-xl bg-slate-950 text-white outline-none"
                >
                  <option value={3}>3 Tahun</option>
                  <option value={5}>5 Tahun</option>
                  <option value={10}>10 Tahun</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 text-xs font-bold block mb-1">Variasi Strategi Entry/Exit</label>
                <select
                  value={backtestStrategy}
                  onChange={(e) => setBacktestStrategy(e.target.value)}
                  className="w-full text-xs font-semibold px-3 py-2 border border-slate-800 rounded-xl bg-slate-950 text-white outline-none"
                >
                  <option value="buy_h10_sell_h1">Beli H-10, Jual H-1 Cum Date (Rekomendasi)</option>
                  <option value="buy_announcement_sell_cum">Beli Pengumuman, Jual H-1 Cum Date</option>
                  <option value="buy_volume_confirm">Beli Konfirmasi Volume (H-15 s/d H-2)</option>
                  <option value="buy_price_ma20">Beli di atas MA20 (H-15 s/d H-5)</option>
                  <option value="hold_through_ex">Beli H-10, Hold Lewat Ex-Date (Dividend Trap Comparison)</option>
                </select>
              </div>

              <button
                onClick={handleRunBacktest}
                disabled={isBacktesting}
                className="w-full bg-gradient-to-r from-teal to-emerald-500 hover:brightness-110 text-white text-xs font-bold py-2.5 rounded-xl border-0 shadow outline-none transition-all flex items-center justify-center gap-1.5"
                type="button"
              >
                {isBacktesting ? (
                  <>
                    <RefreshCw size={12} className="animate-spin" />
                    <span>Menghitung...</span>
                  </>
                ) : (
                  <>
                    <Play size={12} fill="currentColor" />
                    <span>Run Backtest</span>
                  </>
                )}
              </button>
            </div>

            <div className="md:col-span-3 space-y-6">
              {backtestError && (
                <div className="bg-rose-950/20 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-xs font-semibold flex items-start gap-1.5">
                  <XCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{backtestError}</span>
                </div>
              )}

              {backtestResult ? (
                <div className="space-y-6">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 text-center">
                      <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Win Rate</p>
                      <p className={`text-2xl font-black mt-1 ${backtestResult.win_rate >= 60 ? "text-emerald-400" : "text-white"}`}>
                        {backtestResult.win_rate.toFixed(1)}%
                      </p>
                    </div>
                    <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 text-center">
                      <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Avg Return per Trade</p>
                      <p className={`text-2xl font-black mt-1 ${backtestResult.average_return > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {backtestResult.average_return.toFixed(2)}%
                      </p>
                    </div>
                    <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 text-center">
                      <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Expectancy (Skor)</p>
                      <p className={`text-2xl font-black mt-1 ${backtestResult.expectancy > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {backtestResult.expectancy.toFixed(2)}%
                      </p>
                    </div>
                    <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 text-center">
                      <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Profit Factor</p>
                      <p className="text-2xl font-black text-white mt-1">
                        {backtestResult.profit_factor >= 999 ? "∞" : backtestResult.profit_factor.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {/* Behavior Metrics */}
                  <div className="bg-slate-900/20 border border-slate-850 p-5 rounded-xl space-y-3 text-xs font-semibold text-slate-300">
                    <p className="text-slate-400 font-bold uppercase tracking-wider text-[9px] border-b border-slate-800 pb-2">Karakteristik Aksi Korporasi Historis:</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <span className="text-slate-500">Rata-rata Run-Up (H-10 s/d Cum Date):</span>
                        <p className="text-sm font-black text-white mt-0.5">+{backtestResult.average_runup_before_cum.toFixed(2)}%</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Rata-rata Penurunan Ex-Date Open:</span>
                        <p className="text-sm font-black text-rose-400 mt-0.5">-{backtestResult.average_ex_date_drop.toFixed(2)}%</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Rata-rata Pemulihan Harga (Hari):</span>
                        <p className="text-sm font-black text-white mt-0.5">{backtestResult.average_recovery_days_after_ex.toFixed(1)} Hari</p>
                      </div>
                    </div>
                  </div>

                  {/* Historical Trades Log */}
                  <div className="space-y-3">
                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Log Simulasi Transaksi Backtest:</p>
                    <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
                      <table className="w-full text-left border-collapse text-xs font-semibold">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-500 font-bold">
                            <th className="py-2.5 px-4">Cum Date</th>
                            <th className="py-2.5 px-4">Ex Date</th>
                            <th className="py-2.5 px-4">Entry Price</th>
                            <th className="py-2.5 px-4">Exit Price</th>
                            <th className="py-2.5 px-4 text-right">Net Return</th>
                          </tr>
                        </thead>
                        <tbody>
                          {backtestResult.event_results_sample.map((trade: any, idx: number) => (
                            <tr key={idx} className="border-b border-slate-850 hover:bg-slate-900/20">
                              <td className="py-2.5 px-4">{trade.cum_date}</td>
                              <td className="py-2.5 px-4">{trade.ex_date}</td>
                              <td className="py-2.5 px-4">Rp {trade.entry_price.toLocaleString()}</td>
                              <td className="py-2.5 px-4">Rp {trade.exit_price.toLocaleString()}</td>
                              <td className={`py-2.5 px-4 text-right font-black ${trade.net_return > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                {(trade.net_return * 100).toFixed(2)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-slate-500 space-y-3 border-2 border-dashed border-slate-800 rounded-xl">
                  <TrendingUp size={24} />
                  <p className="text-xs font-bold">Jalankan backtest untuk melihat evaluasi kecocokan strategi dividen.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
