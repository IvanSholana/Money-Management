import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  X, 
  Sparkles, 
  Trash2, 
  Plus, 
  AlertCircle, 
  Brain, 
  Coins, 
  Check, 
  Loader2, 
  Key, 
  Eye, 
  EyeOff,
  HelpCircle
} from "lucide-react";
import { BudgetPocket, Category, Transaction, TransactionType } from "../types";
import { createId } from "../utils/id";
import { getTodayInputValue } from "../utils/date";

type AiAgentDrawerProps = {
  open: boolean;
  onClose: () => void;
  pockets: BudgetPocket[];
  categories: Category[];
  onSaveTransactions: (transactions: Transaction[]) => void;
  apiKey: string | undefined;
  onSaveApiKey: (key: string) => void;
};

export function AiAgentDrawer({
  open,
  onClose,
  pockets,
  categories,
  onSaveTransactions,
  apiKey: settingsApiKey,
  onSaveApiKey,
}: AiAgentDrawerProps) {
  const [prompt, setPrompt] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");
  const [draftTransactions, setDraftTransactions] = useState<Transaction[]>([]);
  const [localApiKey, setLocalApiKey] = useState("");
  const [showLocalKeyInput, setShowLocalKeyInput] = useState(false);
  const [showApiKeyVisibility, setShowApiKeyVisibility] = useState(false);

  // Determine active API Key
  const activeApiKey = settingsApiKey || (import.meta as any).env.VITE_DEEPSEEK_API_KEY || localApiKey;

  async function processPrompt() {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setError("Silakan ketik kalimat pengeluaran/pemasukan Anda terlebih dahulu.");
      return;
    }

    if (!activeApiKey) {
      setError("Kunci API DeepSeek tidak ditemukan. Silakan konfigurasi API Key terlebih dahulu.");
      setShowLocalKeyInput(true);
      return;
    }

    setIsProcessing(true);
    setError("");

    try {
      const today = getTodayInputValue();
      const pocketListStr = pockets.map((p) => `"${p.name}"`).join(", ");
      const categoryListStr = categories.map((c) => `"${c.name}" (${c.type})`).join(", ");

      const systemInstruction = `
You are a smart financial assistant agent for a Money Management app.
Your task is to parse the user's natural language input (written in Indonesian or English) and extract one or more financial transactions.

Available pockets in the system: [ ${pocketListStr} ]
Available categories in the system: [ ${categoryListStr} ]
Current date is: "${today}" (use this as reference for "hari ini", "kemarin", "besok", "lusa", "2 hari lalu", etc.)

Instructions:
1. Parse the input and identify transactions.
2. Determine if it's an "income" or "expense" transaction.
3. Map "pocketName" to the EXACT pocket name from the available pockets list above if the user specifies a pocket or if you can strongly infer one (e.g. "kantong jajan" matches "Fun" or "Jajan"). If no pocket is mentioned or matches, map to null.
4. Map "categoryName" to one of the exact category names from the available categories list above. Choose the most appropriate category. If unsure, map to "Other Expense" (for expense) or "Other Income" (for income).
5. Extract the amount as a positive integer.
6. Determine the transaction date in YYYY-MM-DD format based on relative terms mentioned.
7. Create a clean, short description/memo for the "notes" field in Indonesian.

You must return a valid JSON object matching this schema:
{
  "transactions": [
    {
      "type": "income" | "expense",
      "amount": number,
      "pocketName": string | null,
      "categoryName": string,
      "notes": string,
      "date": "YYYY-MM-DD"
    }
  ]
}
`;

      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: trimmedPrompt,
          systemInstruction: systemInstruction,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson?.error || `HTTP error! status: ${response.status}`);
      }

      const resJson = await response.json();
      const textResponse = resJson?.text;
      
      if (!textResponse) {
        throw new Error("Gagal menerima data hasil analisis dari DeepSeek API.");
      }

      const parsedResult = JSON.parse(textResponse);
      const items = parsedResult.transactions || [];

      if (items.length === 0) {
        throw new Error("DeepSeek tidak dapat mengidentifikasi transaksi dalam kalimat Anda. Coba tulis lebih jelas (misal: 'Beli kopi 25rb rupiah tadi sore menggunakan kantong jajan').");
      }

      // Map parsed items to actual transaction objects
      const mappedTransactions: Transaction[] = items.map((t: any) => {
        // Find pocket
        const matchedPocket = pockets.find(
          (p) => p.name.toLowerCase() === t.pocketName?.toLowerCase()
        );
        // Find category
        const matchedCategory = categories.find(
          (c) => c.name.toLowerCase() === t.categoryName?.toLowerCase() && c.type === t.type
        );

        // Pick fallback category if none matched
        const fallbackCategory = categories.find((c) => c.type === t.type)?.name || (t.type === "income" ? "Salary" : "Food");

        return {
          id: createId(),
          date: t.date || today,
          type: t.type === "income" ? "income" : "expense",
          category: matchedCategory ? matchedCategory.name : fallbackCategory,
          amount: typeof t.amount === "number" ? t.amount : 0,
          pocketId: matchedPocket ? matchedPocket.id : undefined,
          notes: t.notes || "Transaksi AI",
          account: "Cash",
        };
      });

      setDraftTransactions(mappedTransactions);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Terjadi kesalahan koneksi ke DeepSeek API.");
    } finally {
      setIsProcessing(false);
    }
  }

  function handleSaveApiKeyLocal() {
    const trimmedKey = localApiKey.trim();
    if (!trimmedKey) return;
    onSaveApiKey(trimmedKey);
    setShowLocalKeyInput(false);
    setError("");
  }

  function addDraftItem() {
    const defaultExpCat = categories.find(c => c.type === "expense")?.name || "Food";
    setDraftTransactions([
      ...draftTransactions,
      {
        id: createId(),
        date: getTodayInputValue(),
        type: "expense",
        category: defaultExpCat,
        amount: 0,
        notes: "",
        account: "Cash",
      },
    ]);
  }

  function deleteDraftItem(id: string) {
    setDraftTransactions(draftTransactions.filter((item) => item.id !== id));
  }

  function updateDraftItem(id: string, updates: Partial<Transaction>) {
    setDraftTransactions(
      draftTransactions.map((item) => {
        if (item.id !== id) return item;
        
        // If type changed, reset category to first valid category of that type
        if (updates.type && updates.type !== item.type) {
          const firstCatOfType = categories.find(c => c.type === updates.type)?.name || "";
          return { ...item, ...updates, category: firstCatOfType };
        }

        return { ...item, ...updates };
      })
    );
  }

  function handleSaveAll() {
    if (draftTransactions.length === 0) return;
    
    // Validate amounts
    const hasInvalid = draftTransactions.some(t => t.amount <= 0 || !t.notes?.trim());
    if (hasInvalid) {
      setError("Mohon isi deskripsi dan nominal (harus lebih besar dari Rp 0) untuk semua draf transaksi.");
      return;
    }

    onSaveTransactions(draftTransactions);
    setDraftTransactions([]);
    setPrompt("");
    onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop Blur Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 cursor-pointer"
          />

          {/* Sliding Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 350 }}
            className="fixed inset-y-0 right-0 w-full max-w-xl bg-white/95 backdrop-blur-md shadow-2xl border-l border-slate-200/50 z-50 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-navy/5 to-teal/5">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal/10 text-teal">
                  <Sparkles size={16} className="animate-sparkle" />
                </span>
                <div>
                  <h3 className="text-sm text-navy dark:text-slate-100 font-black">Asisten Keuangan AI</h3>
                  <p className="text-[10px] font-bold text-slate-400 mt-0.5">Input Transaksi Praktis Lewat Prompt Teks</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="h-8 w-8 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all duration-200"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              
              {/* API Key Warning Panel if no key detected */}
              {!activeApiKey && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 text-xs">
                  <h4 className="font-extrabold text-amber-800 flex items-center gap-1.5">
                    <Key size={14} />
                    <span>Kunci API DeepSeek Belum Dikonfigurasi</span>
                  </h4>
                  <p className="mt-1 text-slate-600 leading-relaxed">
                    Fitur Asisten AI memerlukan DeepSeek API Key. Dapatkan kunci di{" "}
                    <a
                      href="https://platform.deepseek.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-teal hover:underline font-bold"
                    >
                      DeepSeek Console
                    </a>.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => setShowLocalKeyInput(true)}
                      className="secondary-button rounded-lg text-[10px] font-bold py-1.5 px-3 bg-white shadow-sm border-amber-200 hover:bg-amber-100/30"
                    >
                      Masukkan Kunci API
                    </button>
                  </div>
                </div>
              )}

              {/* Local API Key Input Form */}
              {showLocalKeyInput && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border border-slate-200 p-4 bg-slate-50 space-y-3"
                >
                  <h4 className="font-bold text-xs text-navy flex items-center justify-between">
                    <span>Masukkan Kunci API DeepSeek</span>
                    <button
                      onClick={() => setShowLocalKeyInput(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X size={12} />
                    </button>
                  </h4>
                  <div className="relative flex items-center">
                    <input
                      type={showApiKeyVisibility ? "text" : "password"}
                      className="w-full pr-10 text-xs py-1.5 rounded-lg border border-slate-200"
                      placeholder="AIzaSy..."
                      value={localApiKey}
                      onChange={(e) => setLocalApiKey(e.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute right-2.5 text-slate-400 hover:text-slate-600"
                      onClick={() => setShowApiKeyVisibility(!showApiKeyVisibility)}
                    >
                      {showApiKeyVisibility ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <button
                    onClick={handleSaveApiKeyLocal}
                    disabled={!localApiKey.trim()}
                    className="primary-button min-h-8 text-[11px] font-bold w-full rounded-lg"
                  >
                    Simpan & Aktifkan
                  </button>
                </motion.div>
              )}

              {/* Main Prompt Input Area */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-600 flex items-center justify-between">
                  <span>Tulis Aktivitas Keuangan Anda</span>
                  <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-1">
                    <HelpCircle size={11} />
                    <span>Mendukung pengeluaran multiline / ganda</span>
                  </span>
                </label>
                <div className="relative">
                  <textarea
                    rows={4}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Contoh:&#10;- saya makan soto tadi siang 20 ribu pakai kantong jajan&#10;- kemarin malam beli pulsa 50.000 menggunakan kantong jajan, terus pagi ini dapet gaji 5 juta rupiah masuk kantong utama"
                    className="w-full p-3.5 rounded-2xl border border-slate-200 shadow-inner bg-slate-50/50 text-xs focus:bg-white transition-all duration-300 resize-none leading-relaxed"
                  />
                  <div className="absolute bottom-3 right-3 text-[10px] text-slate-400 font-semibold">
                    {prompt.length} karakter
                  </div>
                </div>

                <button
                  onClick={processPrompt}
                  disabled={isProcessing || !prompt.trim()}
                  className="primary-button min-h-10 flex items-center justify-center gap-2 text-xs font-black shadow-lg shadow-teal/10 rounded-xl disabled:opacity-50 mt-1"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 size={14} className="animate-spin text-white" />
                      <span>Sedang Menganalisis Kalimat...</span>
                    </>
                  ) : (
                    <>
                      <Brain size={14} className="text-white" />
                      <span>Proses dengan AI DeepSeek</span>
                    </>
                  )}
                </button>
              </div>

              {/* Error Message */}
              <AnimatePresence mode="wait">
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-xs font-bold text-rose-800 flex items-center gap-2 overflow-hidden"
                  >
                    <AlertCircle size={15} className="shrink-0" />
                    <span>{error}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Processing Loader visual elements */}
              {isProcessing && (
                <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-6 flex flex-col items-center justify-center text-center space-y-3">
                  <div className="relative flex items-center justify-center">
                    <span className="animate-ping absolute inline-flex h-10 w-10 rounded-full bg-teal/20 opacity-75"></span>
                    <div className="h-12 w-12 rounded-2xl bg-teal/10 flex items-center justify-center text-teal">
                      <Sparkles size={20} className="animate-pulse" />
                    </div>
                  </div>
                  <div>
                    <h5 className="font-extrabold text-navy text-xs">Menganalisis Prompt Anda</h5>
                    <p className="text-[10px] text-slate-400 font-bold mt-1 max-w-[280px]">
                      DeepSeek sedang mengekstrak nominal, memetakan kategori transaksi, dan mencocokkan kantong keuangan Anda...
                    </p>
                  </div>
                </div>
              )}

              {/* Draft Results Table */}
              {draftTransactions.length > 0 && !isProcessing && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-navy flex items-center gap-1.5">
                      <Coins size={14} className="text-teal" />
                      <span>Hasil Analisis Transaksi ({draftTransactions.length})</span>
                    </h4>
                    <span className="text-[9px] font-bold text-slate-400">Verifikasi sebelum disimpan</span>
                  </div>

                  <div className="space-y-3">
                    {draftTransactions.map((item, idx) => (
                      <div
                        key={item.id}
                        className="draft-card rounded-2xl border border-slate-200/80 p-3.5 bg-white shadow-soft relative flex flex-col gap-2.5 hover:border-slate-300 transition-all duration-200"
                      >
                        <div className="absolute top-3.5 right-3.5 flex items-center gap-1.5">
                          <button
                            onClick={() => deleteDraftItem(item.id)}
                            className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-all duration-200"
                            title="Hapus item ini"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>

                        {/* Top Row: Type and Amount */}
                        <div className="flex flex-wrap items-center gap-2.5">
                          <select
                            value={item.type}
                            onChange={(e) => updateDraftItem(item.id, { type: e.target.value as TransactionType })}
                            className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full border-none w-auto leading-none cursor-pointer ${
                              item.type === "income"
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                                : "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400"
                            }`}
                            style={{
                              minHeight: "28px",
                              height: "28px"
                            }}
                          >
                            <option value="income">INCOME</option>
                            <option value="expense">EXPENSE</option>
                          </select>

                          {/* Numeric Amount Input */}
                          <div className="amount-wrapper flex items-center rounded-xl focus-within:border-teal">
                            <span className="text-[10px] font-black text-slate-400 select-none">Rp</span>
                            <input
                              type="number"
                              placeholder="0"
                              value={item.amount || ""}
                              onChange={(e) => updateDraftItem(item.id, { amount: Math.max(0, parseInt(e.target.value) || 0) })}
                              className="unstyled-input font-black text-navy dark:text-slate-100 text-xs focus:ring-0"
                            />
                          </div>
                        </div>

                        {/* Middle Row: Note Description */}
                        <div className="grid gap-1">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Deskripsi / Catatan</span>
                          <input
                            type="text"
                            placeholder="Deskripsi transaksi"
                            value={item.notes}
                            onChange={(e) => updateDraftItem(item.id, { notes: e.target.value })}
                            className="draft-input text-xs font-semibold focus:ring-0"
                          />
                        </div>

                        {/* Bottom Row: Date, Category and Pocket selects */}
                        <div className="grid gap-2 sm:grid-cols-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Tanggal</span>
                            <input
                              type="date"
                              value={item.date}
                              onChange={(e) => updateDraftItem(item.id, { date: e.target.value })}
                              className="draft-input text-[10px] font-bold"
                            />
                          </div>

                          <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Kategori</span>
                            <select
                              value={item.category}
                              onChange={(e) => updateDraftItem(item.id, { category: e.target.value })}
                              className="draft-input text-[10px] font-bold cursor-pointer"
                            >
                              {categories
                                .filter((c) => c.type === item.type)
                                .map((cat) => (
                                  <option key={cat.id} value={cat.name}>
                                    {cat.name}
                                  </option>
                                ))}
                            </select>
                          </div>

                          <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Kantong</span>
                            <select
                              value={item.pocketId || ""}
                              onChange={(e) => updateDraftItem(item.id, { pocketId: e.target.value || undefined })}
                              className="draft-input text-[10px] font-bold cursor-pointer"
                            >
                              <option value="">Tanpa Kantong</option>
                              {pockets.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Add manual draft button */}
                  <button
                    onClick={addDraftItem}
                    className="secondary-button font-bold text-[11px] py-2 px-3 border border-dashed border-slate-300 hover:border-teal hover:bg-teal/[0.02] rounded-xl w-full flex items-center justify-center gap-1"
                  >
                    <Plus size={12} />
                    <span>Tambah Item Transaksi Secara Manual</span>
                  </button>
                </motion.div>
              )}

            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 flex gap-2.5 bg-slate-50/50">
              <button
                onClick={handleSaveAll}
                disabled={draftTransactions.length === 0}
                className="primary-button min-h-11 flex-1 text-xs font-black shadow-lg shadow-teal/10 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                <Check size={15} />
                <span>Simpan Semua ke Database ({draftTransactions.length})</span>
              </button>
              <button
                onClick={() => {
                  setDraftTransactions([]);
                  setPrompt("");
                  setError("");
                  onClose();
                }}
                className="secondary-button min-h-11 px-5 text-xs font-bold rounded-xl"
              >
                Batal
              </button>
            </div>

          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
