import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Sparkles, 
  Send, 
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
  ArrowRight, 
  MessageSquare,
  HelpCircle,
  TrendingUp,
  User,
  ArrowUpRight
} from "lucide-react";
import { BudgetPocket, Category, Transaction, TransactionType } from "../types";
import { createId } from "../utils/id";
import { getTodayInputValue } from "../utils/date";

type AiLandingProps = {
  pockets: BudgetPocket[];
  categories: Category[];
  transactions: Transaction[];
  onSaveTransactions: (transactions: Transaction[]) => void;
  apiKey: string | undefined;
  onSaveApiKey: (key: string) => void;
  onGoToDashboard: () => void;
};

type ChatMessage = {
  id: string;
  role: "user" | "model";
  content: string;
  action?: "log" | "answer";
  drafts?: Transaction[];
  isSaved?: boolean;
};

export function AiLanding({
  pockets,
  categories,
  transactions,
  onSaveTransactions,
  apiKey: settingsApiKey,
  onSaveApiKey,
  onGoToDashboard,
}: AiLandingProps) {
  const [inputText, setInputText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "greet",
      role: "model",
      content: "Halo! Saya adalah Asisten AI Keuangan Anda. Bagaimana aktivitas transaksi Anda hari ini? Anda bisa langsung mengetikkan pengeluaran (misal: *'makan soto 25rb tadi siang pakai kantong Fun'*) atau bertanya tentang keuangan Anda (misal: *'apa pengeluaran terbesar saya?'* atau *'kantong apa yang paling boros?'*).",
      action: "answer"
    }
  ]);

  const [localApiKey, setLocalApiKey] = useState("");
  const [showApiKeyVisibility, setShowApiKeyVisibility] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Active API Key determination
  const activeApiKey = settingsApiKey || (import.meta as any).env.VITE_DEEPSEEK_API_KEY || localApiKey;

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isProcessing]);

  // Suggested Prompts
  const suggestions = [
    { text: "Berapa total pengeluaran saya bulan ini?", type: "query" },
    { text: "Apa pengeluaran terbesar saya dan apa yang perlu dihemat?", type: "query" },
    { text: "Tampilkan sisa saldo di kantong keuangan saya", type: "query" },
    { text: "Catat makan sate padang 40 ribu pakai Kantong Fun", type: "log" }
  ];

  async function handleSend(textToSend?: string) {
    const promptText = (textToSend || inputText).trim();
    if (!promptText) return;

    if (!activeApiKey) {
      setError("Kunci API DeepSeek tidak ditemukan. Silakan konfigurasi API Key terlebih dahulu.");
      return;
    }

    // Clear input
    if (!textToSend) setInputText("");
    setError("");

    // Append user message
    const userMsgId = createId();
    const newUserMsg: ChatMessage = {
      id: userMsgId,
      role: "user",
      content: promptText
    };
    setMessages((prev) => [...prev, newUserMsg]);
    setIsProcessing(true);

    try {
      const today = getTodayInputValue();
      
      // Context aggregation
      const pocketsContext = pockets.map(p => {
        // Calculate dynamic balance for the pocket based on transactions
        const pocketExpense = transactions
          .filter(t => t.pocketId === p.id && t.type === "expense")
          .reduce((sum, t) => sum + t.amount, 0);
        const pocketIncomeAllocated = transactions
          .filter(t => t.type === "income" && t.allocations)
          .flatMap(t => t.allocations || [])
          .filter(a => a.pocketId === p.id)
          .reduce((sum, a) => sum + a.amount, 0);
        const balance = p.initialBalance + pocketIncomeAllocated - pocketExpense;

        return `- ${p.name}: Saldo saat ini Rp ${balance.toLocaleString("id-ID")}, Target Bulanan Rp ${p.monthlyTarget.toLocaleString("id-ID")}`;
      }).join("\n");

      const categoryContext = categories.map(c => `"${c.name}" (${c.type})`).join(", ");
      
      // Send last 120 transactions to keep context lightweight but detailed
      const recentTransactions = transactions.slice(-120).map(t => {
        const pocketName = pockets.find(p => p.id === t.pocketId)?.name || "Tanpa Kantong";
        return `- ${t.date} | ${t.type.toUpperCase()} | Kategori: ${t.category} | Kantong: ${pocketName} | Nominal: Rp ${t.amount} | Catatan: ${t.notes}`;
      }).join("\n");

      const systemInstruction = `
You are a smart personal financial agent assistant.
You have access to the user's financial configuration and recent transactions data.

[CONTEXT DATA]
Current Date: "${today}"
Available Pockets:
${pocketsContext || "- Tidak ada kantong aktif"}

Available Categories:
[ ${categoryContext} ]

Recent Transactions History (Last 120 transactions):
${recentTransactions || "- Belum ada riwayat transaksi"}

Your job is to analyze the user's input. The input can be one of two types:
1. **Logging Transaction(s)**: The user wants to write down a new expense or income (e.g. "sore ini jajan kopi 25k pakai kantong Fun").
2. **Analysis/Q&A Question**: The user asks a question about their finances, statistics, biggest categories, saving tips, pocket balances, etc.

You MUST respond with a valid JSON matching this schema:
{
  "action": "log" | "answer",
  "transactions": [ // Only fill this if action is "log"
    {
      "type": "income" | "expense",
      "amount": number,
      "pocketName": string | null, // Match exactly with available pocket names
      "categoryName": string, // Match exactly with available categories
      "notes": string,
      "date": "YYYY-MM-DD"
    }
  ],
  "answer": string // Only fill this if action is "answer". Provide friendly, useful, and professional financial analysis in Indonesian markdown format. Use numbers/facts from context.
}
`;

      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: promptText,
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
        throw new Error("Gagal menerima respon dari asisten AI.");
      }

      const parsedResult = JSON.parse(textResponse);
      const action = parsedResult.action || "answer";

      if (action === "log") {
        const parsedDrafts = parsedResult.transactions || [];
        if (parsedDrafts.length === 0) {
          throw new Error("Gagal mengurai transaksi. Coba ketik kalimat lain.");
        }

        const mappedDrafts: Transaction[] = parsedDrafts.map((t: any) => {
          const matchedPocket = pockets.find(p => p.name.toLowerCase() === t.pocketName?.toLowerCase());
          const matchedCategory = categories.find(c => c.name.toLowerCase() === t.categoryName?.toLowerCase() && c.type === t.type);
          const fallbackCategory = categories.find(c => c.type === t.type)?.name || (t.type === "income" ? "Salary" : "Food");

          return {
            id: createId(),
            date: t.date || today,
            type: t.type === "income" ? "income" : "expense",
            category: matchedCategory ? matchedCategory.name : fallbackCategory,
            amount: typeof t.amount === "number" ? t.amount : 0,
            pocketId: matchedPocket ? matchedPocket.id : undefined,
            notes: t.notes || "Catatan AI",
            account: "Cash"
          };
        });

        const assistantMsg: ChatMessage = {
          id: createId(),
          role: "model",
          content: `Saya mendeteksi ${mappedDrafts.length} transaksi untuk dicatat. Silakan tinjau dan klik **Simpan Transaksi** di bawah:`,
          action: "log",
          drafts: mappedDrafts,
          isSaved: false
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } else {
        // action === "answer"
        const assistantMsg: ChatMessage = {
          id: createId(),
          role: "model",
          content: parsedResult.answer || "Maaf, saya tidak menemukan jawaban yang tepat. Ada yang bisa saya bantu lagi?",
          action: "answer"
        };
        setMessages((prev) => [...prev, assistantMsg]);
      }

    } catch (err) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : "Koneksi ke DeepSeek API terputus.";
      setMessages((prev) => [
        ...prev,
        {
          id: createId(),
          role: "model",
          content: `⚠️ **Terjadi Kesalahan:** ${errMsg}`,
          action: "answer"
        }
      ]);
    } finally {
      setIsProcessing(false);
    }
  }

  function handleSaveApiKeyLocal() {
    const trimmedKey = localApiKey.trim();
    if (!trimmedKey) return;
    onSaveApiKey(trimmedKey);
    setError("");
  }

  function updateDraftItem(messageId: string, itemId: string, updates: Partial<Transaction>) {
    setMessages((prev) => 
      prev.map((msg) => {
        if (msg.id !== messageId || !msg.drafts) return msg;

        const updatedDrafts = msg.drafts.map((item) => {
          if (item.id !== itemId) return item;
          if (updates.type && updates.type !== item.type) {
            const firstCatOfType = categories.find(c => c.type === updates.type)?.name || "";
            return { ...item, ...updates, category: firstCatOfType };
          }
          return { ...item, ...updates };
        });

        return { ...msg, drafts: updatedDrafts };
      })
    );
  }

  function deleteDraftItem(messageId: string, itemId: string) {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== messageId || !msg.drafts) return msg;
        return { ...msg, drafts: msg.drafts.filter((item) => item.id !== itemId) };
      })
    );
  }

  function confirmSaveDrafts(messageId: string, drafts: Transaction[]) {
    if (drafts.length === 0) return;
    
    const hasInvalid = drafts.some(t => t.amount <= 0 || !t.notes?.trim());
    if (hasInvalid) {
      setError("Mohon isi deskripsi dan nominal (lebih dari Rp 0) untuk seluruh transaksi.");
      return;
    }

    onSaveTransactions(drafts);
    
    // Update message state
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== messageId) return msg;
        return { ...msg, isSaved: true, content: "✅ Transaksi berhasil disimpan ke basis data SQLite lokal Anda!" };
      })
    );
  }

  return (
    <div className="grid gap-6 max-w-4xl mx-auto">
      
      {/* Upper Mode Selector Header */}
      <motion.div 
        initial={{ opacity: 0, y: -15 }}
        animate={{ opacity: 1, y: 0 }}
        className="hero-card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between p-5"
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-teal/10 flex items-center justify-center text-teal">
            <Sparkles size={20} className="animate-sparkle" />
          </div>
          <div>
            <h2 className="text-lg font-black text-navy leading-tight">Workspace Asisten AI</h2>
            <p className="text-xs text-slate-500 mt-0.5">Tanya jawab analisis keuangan & catat transaksi instan.</p>
          </div>
        </div>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onGoToDashboard}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-navy to-slate-800 px-5 text-xs font-black text-white shadow-lg cursor-pointer hover:shadow-xl hover:from-teal hover:to-emerald-600 transition-all duration-300 w-auto self-start sm:self-center"
        >
          <span>Masuk Dashboard Keuangan</span>
          <ArrowRight size={14} />
        </motion.button>
      </motion.div>

      {/* No API Key Configuration */}
      {!activeApiKey && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="panel bg-white/95 border-amber-200 p-6 flex flex-col items-center justify-center text-center space-y-4 shadow-xl"
        >
          <div className="h-12 w-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-500">
            <Key size={22} className="animate-pulse" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-sm font-black text-navy">Kunci API DeepSeek Belum Dikonfigurasi</h3>
            <p className="text-xs text-slate-500 max-w-[400px] leading-relaxed mx-auto">
              Fitur Asisten Keuangan AI memerlukan DeepSeek API Key. Anda dapat membuatnya di{" "}
              <a
                href="https://platform.deepseek.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal hover:underline font-extrabold"
              >
                DeepSeek Console
              </a>.
            </p>
          </div>
          <div className="w-full max-w-sm flex flex-col gap-2.5">
            <div className="relative flex items-center">
              <input
                type={showApiKeyVisibility ? "text" : "password"}
                className="w-full pr-10 text-xs py-2 rounded-xl"
                placeholder="Masukkan API Key Anda (AIzaSy...)"
                value={localApiKey}
                onChange={(e) => setLocalApiKey(e.target.value)}
              />
              <button
                type="button"
                className="absolute right-3.5 text-slate-400 hover:text-slate-600"
                onClick={() => setShowApiKeyVisibility(!showApiKeyVisibility)}
              >
                {showApiKeyVisibility ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <button
              onClick={handleSaveApiKeyLocal}
              disabled={!localApiKey.trim()}
              className="primary-button min-h-11 w-full rounded-xl font-bold"
            >
              Simpan & Aktifkan Agen AI
            </button>
          </div>
        </motion.div>
      )}

      {/* Main Chat Workspace container */}
      {activeApiKey && (
        <div className="glass-card flex flex-col h-[640px] shadow-2xl overflow-hidden border border-slate-200/60 bg-white/80 backdrop-blur-md rounded-3xl">
          
          {/* Chat Bubble List Thread */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50/40">
            {messages.map((msg) => {
              const isUser = msg.role === "user";
              return (
                <div 
                  key={msg.id} 
                  className={`flex ${isUser ? "justify-end" : "justify-start"} items-start gap-2.5`}
                >
                  {/* Assistant Avatar Badge */}
                  {!isUser && (
                    <div className="h-8 w-8 rounded-xl bg-teal/10 text-teal flex items-center justify-center shrink-0 border border-teal/20 shadow-sm">
                      <Sparkles size={14} className="animate-sparkle" />
                    </div>
                  )}

                  {/* Bubble content */}
                  <div className="max-w-[85%] flex flex-col gap-2">
                    <div 
                      className={`p-3.5 rounded-2xl text-xs leading-relaxed shadow-sm ${
                        isUser 
                          ? "bg-gradient-to-br from-teal to-emerald-600 text-white font-semibold rounded-tr-none" 
                          : "bg-white border border-slate-200/80 text-navy rounded-tl-none"
                      }`}
                    >
                      <div className="space-y-1">
                        {parseMarkdown(msg.content, isUser)}
                      </div>
                    </div>

                    {/* Render Inline Parsed Transaction Drafts */}
                    {msg.action === "log" && msg.drafts && msg.drafts.length > 0 && (
                      <div className="space-y-3 mt-2 border-l-2 border-teal/20 pl-3">
                        {msg.drafts.map((item) => (
                          <div 
                            key={item.id}
                            className="bg-white dark:bg-slate-900/35 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col gap-3 shadow-sm relative hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200"
                          >
                            {/* Top row: Type & Amount */}
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-2.5">
                              <select
                                disabled={msg.isSaved}
                                value={item.type}
                                onChange={(e) => updateDraftItem(msg.id, item.id, { type: e.target.value as TransactionType })}
                                className="text-[10px] font-black px-2.5 py-1 rounded-full border-none w-auto max-h-7 leading-none cursor-pointer focus:ring-0 focus:outline-none"
                                style={{
                                  backgroundColor: item.type === "income" ? "rgba(16, 185, 129, 0.15)" : "rgba(225, 29, 72, 0.15)",
                                  color: item.type === "income" ? "#10b981" : "#f43f5e"
                                }}
                              >
                                <option value="income">INCOME</option>
                                <option value="expense">EXPENSE</option>
                              </select>

                              <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800/80 rounded-xl px-3 py-1 focus-within:border-teal dark:focus-within:border-teal transition duration-200">
                                  <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase">Rp</span>
                                  <input
                                    disabled={msg.isSaved}
                                    type="number"
                                    placeholder="0"
                                    value={item.amount || ""}
                                    onChange={(e) => updateDraftItem(msg.id, item.id, { amount: Math.max(0, parseInt(e.target.value) || 0) })}
                                    className="font-black text-navy dark:text-slate-200 text-xs border-none p-0 focus:ring-0 focus:outline-none w-28 bg-transparent"
                                  />
                                </div>
                                {!msg.isSaved && (
                                  <button
                                    onClick={() => deleteDraftItem(msg.id, item.id)}
                                    className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 p-2 rounded-xl transition duration-200 shrink-0"
                                    title="Hapus draf ini"
                                    type="button"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Notes Input */}
                            <div className="flex flex-col gap-1">
                              <span className="text-[9px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Catatan</span>
                              <input
                                disabled={msg.isSaved}
                                type="text"
                                placeholder="Keterangan transaksi"
                                value={item.notes}
                                onChange={(e) => updateDraftItem(msg.id, item.id, { notes: e.target.value })}
                                className="text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-950/20 border border-slate-200/50 dark:border-slate-800/50 rounded-xl py-2 px-3 focus:outline-none focus:border-teal dark:focus:border-teal focus:bg-white dark:focus:bg-slate-900/60 transition duration-200"
                              />
                            </div>

                            {/* Dropdowns row */}
                            <div className="grid gap-2 grid-cols-3">
                              <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Tanggal</span>
                                <input
                                  disabled={msg.isSaved}
                                  type="date"
                                  value={item.date}
                                  onChange={(e) => updateDraftItem(msg.id, item.id, { date: e.target.value })}
                                  className="text-[10px] font-bold text-slate-600 dark:text-slate-300 bg-slate-50/50 dark:bg-slate-950/20 border border-slate-200/50 dark:border-slate-800/50 rounded-xl py-2 px-2 focus:outline-none focus:border-teal dark:focus:border-teal focus:bg-white dark:focus:bg-slate-900/60 transition duration-200"
                                />
                              </div>
                              <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Kategori</span>
                                <select
                                  disabled={msg.isSaved}
                                  value={item.category}
                                  onChange={(e) => updateDraftItem(msg.id, item.id, { category: e.target.value })}
                                  className="text-[10px] font-bold text-slate-600 dark:text-slate-300 bg-slate-50/50 dark:bg-slate-950/20 border border-slate-200/50 dark:border-slate-800/50 rounded-xl py-2 px-2 focus:outline-none focus:border-teal dark:focus:border-teal focus:bg-white dark:focus:bg-slate-900/60 transition duration-200 cursor-pointer"
                                >
                                  {categories
                                    .filter((c) => c.type === item.type)
                                    .map((cat) => (
                                      <option key={cat.id} value={cat.name} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">
                                        {cat.name}
                                      </option>
                                    ))}
                                </select>
                              </div>
                              <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Kantong</span>
                                <select
                                  disabled={msg.isSaved}
                                  value={item.pocketId || ""}
                                  onChange={(e) => updateDraftItem(msg.id, item.id, { pocketId: e.target.value || undefined })}
                                  className="text-[10px] font-bold text-slate-600 dark:text-slate-300 bg-slate-50/50 dark:bg-slate-950/20 border border-slate-200/50 dark:border-slate-800/50 rounded-xl py-2 px-2 focus:outline-none focus:border-teal dark:focus:border-teal focus:bg-white dark:focus:bg-slate-900/60 transition duration-200 cursor-pointer"
                                >
                                  <option value="" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">Tanpa Kantong</option>
                                  {pockets.map((p) => (
                                    <option key={p.id} value={p.id} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">
                                      {p.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          </div>
                        ))}

                        {/* Save Confirmation Button */}
                        {!msg.isSaved && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => confirmSaveDrafts(msg.id, msg.drafts || [])}
                              className="primary-button min-h-8 text-[11px] font-black rounded-lg flex items-center justify-center gap-1 flex-1 shadow-md shadow-teal/10"
                            >
                              <Check size={12} />
                              Simpan ke Database ({msg.drafts?.length})
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* User Avatar Badge */}
                  {isUser && (
                    <div className="h-8 w-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center justify-center shrink-0 shadow-sm border border-slate-300/30 dark:border-white/5">
                      <User size={14} />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Pulsing AI Typing Indicator */}
            {isProcessing && (
              <div className="flex justify-start items-start gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-teal/10 text-teal flex items-center justify-center shrink-0 border border-teal/20 shadow-sm">
                  <Loader2 size={14} className="animate-spin" />
                </div>
                <div className="bg-white border border-slate-200/80 p-3.5 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-teal animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-teal animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-teal animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Inline Error banner */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-rose-50 border-t border-rose-100 p-2.5 text-center text-xs font-bold text-rose-800 flex items-center justify-center gap-1.5"
              >
                <AlertCircle size={14} className="shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Suggested Prompts Pill Section */}
          {messages.length === 1 && !isProcessing && (
            <div className="px-5 py-3 border-t border-slate-100 bg-white grid gap-2 sm:grid-cols-2">
              {suggestions.map((sug, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(sug.text)}
                  className="text-left p-2.5 rounded-xl border border-slate-200 hover:border-teal hover:bg-teal/[0.01] transition-all duration-200 text-[11px] font-semibold text-slate-600 flex items-center justify-between group cursor-pointer"
                >
                  <span className="truncate">{sug.text}</span>
                  <ArrowUpRight size={12} className="text-slate-400 group-hover:text-teal shrink-0 ml-1.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-200" />
                </button>
              ))}
            </div>
          )}

          {/* Chat Text Box Input Area */}
          <div className="p-4 border-t border-slate-200 bg-white flex gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isProcessing) {
                  void handleSend();
                }
              }}
              placeholder="Ketik kalimat transaksi atau ajukan pertanyaan analisis di sini..."
              className="flex-1 text-xs rounded-xl border border-slate-200 py-2.5 px-4 focus:border-teal focus:ring-1 focus:ring-teal/30 bg-slate-50/50"
              disabled={isProcessing}
            />
            <button
              onClick={() => handleSend()}
              disabled={isProcessing || !inputText.trim()}
              className="primary-button min-h-10 px-4 rounded-xl flex items-center justify-center shadow-md shadow-teal/10 hover:shadow-teal/20 text-white font-bold"
            >
              <Send size={14} />
            </button>
          </div>

        </div>
      )}

    </div>
  );
}

function parseMarkdown(text: string, isUser = false) {
  const lines = text.split("\n");
  return lines.map((line, idx) => {
    const cleanLine = line.trim();
    
    // Heading 3
    if (cleanLine.startsWith("### ")) {
      return <h3 key={idx} className={`text-xs font-black mt-3 mb-1 ${isUser ? "text-white" : "text-navy"}`}>{parseInlineMarkdown(cleanLine.slice(4), isUser)}</h3>;
    }
    // Heading 2
    if (cleanLine.startsWith("## ")) {
      return <h4 key={idx} className={`text-sm font-black mt-4 mb-1.5 ${isUser ? "text-white" : "text-navy"}`}>{parseInlineMarkdown(cleanLine.slice(3), isUser)}</h4>;
    }
    // Heading 1
    if (cleanLine.startsWith("# ")) {
      return <h4 key={idx} className={`text-base font-black mt-4 mb-2 ${isUser ? "text-white" : "text-navy"}`}>{parseInlineMarkdown(cleanLine.slice(2), isUser)}</h4>;
    }
    // Bullet item
    if (cleanLine.startsWith("- ") || cleanLine.startsWith("* ")) {
      return (
        <ul key={idx} className="list-disc pl-4 my-0.5 animate-fade-in">
          <li className={`text-[11px] font-semibold ${isUser ? "text-white/90" : "text-slate-600"}`}>{parseInlineMarkdown(cleanLine.slice(2), isUser)}</li>
        </ul>
      );
    }
    
    // Empty line
    if (!cleanLine) {
      return <div key={idx} className="h-1.5" />;
    }
    
    // Regular paragraph
    return <p key={idx} className={`text-[11px] font-semibold my-0.5 leading-relaxed ${isUser ? "text-white" : "text-slate-600"}`}>{parseInlineMarkdown(line, isUser)}</p>;
  });
}

function parseInlineMarkdown(text: string, isUser = false) {
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={idx} className={`font-extrabold ${isUser ? "text-white" : "text-navy"}`}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={idx} className={`px-1 py-0.5 rounded font-bold font-mono ${isUser ? "bg-white/20 text-white" : "bg-slate-100 text-rose-600"}`}>{part.slice(1, -1)}</code>;
    }
    return part;
  });
}
