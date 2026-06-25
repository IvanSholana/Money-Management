import { useRef, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { createSamplePockets, createSampleTransactions, defaultCategories } from "../data/defaults";
import { CurrencyInput } from "../components/CurrencyInput";
import { AppData, Category, Settings as SettingsType, TransactionType } from "../types";
import { downloadFile, normalizeData } from "../utils/storage";
import { exportToCSV } from "../utils/finance";
import { createId } from "../utils/id";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Settings as SettingsIcon, 
  Download, 
  Upload, 
  Trash2, 
  Plus, 
  AlertOctagon, 
  Tag, 
  RefreshCw, 
  Target, 
  FileJson, 
  FileSpreadsheet,
  AlertCircle,
  Key,
  Eye,
  EyeOff,
  Sparkles
} from "lucide-react";

type SettingsProps = {
  data: AppData;
  onDataChange: (data: AppData) => void;
};

export function Settings({ data, onDataChange }: SettingsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [categoryDraft, setCategoryDraft] = useState({ name: "", type: "expense" as TransactionType });
  const [editingCategoryId, setEditingCategoryId] = useState("");
  const [message, setMessage] = useState("");
  const [confirmAction, setConfirmAction] = useState<"clear-transactions" | "reset-data" | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  function updateSettings(settings: Partial<SettingsType>) {
    onDataChange({ ...data, settings: { ...data.settings, ...settings } });
  }

  function saveCategory() {
    const name = categoryDraft.name.trim();
    if (!name) {
      setMessage("Nama kategori wajib diisi.");
      return;
    }

    const duplicate = data.categories.some(
      (category) =>
        category.name.toLowerCase() === name.toLowerCase() &&
        category.type === categoryDraft.type &&
        category.id !== editingCategoryId,
    );
    if (duplicate) {
      setMessage("Kategori dengan nama tersebut sudah ada.");
      return;
    }

    if (editingCategoryId) {
      const previousCategory = data.categories.find((category) => category.id === editingCategoryId);
      onDataChange({
        ...data,
        categories: data.categories.map((category) =>
          category.id === editingCategoryId ? { ...category, name, type: categoryDraft.type } : category,
        ),
        transactions: previousCategory
          ? data.transactions.map((transaction) =>
              transaction.category === previousCategory.name && transaction.type === previousCategory.type
                ? { ...transaction, category: name, type: categoryDraft.type }
                : transaction,
            )
          : data.transactions,
      });
    } else {
      onDataChange({
        ...data,
        categories: [
          ...data.categories,
          { id: createId(), name, type: categoryDraft.type, isDefault: false },
        ],
      });
    }

    setCategoryDraft({ name: "", type: "expense" });
    setEditingCategoryId("");
    setMessage("Kategori tersimpan.");
    setTimeout(() => setMessage(""), 3000);
  }

  function deleteCategory(category: Category) {
    const used = data.transactions.some((transaction) => transaction.category === category.name);
    if (used) {
      setMessage("Kategori sedang dipakai transaksi, jadi tidak bisa dihapus.");
      return;
    }
    onDataChange({ ...data, categories: data.categories.filter((item) => item.id !== category.id) });
  }

  function exportJson() {
    downloadFile("monthly-cashflow-data.json", JSON.stringify(data, null, 2), "application/json");
  }

  function exportCsv() {
    downloadFile("monthly-cashflow-transactions.csv", exportToCSV(data.transactions, data.budgetPockets), "text/csv");
  }

  async function importJson(file: File) {
    try {
      const content = await file.text();
      onDataChange(normalizeData(JSON.parse(content)));
      setMessage("Data berhasil diimpor.");
      setTimeout(() => setMessage(""), 3000);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Gagal impor data.");
      setTimeout(() => setMessage(""), 3000);
    }
  }

  function loadSampleData() {
    onDataChange({ ...data, budgetPockets: createSamplePockets(), transactions: createSampleTransactions() });
    setMessage("Sample data loaded successfully.");
    setTimeout(() => setMessage(""), 3000);
  }

  function clearTransactions() {
    setConfirmAction("clear-transactions");
  }

  function resetAllData() {
    setConfirmAction("reset-data");
  }

  function confirmDangerAction() {
    if (confirmAction === "clear-transactions") {
      onDataChange({ ...data, transactions: [] });
      setMessage("Semua transaksi sudah dihapus.");
    }

    if (confirmAction === "reset-data") {
      onDataChange({
        transactions: [],
        categories: defaultCategories,
        budgetPockets: [],
        assets: [],
        targets: [],
        theses: [],
        settings: { monthlyIncomeTarget: 7_700_000, monthlyExpenseTarget: 3_000_000, currency: "IDR" },
      });
      setMessage("Data lokal sudah direset ke default.");
    }

    setConfirmAction(null);
    setTimeout(() => setMessage(""), 3000);
  }

  return (
    <>
      <div className="grid gap-5">
        <motion.section 
          initial={{ opacity: 0, y: -15 }}
          animate={{ opacity: 1, y: 0 }}
          className="hero-card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <h2 className="section-title text-xl font-black text-navy flex items-center gap-2">
              <SettingsIcon size={22} className="text-teal animate-sparkle" />
              <span>Pengaturan Workspace</span>
            </h2>
            <p className="text-sm text-slate-500 mt-1">Sesuaikan target keuangan bulanan, lakukan import/export data, dan kelola kategori transaksi.</p>
          </div>
        </motion.section>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="grid gap-5 lg:grid-cols-2"
        >
          <div className="flex flex-col gap-5">
            <section className="panel bg-white/95">
              <h2 className="section-title text-base font-extrabold text-navy mb-4 flex items-center gap-2">
                <Target size={18} className="text-teal" />
                <span>Target Bulanan</span>
              </h2>
              <div className="grid gap-3">
                <label className="field">
                  <span className="text-xs text-slate-500">Target Pemasukan Bulanan</span>
                  <CurrencyInput
                    value={data.settings.monthlyIncomeTarget}
                    onValueChange={(monthlyIncomeTarget) => updateSettings({ monthlyIncomeTarget })}
                  />
                </label>
                <label className="field">
                  <span className="text-xs text-slate-500">Target Pengeluaran Bulanan</span>
                  <CurrencyInput
                    value={data.settings.monthlyExpenseTarget}
                    onValueChange={(monthlyExpenseTarget) => updateSettings({ monthlyExpenseTarget })}
                  />
                </label>
                <label className="field">
                  <span className="text-xs text-slate-500">Display Mata Uang</span>
                  <select value={data.settings.currency} onChange={() => undefined} className="bg-slate-50">
                    <option value="IDR">Rupiah (IDR)</option>
                  </select>
                </label>
              </div>
            </section>

            <section className="panel bg-white/95">
              <h2 className="section-title text-base font-extrabold text-navy mb-4 flex items-center gap-2">
                <Key size={18} className="text-teal animate-pulse" />
                <span>Integrasi DeepSeek AI</span>
              </h2>
              <div className="grid gap-3">
                <p className="text-xs leading-5 text-slate-500 font-medium">
                  Aplikasi ini mendukung analisis kuantitatif dan asisten keuangan otomatis menggunakan teknologi DeepSeek. Dapatkan kunci API Anda dari{" "}
                  <a 
                    href="https://platform.deepseek.com/" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-teal hover:underline font-bold"
                  >
                    DeepSeek Console
                  </a>.
                </p>
                <div className="border-t border-slate-100 pt-3 mt-1">
                  <span className="text-xs text-slate-500 block mb-1.5 font-bold">Kunci API DeepSeek (Rotasi Maksimal 5 Key)</span>
                  <div className="space-y-2 mb-2">
                    {[0, 1, 2, 3, 4].map((index) => {
                      const keys = data.settings.deepseekApiKeys || [];
                      const val = keys[index] || (index === 0 ? data.settings.deepseekApiKey : "") || "";
                      
                      return (
                        <div key={index} className="flex items-center gap-2">
                          <span className="text-xs font-mono text-slate-400 w-6 text-right">#{index + 1}</span>
                          <div className="relative flex-1 flex items-center">
                            <input
                              type={showApiKey ? "text" : "password"}
                              className="w-full pr-10 text-xs py-2 px-3 rounded-xl border border-slate-200 focus:border-teal"
                              placeholder={index === 0 ? "Kunci API Utama..." : `Kunci Cadangan #${index}...`}
                              value={val}
                              onChange={(event) => {
                                const newKeys = [...keys];
                                while (newKeys.length <= index) {
                                  newKeys.push("");
                                }
                                newKeys[index] = event.target.value;
                                
                                const updates: any = { deepseekApiKeys: newKeys };
                                if (index === 0) {
                                  updates.deepseekApiKey = event.target.value;
                                }
                                updateSettings(updates);
                              }}
                            />
                            {index === 0 && (
                              <button
                                type="button"
                                className="absolute right-3 text-slate-400 hover:text-slate-600 focus:outline-none"
                                onClick={() => setShowApiKey(!showApiKey)}
                              >
                                {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <small className="text-[10px] text-slate-400 font-medium leading-normal">
                    💡 Kunci API disimpan secara lokal di browser & database SQLite Anda. Jika kunci utama terkena limit, sistem beralih otomatis ke kunci cadangan.
                  </small>
                </div>
              </div>
            </section>

            <section className="panel bg-white/95">
              <h2 className="section-title text-base font-extrabold text-navy mb-4 flex items-center gap-2">
                <Sparkles size={18} className="text-teal animate-pulse" />
                <span>Penyedia Data Saham & Auto-Sync</span>
              </h2>
              <div className="grid gap-3">
                <label className="field">
                  <span className="text-xs text-slate-500">Penyedia Data Harga</span>
                  <select 
                    value={data.settings.stockProvider || "yahoo"} 
                    onChange={(event) => updateSettings({ stockProvider: event.target.value as "yahoo" | "twelvedata" })}
                  >
                    <option value="yahoo">Yahoo Finance (Gratis, Tanpa Kunci)</option>
                    <option value="twelvedata">Twelve Data (Membutuhkan Kunci)</option>
                  </select>
                </label>

                {data.settings.stockProvider === "twelvedata" && (
                  <label className="field animate-fade-in">
                    <span className="text-xs text-slate-500">Twelve Data API Key</span>
                    <input
                      type="text"
                      placeholder="Masukkan Kunci API Twelve Data..."
                      value={data.settings.twelveDataApiKey || ""}
                      onChange={(event) => updateSettings({ twelveDataApiKey: event.target.value })}
                    />
                  </label>
                )}

                <label className="field">
                  <span className="text-xs text-slate-500">Interval Auto-Update Harga Saham</span>
                  <select
                    value={data.settings.autoSyncInterval || 0}
                    onChange={(event) => updateSettings({ autoSyncInterval: Number(event.target.value) })}
                  >
                    <option value={0}>Matikan Pembaruan Otomatis</option>
                    <option value={15}>Setiap 15 Menit</option>
                    <option value={30}>Setiap 30 Menit</option>
                    <option value={60}>Setiap 1 Jam</option>
                  </select>
                </label>

                <div className="border-t border-slate-100 pt-3 mt-2">
                  <h3 className="text-xs font-bold text-navy mb-2">Pemindaian Saham Otomatis (Auto-Scanner Latar Belakang)</h3>
                  <div className="flex items-center justify-between mb-3 bg-slate-50/50 p-2.5 rounded-xl border border-slate-100">
                    <div>
                      <p className="text-xs font-bold text-navy">Aktifkan Auto-Scanner</p>
                      <p className="text-[10px] text-slate-500 leading-normal">Pindai & analisis saham Tesis Investasi secara berkala</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={data.settings.autoScanEnabled || false}
                        onChange={(e) => updateSettings({ autoScanEnabled: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-teal"></div>
                    </label>
                  </div>
                  
                  {data.settings.autoScanEnabled && (
                    <label className="field animate-fade-in">
                      <span className="text-xs text-slate-500">Interval Auto-Scan Saham</span>
                      <select
                        value={data.settings.autoScanInterval || 0}
                        onChange={(event) => updateSettings({ autoScanInterval: Number(event.target.value) })}
                      >
                        <option value={0}>Pilih Interval...</option>
                        <option value={15}>Setiap 15 Menit</option>
                        <option value={30}>Setiap 30 Menit</option>
                        <option value={60}>Setiap 1 Jam</option>
                        <option value={120}>Setiap 2 Jam</option>
                      </select>
                    </label>
                  )}
                </div>

                <label className="field">
                  <span className="text-xs text-slate-500">Tema Tampilan Aplikasi</span>
                  <select
                    value={data.settings.theme || "light"}
                    onChange={(event) => updateSettings({ theme: event.target.value as "light" | "dark" })}
                  >
                    <option value="light">Terang (Light Mode)</option>
                    <option value="dark">Gelap (Dark Mode)</option>
                  </select>
                </label>
                <small className="text-[10px] text-slate-400 font-medium leading-normal">
                  💡 Pembaruan otomatis berjalan di latar belakang selama aplikasi terbuka di browser. Gunakan Yahoo Finance untuk bebas biaya & konfigurasi.
                </small>
              </div>
            </section>
          </div>

          <section className="panel bg-white/95">
            <h2 className="section-title text-base font-extrabold text-navy mb-4 flex items-center gap-2">
              <RefreshCw size={18} className="text-teal" />
              <span>Sinkronisasi & Contoh Data</span>
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="secondary-button min-h-10 rounded-xl font-bold flex items-center justify-center gap-1.5" 
                type="button" 
                onClick={exportJson}
              >
                <FileJson size={16} />
                Export JSON
              </motion.button>
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="secondary-button min-h-10 rounded-xl font-bold flex items-center justify-center gap-1.5" 
                type="button" 
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={16} />
                Import JSON
              </motion.button>
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="secondary-button min-h-10 rounded-xl font-bold flex items-center justify-center gap-1.5" 
                type="button" 
                onClick={exportCsv}
              >
                <FileSpreadsheet size={16} />
                Export CSV
              </motion.button>
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="secondary-button min-h-10 rounded-xl font-bold flex items-center justify-center gap-1.5 text-teal-700 border-teal-200 bg-teal-50/20" 
                type="button" 
                onClick={loadSampleData}
              >
                <Plus size={16} />
                Load Sample Data
              </motion.button>
            </div>
            <input
              ref={fileInputRef}
              className="hidden"
              type="file"
              accept="application/json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importJson(file);
                event.target.value = "";
              }}
            />
          </section>

          <section className="panel bg-white/95 lg:col-span-2">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="section-title text-base font-extrabold text-navy flex items-center gap-2">
                  <Tag size={18} className="text-teal" />
                  <span>Kategori Transaksi</span>
                </h2>
                <p className="text-xs text-slate-500 mt-1">Tambah, edit, dan hapus kategori lokal.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_160px_auto] items-end w-full md:max-w-xl">
                <input
                  placeholder="Nama kategori"
                  value={categoryDraft.name}
                  onChange={(event) => setCategoryDraft({ ...categoryDraft, name: event.target.value })}
                />
                <select
                  value={categoryDraft.type}
                  onChange={(event) => setCategoryDraft({ ...categoryDraft, type: event.target.value as TransactionType })}
                >
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                </select>
                <button className="primary-button min-h-11 px-4 rounded-xl font-bold" type="button" onClick={saveCategory}>
                  {editingCategoryId ? "Update" : "Tambah"}
                </button>
              </div>
            </div>

            <AnimatePresence mode="wait">
              {message && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-4 rounded-xl bg-teal-50 border border-teal-100 p-3 text-xs font-bold text-teal-800 flex items-center gap-2 overflow-hidden"
                >
                  <AlertCircle size={15} />
                  <span>{message}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="grid gap-4 md:grid-cols-2">
              {(["income", "expense"] as TransactionType[]).map((type) => (
                <div key={type} className="rounded-2xl border border-slate-200/80 p-4 bg-slate-50/20">
                  <h3 className="mb-3 font-extrabold text-sm text-navy">{type === "income" ? "Income Category" : "Expense Category"}</h3>
                  <div className="grid gap-2">
                    <AnimatePresence mode="popLayout">
                      {data.categories
                        .filter((category) => category.type === type)
                        .map((category) => (
                          <motion.div 
                            key={category.id} 
                            layout
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="flex items-center justify-between gap-3 rounded-xl bg-white p-2.5 border border-slate-100 shadow-sm"
                          >
                            <span className="text-xs font-bold text-slate-700">
                              {category.name}
                              {category.isDefault ? <span className="ml-2 inline-block rounded-full bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 text-[9px] font-bold text-slate-500 dark:text-slate-300">default</span> : null}
                            </span>
                            <div className="flex gap-1.5">
                              <button
                                className="secondary-button min-h-8 px-2.5 rounded-lg text-xs font-bold"
                                type="button"
                                onClick={() => {
                                  setEditingCategoryId(category.id);
                                  setCategoryDraft({ name: category.name, type: category.type });
                                }}
                              >
                                Edit
                              </button>
                              <button 
                                className="danger-button min-h-8 px-2.5 rounded-lg text-xs font-bold" 
                                type="button" 
                                onClick={() => deleteCategory(category)}
                              >
                                Hapus
                              </button>
                            </div>
                          </motion.div>
                        ))}
                    </AnimatePresence>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="panel border-rose-200/80 bg-rose-50/10 lg:col-span-2">
            <h2 className="section-title text-base font-extrabold text-rose-700 flex items-center gap-2">
              <AlertOctagon size={18} className="text-rose-600" />
              <span>Danger Zone</span>
            </h2>
            <p className="text-xs text-rose-600/70 mt-1">Tindakan di bawah ini akan memodifikasi data secara permanen. Pastikan Anda sudah membackup data Anda.</p>
            <div className="grid gap-3 sm:grid-cols-2 mt-4">
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="danger-button min-h-10 rounded-xl font-bold flex items-center justify-center gap-1.5" 
                type="button" 
                onClick={clearTransactions}
              >
                <Trash2 size={16} />
                Clear Transactions
              </motion.button>
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="danger-button min-h-10 rounded-xl font-bold flex items-center justify-center gap-1.5" 
                type="button" 
                onClick={resetAllData}
              >
                <RefreshCw size={16} />
                Reset All Data
              </motion.button>
            </div>
          </section>
        </motion.div>
      </div>

      <ConfirmDialog
        open={confirmAction !== null}
        title={confirmAction === "reset-data" ? "Reset semua data?" : "Hapus semua transaksi?"}
        description={
          confirmAction === "reset-data"
            ? "Semua transaksi, kantong, tesis, kategori custom, dan pengaturan akan dikembalikan ke default."
            : "Semua transaksi akan dihapus dari database lokal, tapi kategori, kantong, dan pengaturan tetap ada."
        }
        confirmLabel={confirmAction === "reset-data" ? "Reset data" : "Hapus transaksi"}
        cancelLabel="Tidak jadi"
        details={
          <div className="text-xs text-slate-600">
            <p className="font-extrabold text-navy">Saran aman:</p>
            <p className="mt-1 leading-normal">Export JSON dulu jika Anda merasa data ini mungkin masih dibutuhkan di masa mendatang.</p>
          </div>
        }
        onCancel={() => setConfirmAction(null)}
        onConfirm={confirmDangerAction}
      />
    </>
  );
}

