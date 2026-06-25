import { useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Loader2, Sparkles, TrendingUp, DollarSign, Activity, Percent } from "lucide-react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  Legend,
  AreaChart,
  Area,
} from "recharts";
import { CurrencyInput } from "../components/CurrencyInput";
import { MetricCard } from "../components/MetricCard";
import {
  ConvictionLevel,
  CurrentDecision,
  DecisionStatus,
  EmotionCheck,
  Asset,
  InvestmentThesis,
  PortfolioRole,
  ReviewAction,
  ReviewValidity,
  SyariahStatus,
  ThesisStatus,
  ThesisType,
  Settings as AppSettings,
  FundamentalMetric,
} from "../types";
import { formatIDR } from "../utils/finance";
import { createId } from "../utils/id";
import { downloadFile } from "../utils/storage";
import { normalizeData } from "../utils/storage";
import {
  calculateChecklistCompletion,
  calculateEntryPlanAmounts,
  calculateMarginOfSafety,
  convictionLevels,
  createEmptyThesis,
  currentDecisions,
  emotionChecks,
  exportThesesToCSV,
  getNeedsAttention,
  getOverdueReviews,
  getThesesMissingKeyInformation,
  getThesisStatusBadge,
  investmentHorizons,
  portfolioRoles,
  reviewActions,
  reviewFrequencies,
  reviewValidities,
  syariahStatuses,
  thesisStatuses,
  thesisTypes,
  validateThesis,
} from "../utils/thesis";

type ThesisProps = {
  assets: Asset[];
  theses: InvestmentThesis[];
  onThesesChange: (theses: InvestmentThesis[]) => void;
  settings: AppSettings;
};

type ThesisMode = "list" | "form" | "detail";

const lowMediumHigh = ["Low", "Medium", "High"] as const;
const decisionStatuses: DecisionStatus[] = ["Open", "Reviewed", "Good Decision", "Bad Decision", "Neutral"];
const helpText: Record<string, string> = {
  "Tesis Saham": "Catatan alasan investasi sebelum membeli saham. Tujuannya membuat keputusan lebih sadar, bukan memberi rekomendasi beli.",
  "Needs Attention": "Daftar tesis yang perlu dicek karena review lewat, data penting belum lengkap, status syariah belum jelas, atau sudah monitoring tapi belum pernah direview.",
  "Total tesis": "Jumlah semua tesis saham yang kamu simpan.",
  Ideas: "Saham yang masih berupa ide awal atau sedang diteliti.",
  Watchlist: "Saham yang menarik, tapi belum tentu siap dibeli.",
  "Ready to Buy": "Status internal bahwa tesis terlihat siap secara struktur. Tetap bukan rekomendasi otomatis untuk membeli.",
  "Bought / Monitoring": "Saham yang sudah dibeli atau sedang dipantau setelah keputusan dibuat.",
  "Thesis Broken": "Kondisi ketika alasan utama membeli saham sudah tidak berlaku.",
  "Upcoming/Overdue Review": "Tesis yang punya jadwal review dekat atau sudah lewat.",
  "High Conviction": "Tesis dengan keyakinan tinggi berdasarkan risetmu, bukan jaminan hasil.",
  "Daftar Tesis": "Tempat melihat dan memfilter semua tesis saham.",
  Ticker: "Kode saham, misalnya BBCA, TLKM, atau UNVR.",
  Company: "Nama perusahaan dari saham tersebut.",
  "Company Name": "Nama perusahaan dari saham tersebut.",
  Sector: "Sektor bisnis utama perusahaan, misalnya bank, consumer, telekomunikasi, atau energi.",
  Status: "Tahap tesis saat ini, dari ide awal sampai closed atau thesis broken.",
  Role: "Peran saham dalam portofolio.",
  "Portfolio Role": "Peran saham dalam portofolio: core untuk utama, stabilizer untuk penyeimbang, satellite untuk ide kecil/lebih taktis.",
  Type: "Jenis tesis investasi.",
  "Thesis Type": "Jenis alasan investasi, misalnya dividend, growth, defensive, value, cyclical, atau turnaround.",
  Conviction: "Tingkat keyakinanmu terhadap tesis setelah riset.",
  "Conviction Level": "Low/Medium/High untuk menandai seberapa kuat keyakinanmu. Ini bukan prediksi pasti.",
  "Last Review": "Tanggal terakhir kamu mengecek ulang tesis.",
  "Last Review Date": "Tanggal terakhir kamu mengecek ulang tesis.",
  "Next Review": "Tanggal berikutnya untuk membaca ulang tesis dan mengecek apakah masih valid.",
  "Next Review Date": "Tanggal berikutnya untuk membaca ulang tesis dan mengecek apakah masih valid.",
  Decision: "Keputusan saat ini terhadap saham ini.",
  "Current Decision": "Keputusan saat ini: no action, watchlist, hold, add, reduce, sell, atau review.",
  Updated: "Tanggal terakhir tesis ini diedit.",
  "Syariah Status": "Status kesesuaian syariah menurut catatanmu: DES, Non-DES, belum dicek, atau perlu cek ulang.",
  "Investment Horizon": "Perkiraan jangka waktu tesis: 1, 3, 5, atau 10 tahun.",
  "Ringkasan Tesis": "Ringkasan satu paragraf: kenapa saham ini menarik dan apa alasan utamanya.",
  "One paragraph summary": "Tulis alasan inti investasi dalam satu paragraf sederhana. Kalau tidak bisa diringkas, tesis mungkin belum jelas.",
  "Kualitas Bisnis": "Catatan tentang kekuatan bisnis: brand, moat, pelanggan, pricing power, manajemen, dan daya tahan kompetitif.",
  "Financial Strength": "Catatan tentang kesehatan keuangan: utang, cashflow, margin, laba, dan stabilitas bisnis.",
  "Valuation Notes": "Catatan kenapa valuasinya masuk akal atau mahal menurut analisismu.",
  "Portfolio Fit": "Kenapa saham ini cocok atau tidak cocok dengan portofolio dan tujuanmu.",
  "Valuasi & Area Beli": "Bagian untuk menulis estimasi nilai wajar dan batas harga beli agar tidak FOMO.",
  "Current Price": "Harga saham saat kamu menulis atau mereview tesis. Diisi manual, tidak otomatis dari API.",
  "Conservative Fair Value": "Estimasi nilai wajar versi hati-hati. Biasanya memakai asumsi lebih rendah.",
  "Moderate Fair Value": "Estimasi nilai wajar versi tengah. Dipakai untuk menghitung margin of safety.",
  "Required Margin of Safety %": "Diskon minimal dari nilai wajar yang kamu inginkan sebelum membeli.",
  "First Buy Price": "Harga rencana pembelian pertama.",
  "Add Price": "Harga atau area untuk menambah posisi jika tesis masih valid.",
  "Strong Buy Price": "Harga yang menurut rencanamu sangat menarik, tetap harus cek risiko.",
  "Do Not Buy Above": "Batas harga atas. Di atas harga ini kamu memilih tidak membeli agar tidak mengejar harga.",
  "Max Allocation %": "Batas maksimal porsi saham ini dari total portofolio agar risiko terkendali.",
  "Margin of Safety": "Selisih antara nilai wajar dan harga sekarang. Rumus: (fair value - current price) / fair value.",
  "Rencana Entry": "Rencana bertahap untuk masuk posisi, supaya tidak membeli semua sekaligus karena emosi.",
  "Planned Capital": "Total modal yang direncanakan untuk saham ini.",
  "First Entry %": "Persentase modal untuk pembelian pertama.",
  "Second Entry %": "Persentase modal untuk pembelian kedua.",
  "Third Entry %": "Persentase modal untuk pembelian ketiga.",
  "Entry Notes": "Catatan kondisi apa yang harus terjadi sebelum entry atau tambah posisi.",
  "Risiko Utama": "Hal-hal yang bisa membuat tesis gagal atau hasil investasi buruk.",
  "Risk name": "Nama risiko, misalnya margin turun, regulasi berubah, utang tinggi, atau kompetisi meningkat.",
  Impact: "Seberapa besar dampak risiko jika terjadi.",
  Probability: "Seberapa mungkin risiko tersebut terjadi menurut penilaianmu.",
  Mitigation: "Cara mengurangi atau memantau risiko tersebut.",
  "Kriteria Tesis Salah": "Tuliskan tanda-tanda yang membuat kamu harus mengakui tesis keliru.",
  "Apa yang membuat tesis salah?": "Kondisi yang membatalkan alasan utama investasi.",
  "Kapan stop averaging down?": "Batas kapan kamu berhenti tambah beli saat harga turun.",
  "Kapan review/sell/reduce?": "Kondisi yang membuat kamu harus review besar, jual, atau kurangi posisi.",
  "Jadwal Review & Keputusan": "Bagian untuk mengatur kapan tesis dicek ulang dan keputusan saat ini.",
  "Review Frequency": "Seberapa sering tesis perlu dicek: bulanan, kuartalan, tahunan, atau saat ada event penting.",
  "Review Notes": "Catatan tambahan saat melakukan review.",
  "Decision Reason": "Alasan dari keputusan saat ini. Ini penting agar keputusan tidak impulsif.",
  "Checklist Sebelum Beli": "Checklist kelengkapan tesis. Ini hanya mengecek struktur berpikir, bukan memberi sinyal beli.",
  "Kecocokan Portfolio": "Apakah saham ini membantu tujuan portofolio atau justru menambah risiko yang sama.",
  "Jadwal Review": "Kapan tesis terakhir dan berikutnya perlu dicek ulang.",
  "Keputusan Saat Ini": "Keputusan terakhir terhadap saham ini dan alasan di baliknya.",
  "Riwayat Review": "Catatan perubahan tesis dari waktu ke waktu.",
  "Riwayat Keputusan": "Log keputusan agar kamu bisa belajar dari proses, bukan hanya hasil.",
  "What changed?": "Apa yang berubah sejak review terakhir: harga, bisnis, risiko, laporan keuangan, atau sentimen pribadi.",
  "Thesis Still Valid": "Apakah alasan utama investasi masih berlaku.",
  Action: "Aksi setelah review, misalnya hold, add, reduce, sell, atau review lagi.",
  Reason: "Alasan singkat dan rasional untuk keputusan atau review.",
  "Emotion Check": "Cek kondisi emosi saat membuat keputusan: calm, FOMO, panic, greedy, atau confused.",
  Amount: "Nominal uang yang terkait keputusan, opsional.",
  Price: "Harga saham saat keputusan dibuat, opsional.",
  Risk: "Risiko utama dari keputusan ini.",
  "Expected Outcome": "Hasil yang kamu harapkan saat membuat keputusan.",
  "Actual Outcome": "Hasil aktual setelah waktu berjalan, untuk evaluasi.",
};

export function Thesis({ assets, theses, onThesesChange, settings }: ThesisProps) {
  const importRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<ThesisMode>("list");
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<InvestmentThesis>(() => createEmptyThesis());
  const [errors, setErrors] = useState<string[]>([]);
  const [thesisToDelete, setThesisToDelete] = useState<InvestmentThesis | null>(null);
  const [filters, setFilters] = useState({
    status: "All",
    role: "All",
    type: "All",
    conviction: "All",
    search: "",
  });

  const selectedThesis = theses.find((thesis) => thesis.id === selectedId) || null;
  const selectedThesisAssets = selectedThesis ? assets.filter((asset) => asset.thesisId === selectedThesis.id) : [];
  const needsAttention = useMemo(() => getNeedsAttention(theses), [theses]);
  const missingKeyInfo = useMemo(() => getThesesMissingKeyInformation(theses), [theses]);
  const overdueReviews = useMemo(() => getOverdueReviews(theses), [theses]);

  const filteredTheses = theses
    .filter((thesis) => filters.status === "All" || thesis.status === filters.status)
    .filter((thesis) => filters.role === "All" || thesis.portfolioRole === filters.role)
    .filter((thesis) => filters.type === "All" || thesis.thesisType === filters.type)
    .filter((thesis) => filters.conviction === "All" || thesis.convictionLevel === filters.conviction)
    .filter((thesis) => {
      const query = filters.search.trim().toLowerCase();
      if (!query) return true;
      return `${thesis.ticker} ${thesis.companyName}`.toLowerCase().includes(query);
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  function openCreateForm() {
    setDraft(createEmptyThesis());
    setErrors([]);
    setMode("form");
  }

  function openEditForm(thesis: InvestmentThesis) {
    setDraft(structuredClone(thesis));
    setErrors([]);
    setMode("form");
    setSelectedId(thesis.id);
  }

  function saveThesis() {
    const normalized = {
      ...draft,
      ticker: draft.ticker.trim().toUpperCase(),
      companyName: draft.companyName.trim(),
      updatedAt: new Date().toISOString(),
    };
    const validationErrors = validateThesis(normalized);
    if (validationErrors.length) {
      setErrors(validationErrors);
      return;
    }

    const exists = theses.some((thesis) => thesis.id === normalized.id);
    onThesesChange(exists ? theses.map((thesis) => (thesis.id === normalized.id ? normalized : thesis)) : [normalized, ...theses]);
    setSelectedId(normalized.id);
    setMode("detail");
  }

  function deleteThesis(id: string) {
    setThesisToDelete(theses.find((thesis) => thesis.id === id) || null);
  }

  function confirmDeleteThesis() {
    if (!thesisToDelete) return;
    onThesesChange(theses.filter((thesis) => thesis.id !== thesisToDelete.id));
    if (selectedId === thesisToDelete.id) {
      setSelectedId("");
      setMode("list");
    }
    setThesisToDelete(null);
  }

  function viewThesis(thesis: InvestmentThesis) {
    setSelectedId(thesis.id);
    setMode("detail");
  }

  function exportJson() {
    downloadFile("investment-theses.json", JSON.stringify(theses, null, 2), "application/json");
  }

  function exportCsv() {
    downloadFile("investment-theses.csv", exportThesesToCSV(theses), "text/csv");
  }

  async function importJson(file: File) {
    const content = await file.text();
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      alert("Format JSON tesis tidak valid.");
      return;
    }
    onThesesChange(normalizeData({ theses: parsed }).theses);
  }

  return (
    <>
      <div className="grid gap-5">
        <motion.section 
          initial={{ opacity: 0, y: -15 }}
          animate={{ opacity: 1, y: 0 }}
          className="hero-card flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
        >
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-teal">Investment thinking tool</p>
            <h2 className="section-title text-xl font-black text-navy mt-0.5"><HelpLabel label="Tesis Saham" /></h2>
            <p className="text-sm text-slate-500 mt-1">
              Susun alasan, risiko, area beli, dan review sebelum mengambil keputusan investasi.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <motion.button 
              whileHover={{ scale: 1.02 }} 
              whileTap={{ scale: 0.98 }} 
              className="primary-button font-bold rounded-xl min-h-9" 
              type="button" 
              onClick={openCreateForm}
            >
              Buat Tesis
            </motion.button>
            <motion.button 
              whileHover={{ scale: 1.02 }} 
              whileTap={{ scale: 0.98 }} 
              className="secondary-button font-bold rounded-xl min-h-9" 
              type="button" 
              onClick={() => setMode("list")}
            >
              Daftar Tesis
            </motion.button>
            <motion.button 
              whileHover={{ scale: 1.02 }} 
              whileTap={{ scale: 0.98 }} 
              className="secondary-button font-bold rounded-xl min-h-9" 
              type="button" 
              onClick={exportJson}
            >
              Export JSON
            </motion.button>
            <motion.button 
              whileHover={{ scale: 1.02 }} 
              whileTap={{ scale: 0.98 }} 
              className="secondary-button font-bold rounded-xl min-h-9" 
              type="button" 
              onClick={() => importRef.current?.click()}
            >
              Import JSON
            </motion.button>
            <motion.button 
              whileHover={{ scale: 1.02 }} 
              whileTap={{ scale: 0.98 }} 
              className="secondary-button font-bold rounded-xl min-h-9" 
              type="button" 
              onClick={exportCsv}
            >
              Export CSV
            </motion.button>
          </div>
          <input
            ref={importRef}
            className="hidden"
            type="file"
            accept="application/json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importJson(file);
              event.target.value = "";
            }}
          />
        </motion.section>

        <ThesisDashboard
          missingKeyInfo={missingKeyInfo.length}
          needsAttention={needsAttention}
          overdueReviews={overdueReviews.length}
          theses={theses}
          onView={viewThesis}
        />

        <AnimatePresence mode="wait">
          {mode === "list" && (
            <motion.div
              key="list"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
            >
              <ThesisList
                filters={filters}
                onDelete={deleteThesis}
                onEdit={openEditForm}
                onFilterChange={setFilters}
                onView={viewThesis}
                theses={filteredTheses}
              />
            </motion.div>
          )}

          {mode === "form" && (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
            >
              <ThesisForm draft={draft} errors={errors} onCancel={() => setMode("list")} onDraftChange={setDraft} onSave={saveThesis} settings={settings} />
            </motion.div>
          )}

          {mode === "detail" && selectedThesis && (
            <motion.div
              key="detail"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
            >
              <ThesisDetail
                assets={selectedThesisAssets}
                thesis={selectedThesis}
                onBack={() => setMode("list")}
                onDelete={() => deleteThesis(selectedThesis.id)}
                onEdit={() => openEditForm(selectedThesis)}
                onUpdate={(updated) => {
                  onThesesChange(theses.map((thesis) => (thesis.id === updated.id ? updated : thesis)));
                  setSelectedId(updated.id);
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ConfirmDialog
        open={Boolean(thesisToDelete)}
        title="Hapus tesis saham?"
        description="Tesis, review log, risk register, dan decision log terkait akan dihapus dari database lokal."
        confirmLabel="Hapus tesis"
        cancelLabel="Tidak jadi"
        onCancel={() => setThesisToDelete(null)}
        onConfirm={confirmDeleteThesis}
        details={
          thesisToDelete ? (
            <div>
              <p className="text-base font-black text-navy">{thesisToDelete.ticker || "-"} · {thesisToDelete.companyName || "Tanpa nama"}</p>
              <p className="mt-1 text-xs text-slate-600 font-semibold">{thesisToDelete.status} · {thesisToDelete.convictionLevel} conviction</p>
            </div>
          ) : null
        }
      />
    </>
  );
}

function ThesisDashboard({
  theses,
  needsAttention,
  overdueReviews,
  missingKeyInfo,
  onView,
}: {
  theses: InvestmentThesis[];
  needsAttention: InvestmentThesis[];
  overdueReviews: number;
  missingKeyInfo: number;
  onView: (thesis: InvestmentThesis) => void;
}) {
  const countByStatus = (statuses: ThesisStatus[]) => theses.filter((thesis) => statuses.includes(thesis.status)).length;
  return (
    <section className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total tesis" value={String(theses.length)} index={0} />
        <MetricCard label="Ideas" value={String(countByStatus(["Idea", "Researching"]))} index={1} />
        <MetricCard label="Watchlist" value={String(countByStatus(["Watchlist"]))} index={2} />
        <MetricCard label="Ready to Buy" value={String(countByStatus(["Ready to Buy"]))} tone="good" index={3} />
        <MetricCard label="Bought / Monitoring" value={String(countByStatus(["Bought", "Monitoring"]))} index={4} />
        <MetricCard label="Thesis Broken" value={String(countByStatus(["Thesis Broken"]))} tone="bad" index={5} />
        <MetricCard label="Upcoming/Overdue Review" value={String(overdueReviews)} tone={overdueReviews ? "bad" : "default"} index={6} />
        <MetricCard label="High Conviction" value={String(theses.filter((thesis) => thesis.convictionLevel === "High").length)} index={7} />
      </div>
      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="panel bg-white/95"
      >
        <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="section-title text-base font-extrabold text-navy"><HelpLabel label="Needs Attention" /></h3>
          <span className="text-xs font-black text-slate-500">{missingKeyInfo} tesis kurang info kunci</span>
        </div>
        {needsAttention.length === 0 ? (
          <div className="empty-state py-8">Tidak ada tesis yang butuh perhatian sekarang.</div>
        ) : (
          <div className="grid gap-2.5 md:grid-cols-2">
            {needsAttention.slice(0, 6).map((thesis) => (
              <button
                key={thesis.id}
                className="rounded-2xl border border-amber-200/60 dark:border-amber-500/20 bg-gradient-to-br from-amber-50/60 to-amber-50/30 dark:from-amber-950/20 dark:to-amber-950/5 p-4 text-left hover:shadow-md hover:border-amber-300 dark:hover:border-amber-500/30 transition-all duration-200 focus:outline-none flex flex-col justify-between relative overflow-hidden group"
                type="button"
                onClick={() => onView(thesis)}
              >
                <div className="absolute inset-y-0 left-0 w-1 bg-amber-500" />
                <strong className="text-navy dark:text-slate-200 text-sm font-black group-hover:text-teal dark:group-hover:text-teal transition-colors duration-200 pl-1">{thesis.ticker || "-"} · {thesis.companyName || "Tanpa nama"}</strong>
                <p className="mt-1.5 text-xs text-amber-800 dark:text-amber-400 font-bold leading-normal pl-1">
                  {thesis.nextReviewDate ? `📅 Review: ${thesis.nextReviewDate}` : "⚠️ Belum ada jadwal review"} · {thesis.syariahStatus}
                </p>
              </button>
            ))}
          </div>
        )}
      </motion.div>
    </section>
  );
}

function ThesisList({
  theses,
  filters,
  onFilterChange,
  onView,
  onEdit,
  onDelete,
}: {
  theses: InvestmentThesis[];
  filters: { status: string; role: string; type: string; conviction: string; search: string };
  onFilterChange: (filters: { status: string; role: string; type: string; conviction: string; search: string }) => void;
  onView: (thesis: InvestmentThesis) => void;
  onEdit: (thesis: InvestmentThesis) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="panel bg-white/95">
      <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end border-b border-slate-100 pb-4">
        <h3 className="section-title text-base font-extrabold text-navy"><HelpLabel label="Daftar Tesis" /></h3>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5 w-full lg:max-w-4xl">
          <SelectFilter label="Status" value={filters.status} options={["All", ...thesisStatuses]} onChange={(status) => onFilterChange({ ...filters, status })} />
          <SelectFilter label="Role" value={filters.role} options={["All", ...portfolioRoles]} onChange={(role) => onFilterChange({ ...filters, role })} />
          <SelectFilter label="Type" value={filters.type} options={["All", ...thesisTypes]} onChange={(type) => onFilterChange({ ...filters, type })} />
          <SelectFilter label="Conviction" value={filters.conviction} options={["All", ...convictionLevels]} onChange={(conviction) => onFilterChange({ ...filters, conviction })} />
          <label className="field">
            <span className="text-xs text-slate-500">Cari ticker/company</span>
            <input value={filters.search} onChange={(event) => onFilterChange({ ...filters, search: event.target.value })} placeholder="Ticker..." />
          </label>
        </div>
      </div>
      {theses.length === 0 ? (
        <div className="empty-state">Belum ada tesis saham. Klik Buat Tesis untuk mulai.</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-slate-50/20">
          <table className="data-table">
            <thead>
              <tr>
                <th className="px-4 font-bold text-xs"><HelpLabel label="Ticker" /></th>
                <th className="font-bold text-xs"><HelpLabel label="Company" /></th>
                <th className="font-bold text-xs"><HelpLabel label="Status" /></th>
                <th className="font-bold text-xs"><HelpLabel label="Role" /></th>
                <th className="font-bold text-xs"><HelpLabel label="Type" /></th>
                <th className="font-bold text-xs"><HelpLabel label="Conviction" /></th>
                <th className="font-bold text-xs"><HelpLabel label="Harga (P/L)" /></th>
                <th className="font-bold text-xs"><HelpLabel label="Last Review" /></th>
                <th className="font-bold text-xs"><HelpLabel label="Next Review" /></th>
                <th className="font-bold text-xs"><HelpLabel label="Decision" /></th>
                <th className="font-bold text-xs"><HelpLabel label="Updated" /></th>
                <th className="min-w-32 font-bold text-xs">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {theses.map((thesis) => (
                <tr key={thesis.id} className="hover:bg-teal/[0.02]">
                  <td className="px-4 font-extrabold text-navy">{thesis.ticker}</td>
                  <td className="font-semibold text-slate-700">{thesis.companyName}</td>
                  <td><Badge value={thesis.status} /></td>
                  <td className="text-slate-600 font-semibold">{thesis.portfolioRole}</td>
                  <td className="text-slate-600 font-semibold">{thesis.thesisType}</td>
                  <td><Badge value={thesis.convictionLevel} /></td>
                  <td>
                    {thesis.currentPrice > 0 ? (
                      <div className="font-semibold text-xs leading-normal">
                        <div className="text-navy font-extrabold">{formatIDR(thesis.currentPrice)}</div>
                        {thesis.firstBuyPrice > 0 && (
                          <div className={`text-[10px] font-black ${
                            thesis.currentPrice >= thesis.firstBuyPrice 
                              ? "text-emerald-600 dark:text-emerald-400" 
                              : "text-rose-600 dark:text-rose-400"
                          }`}>
                            {thesis.currentPrice >= thesis.firstBuyPrice ? "▲ +" : "▼ "}
                            {(((thesis.currentPrice - thesis.firstBuyPrice) / thesis.firstBuyPrice) * 100).toFixed(1)}%
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="text-slate-600 font-semibold">{thesis.lastReviewDate || "-"}</td>
                  <td className="text-slate-600 font-semibold">{thesis.nextReviewDate || "-"}</td>
                  <td>
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider border ${
                      thesis.currentDecision === "Add" ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-800/30" :
                      thesis.currentDecision === "Sell" || thesis.currentDecision === "Reduce" ? "bg-rose-100 dark:bg-rose-950/40 text-rose-800 dark:text-rose-400 border-rose-200/50 dark:border-rose-800/30" :
                      thesis.currentDecision === "Hold" || thesis.currentDecision === "Watchlist" ? "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400 border-amber-200/50 dark:border-amber-800/30" :
                      "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200/60 dark:border-slate-700/50"
                    }`}>
                      {thesis.currentDecision}
                    </span>
                  </td>
                  <td className="text-slate-500 font-semibold">{thesis.updatedAt.slice(0, 10)}</td>
                  <td className="py-2">
                    <div className="flex gap-1.5">
                      <button className="secondary-button min-h-8 px-2.5 rounded-lg text-xs font-bold" type="button" onClick={() => onView(thesis)}>Open</button>
                      <button className="secondary-button min-h-8 px-2.5 rounded-lg text-xs font-bold" type="button" onClick={() => onEdit(thesis)}>Edit</button>
                      <button className="danger-button min-h-8 px-2.5 rounded-lg text-xs font-bold" type="button" onClick={() => onDelete(thesis.id)}>Hapus</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ThesisForm({
  draft,
  errors,
  onDraftChange,
  onSave,
  onCancel,
  settings,
}: {
  draft: InvestmentThesis;
  errors: string[];
  onDraftChange: (thesis: InvestmentThesis) => void;
  onSave: () => void;
  onCancel: () => void;
  settings: AppSettings;
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingFund, setIsGeneratingFund] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const entryAmounts = calculateEntryPlanAmounts(draft.plannedCapital, [
    draft.firstEntryPercent,
    draft.secondEntryPercent,
    draft.thirdEntryPercent,
  ]);
  const mos = calculateMarginOfSafety(draft.currentPrice, draft.moderateFairValue);

  const years = ["2023", "2024", "2025", "2026"];
  const metrics = years.map((yr) => {
    const existing = draft.fundamentalMetrics?.find((m) => m.year === yr);
    return existing || { year: yr, revenue: 0, netProfit: 0, eps: 0, roe: 0, der: 0, pe: 0, pbv: 0 };
  });

  const updateMetric = (yr: string, fields: Partial<FundamentalMetric>) => {
    const currentMetrics = draft.fundamentalMetrics || [];
    const exists = currentMetrics.some((m) => m.year === yr);
    let nextMetrics;
    if (exists) {
      nextMetrics = currentMetrics.map((m) => (m.year === yr ? { ...m, ...fields } : m));
    } else {
      nextMetrics = [
        ...currentMetrics,
        { year: yr, revenue: 0, netProfit: 0, eps: 0, roe: 0, der: 0, ...fields } as FundamentalMetric,
      ];
    }
    patch({ fundamentalMetrics: nextMetrics });
  };

  function patch(update: Partial<InvestmentThesis>) {
    onDraftChange({ ...draft, ...update });
  }

  function numberPatch(key: keyof InvestmentThesis, value: string) {
    patch({ [key]: Number(value || 0) } as Partial<InvestmentThesis>);
  }

  async function callDeepseekProxy(prompt: string, sysInst: string): Promise<string> {
    const keys: string[] = [];
    if (settings.deepseekApiKeys && settings.deepseekApiKeys.length > 0) {
      settings.deepseekApiKeys.forEach((k) => {
        if (k && k.trim()) keys.push(k.trim());
      });
    }
    if (settings.deepseekApiKey && settings.deepseekApiKey.trim() && !keys.includes(settings.deepseekApiKey.trim())) {
      keys.push(settings.deepseekApiKey.trim());
    }
    const envKey = (import.meta as any).env?.VITE_DEEPSEEK_API_KEY;
    if (envKey && envKey.trim() && !keys.includes(envKey.trim())) {
      keys.push(envKey.trim());
    }

    if (keys.length === 0) {
      throw new Error("Kunci API DeepSeek belum diatur. Harap isi di menu Pengaturan.");
    }

    console.log("Menghubungi DeepSeek AI via proxy backend...");
    const response = await fetch("/api/ai/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: prompt,
        systemInstruction: sysInst
      })
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson?.error || `HTTP error! status: ${response.status}`);
    }

    const resJson = await response.json();
    const text = resJson?.text;
    if (!text) {
      throw new Error("Respon AI kosong.");
    }
    return text;
  }

  async function handleAiGenerate() {
    if (!draft.ticker.trim()) {
      setAiError("Silakan isi Ticker terlebih dahulu.");
      return;
    }
    
    const hasKeys = (settings.deepseekApiKeys && settings.deepseekApiKeys.some(k => k.trim())) || settings.deepseekApiKey || (import.meta as any).env?.VITE_DEEPSEEK_API_KEY;
    if (!hasKeys) {
      setAiError("API Key DeepSeek belum diatur. Silakan ke halaman Pengaturan untuk mengaturnya.");
      return;
    }

    setIsGenerating(true);
    setAiError(null);

    try {
      let tickerData = {
        name: draft.companyName || draft.ticker.trim().toUpperCase(),
        price: draft.currentPrice || 0,
        sector: draft.sector || "Lainnya",
        currency: "IDR"
      };

      const activeProvider = settings.stockProvider || "yahoo";
      try {
        if (activeProvider === "twelvedata" && settings.twelveDataApiKey) {
          const res = await fetch(`https://api.twelvedata.com/quote?symbol=${encodeURIComponent(draft.ticker)}&apikey=${encodeURIComponent(settings.twelveDataApiKey)}`);
          if (res.ok) {
            const json = await res.json();
            if (json.name) {
              tickerData.name = json.name;
              tickerData.price = Number(json.close || json.price || 0);
              tickerData.currency = json.currency || "USD";
            }
          }
        } else {
          const res = await fetch(`/api/yahoo/quote?symbol=${encodeURIComponent(draft.ticker.trim())}`);
          if (res.ok) {
            const json = await res.json();
            if (json.success) {
              tickerData.name = json.name || tickerData.name;
              tickerData.price = json.price || tickerData.price;
              tickerData.sector = json.sector || tickerData.sector;
              tickerData.currency = json.currency || "IDR";
            }
          }
        }
      } catch (err) {
        console.warn("Gagal fetch data quote:", err);
      }

      const promptText = `
Saya ingin membuat analisis tesis investasi untuk saham dengan rincian berikut:
- Ticker: ${draft.ticker.trim().toUpperCase()}
- Nama Perusahaan: ${tickerData.name}
- Sektor: ${tickerData.sector}
- Harga Saat Ini: ${tickerData.currency} ${tickerData.price}

Buatlah tesis investasi yang mendalam, rasional, dan realistis dalam bahasa Indonesia dengan format JSON. Nilai wajar (fair value) dan rencana harga beli harus logis dan konsisten dengan harga saat ini (${tickerData.price}).
Sertakan juga data fundamental historis riil untuk 3 tahun terakhir (2023, 2024, 2025) dan perkiraan/tren tahun berjalan (2026).

Format JSON yang dihasilkan harus memiliki kunci-kunci berikut dengan tipe data yang tepat:
{
  "syariahStatus": "DES" | "Non-DES" | "Need Recheck" | "Not Checked",
  "portfolioRole": "Core" | "Stabilizer" | "Satellite" | "Watchlist Only",
  "thesisType": "Dividend" | "Defensive" | "Growth" | "Cyclical" | "Turnaround" | "Value" | "Other",
  "investmentHorizon": "1 Year" | "3 Years" | "5 Years" | "10 Years",
  "convictionLevel": "Low" | "Medium" | "High",
  "summary": "Ringkasan tesis 1 paragraf kenapa saham ini layak diinvestasikan",
  "businessQualityNotes": "Analisis kualitas bisnis, parit ekonomi (moat), brand, dan kompetensi manajemen",
  "financialStrengthNotes": "Analisis neraca keuangan, tingkat utang, arus kas, margin keuntungan, dan profitabilitas",
  "valuationNotes": "Catatan mengenai asumsi valuasi, kenapa harga saat ini murah/mahal/wajar",
  "portfolioFitNotes": "Kenapa saham ini cocok dimasukkan ke portofolio",
  "conservativeFairValue": estimasi harga wajar konservatif (angka saja),
  "moderateFairValue": estimasi harga wajar moderat (angka saja),
  "requiredMarginOfSafety": persentase diskon margin of safety yang diinginkan (angka saja, misal 20 untuk 20%),
  "firstBuyPrice": harga rencana pembelian pertama (angka saja),
  "addPrice": harga rencana tambah muatan (angka saja),
  "strongBuyPrice": harga rencana strong buy (angka saja),
  "doNotBuyAbovePrice": batas harga atas jangan beli (angka saja),
  "maxAllocation": batas persentase maksimal alokasi dalam portofolio (angka saja, misal 10 untuk 10%),
  "plannedCapital": modal awal rencana investasi (angka saja, misal 10000000),
  "firstEntryPercent": persentase entry pertama (angka saja, misal 20 untuk 20%),
  "secondEntryPercent": persentase entry kedua (angka saja, misal 30 untuk 30%),
  "thirdEntryPercent": persentase entry ketiga (angka saja, misal 50 untuk 50%),
  "entryNotes": "Catatan strategi masuk/pembelian bertahap",
  "risks": [
    {
      "name": "nama risiko",
      "impact": "Low" | "Medium" | "High",
      "probability": "Low" | "Medium" | "High",
      "mitigation": "mitigasi risiko tersebut"
    }
  ],
  "thesisWrongCriteria": "Kriteria kuantitatif/kualitatif yang menandakan tesis investasi ini sudah salah (misal: pertumbuhan laba negatif berturut-turut, dll)",
  "stopAveragingDownCriteria": "Kapan harus berhenti melakukan average down",
  "reviewSellReduceCriteria": "Kapan harus melakukan review besar, menjual, atau mengurangi posisi",
  "fundamentalMetrics": [
    {
      "year": "2023",
      "revenue": 12500000000000, // Pendapatan penuh dalam Rupiah (angka saja)
      "netProfit": 1800000000000, // Laba bersih penuh dalam Rupiah (angka saja)
      "eps": 150, // EPS penuh (angka)
      "roe": 15.5, // ROE dalam persen (angka, misal 15.5 untuk 15.5%)
      "der": 0.85, // Rasio DER (angka)
      "pe": 12.4, // Rasio PE (angka)
      "pbv": 1.8 // Rasio PBV (angka)
    },
    {
      "year": "2024",
      "revenue": 13800000000000,
      "netProfit": 2100000000000,
      "eps": 175,
      "roe": 16.8,
      "der": 0.80,
      "pe": 11.8,
      "pbv": 1.95
    },
    {
      "year": "2025",
      "revenue": 15000000000000,
      "netProfit": 2400000000000,
      "eps": 200,
      "roe": 17.5,
      "der": 0.75,
      "pe": 10.5,
      "pbv": 2.1
    },
    {
      "year": "2026", // Estimasi tahun berjalan
      "revenue": 16200000000000,
      "netProfit": 2700000000000,
      "eps": 225,
      "roe": 18.2,
      "der": 0.70,
      "pe": 9.8,
      "pbv": 2.2
    }
  ]
}
`;

      const systemInstruction = `
Anda adalah seorang analis investasi senior dan penasihat keuangan profesional yang ahli dalam menganalisis pasar saham global dan Indonesia.
Tugas Anda adalah menghasilkan tesis investasi saham yang logis, mendalam, dan realistis berdasarkan ticker, nama, dan sektor yang diberikan.
Gunakan bahasa Indonesia yang profesional, jelas, mudah dipahami, namun tetap teknis secara finansial.
Pastikan semua perhitungan harga (fair value, entry price, dll.) logis dan proporsional dengan harga saham saat ini yang diberikan.
Format keluaran HARUS berupa objek JSON mentah yang valid sesuai skema yang diminta, tanpa markdown, tanpa blok kode \`\`\`json.
`;

      const textResponse = await callDeepseekProxy(promptText, systemInstruction);
      const aiThesis = JSON.parse(textResponse);

      onDraftChange({
        ...draft,
        companyName: tickerData.name,
        sector: tickerData.sector,
        currentPrice: tickerData.price,
        syariahStatus: aiThesis.syariahStatus || "Not Checked",
        portfolioRole: aiThesis.portfolioRole || "Core",
        thesisType: aiThesis.thesisType || "Other",
        investmentHorizon: aiThesis.investmentHorizon || "3 Years",
        convictionLevel: aiThesis.convictionLevel || "Medium",
        summary: aiThesis.summary || "",
        businessQualityNotes: aiThesis.businessQualityNotes || "",
        financialStrengthNotes: aiThesis.financialStrengthNotes || "",
        valuationNotes: aiThesis.valuationNotes || "",
        portfolioFitNotes: aiThesis.portfolioFitNotes || "",
        conservativeFairValue: aiThesis.conservativeFairValue || 0,
        moderateFairValue: aiThesis.moderateFairValue || 0,
        requiredMarginOfSafety: aiThesis.requiredMarginOfSafety || 0,
        firstBuyPrice: aiThesis.firstBuyPrice || 0,
        addPrice: aiThesis.addPrice || 0,
        strongBuyPrice: aiThesis.strongBuyPrice || 0,
        doNotBuyAbovePrice: aiThesis.doNotBuyAbovePrice || 0,
        maxAllocation: aiThesis.maxAllocation || 0,
        plannedCapital: aiThesis.plannedCapital || 0,
        firstEntryPercent: aiThesis.firstEntryPercent || 0,
        secondEntryPercent: aiThesis.secondEntryPercent || 0,
        thirdEntryPercent: aiThesis.thirdEntryPercent || 0,
        entryNotes: aiThesis.entryNotes || "",
        risks: Array.isArray(aiThesis.risks)
          ? aiThesis.risks.map((r: any) => ({
              id: createId(),
              name: r.name || "",
              impact: r.impact || "Medium",
              probability: r.probability || "Medium",
              mitigation: r.mitigation || "",
            }))
          : [],
        thesisWrongCriteria: aiThesis.thesisWrongCriteria || "",
        stopAveragingDownCriteria: aiThesis.stopAveragingDownCriteria || "",
        reviewSellReduceCriteria: aiThesis.reviewSellReduceCriteria || "",
        fundamentalMetrics: Array.isArray(aiThesis.fundamentalMetrics)
          ? aiThesis.fundamentalMetrics.map((m: any) => ({
              year: String(m.year || ""),
              revenue: Number(m.revenue || 0),
              netProfit: Number(m.netProfit || 0),
              eps: Number(m.eps || 0),
              roe: Number(m.roe || 0),
              der: Number(m.der || 0),
              pe: m.pe !== undefined ? Number(m.pe) : undefined,
              pbv: m.pbv !== undefined ? Number(m.pbv) : undefined,
            }))
          : [],
      });
    } catch (err: any) {
      console.error("Gagal men-generate tesis:", err);
      setAiError(err.message || "Gagal menghasilkan tesis. Silakan periksa koneksi internet atau API Key Anda.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleAiGenerateFundamentals() {
    if (!draft.ticker.trim()) {
      setAiError("Silakan isi Ticker terlebih dahulu.");
      return;
    }
    
    const hasKeys = (settings.deepseekApiKeys && settings.deepseekApiKeys.some(k => k.trim())) || settings.deepseekApiKey || (import.meta as any).env?.VITE_DEEPSEEK_API_KEY;
    if (!hasKeys) {
      setAiError("API Key DeepSeek belum diatur. Silakan ke halaman Pengaturan untuk mengaturnya.");
      return;
    }

    setIsGeneratingFund(true);
    setAiError(null);

    try {
      let tickerData = {
        name: draft.companyName || draft.ticker.trim().toUpperCase(),
        price: draft.currentPrice || 0,
        sector: draft.sector || "Lainnya",
        currency: "IDR"
      };

      const activeProvider = settings.stockProvider || "yahoo";
      try {
        if (activeProvider === "twelvedata" && settings.twelveDataApiKey) {
          const res = await fetch(`https://api.twelvedata.com/quote?symbol=${encodeURIComponent(draft.ticker)}&apikey=${encodeURIComponent(settings.twelveDataApiKey)}`);
          if (res.ok) {
            const json = await res.json();
            if (json.name) {
              tickerData.name = json.name;
              tickerData.price = Number(json.close || json.price || 0);
              tickerData.currency = json.currency || "USD";
            }
          }
        } else {
          const res = await fetch(`/api/yahoo/quote?symbol=${encodeURIComponent(draft.ticker.trim())}`);
          if (res.ok) {
            const json = await res.json();
            if (json.success) {
              tickerData.name = json.name || tickerData.name;
              tickerData.price = json.price || tickerData.price;
              tickerData.sector = json.sector || tickerData.sector;
              tickerData.currency = json.currency || "IDR";
            }
          }
        }
      } catch (err) {
        console.warn("Gagal fetch data quote:", err);
      }

      const promptText = `
Saya ingin menganalisis fundamental perusahaan untuk saham dengan rincian berikut:
- Ticker: ${draft.ticker.trim().toUpperCase()}
- Nama Perusahaan: ${tickerData.name}
- Sektor: ${tickerData.sector}
- Harga Saat Ini: ${tickerData.currency} ${tickerData.price}

Buatlah analisis profil fundamental kualitatif dan tren kuantitatif yang mendalam, rasional, dan realistis dalam bahasa Indonesia dengan format JSON.
Analisis ini hanya mencakup deskripsi bisnis, keuangan, risiko, serta tren 3 tahun terakhir (2023, 2024, 2025) dan tahun berjalan (2026).
TIDAK BOLEH mengubah nominal harga target beli dan penataan modal.

Format JSON yang dihasilkan harus memiliki kunci-kunci berikut dengan tipe data yang tepat:
{
  "syariahStatus": "DES" | "Non-DES" | "Need Recheck" | "Not Checked",
  "summary": "Ringkasan tesis 1 paragraf kenapa saham ini layak diinvestasikan",
  "businessQualityNotes": "Analisis kualitas bisnis, parit ekonomi (moat), brand, dan kompetensi manajemen",
  "financialStrengthNotes": "Analisis neraca keuangan, tingkat utang, arus kas, margin keuntungan, dan profitabilitas",
  "valuationNotes": "Catatan mengenai asumsi valuasi, kenapa harga saat ini murah/mahal/wajar",
  "portfolioFitNotes": "Kenapa saham ini cocok dimasukkan ke portofolio",
  "risks": [
    {
      "name": "nama risiko",
      "impact": "Low" | "Medium" | "High",
      "probability": "Low" | "Medium" | "High",
      "mitigation": "mitigasi risiko tersebut"
    }
  ],
  "thesisWrongCriteria": "Kriteria kuantitatif/kualitatif yang menandakan tesis investasi ini sudah salah (misal: pertumbuhan laba negatif berturut-turut, dll)",
  "stopAveragingDownCriteria": "Kapan harus berhenti melakukan average down",
  "reviewSellReduceCriteria": "Kapan harus melakukan review besar, menjual, atau mengurangi posisi",
  "fundamentalMetrics": [
    {
      "year": "2023",
      "revenue": 12500000000000, // Pendapatan penuh dalam Rupiah (angka saja)
      "netProfit": 1800000000000, // Laba bersih penuh dalam Rupiah (angka saja)
      "eps": 150,
      "roe": 15.5, // dalam persen (angka, misal 15.5)
      "der": 0.85, // rasio (angka)
      "pe": 12.4,
      "pbv": 1.8
    },
    {
      "year": "2024",
      "revenue": 13800000000000,
      "netProfit": 2100000000000,
      "eps": 175,
      "roe": 16.8,
      "der": 0.80,
      "pe": 11.8,
      "pbv": 1.95
    },
    {
      "year": "2025",
      "revenue": 15000000000000,
      "netProfit": 2400000000000,
      "eps": 200,
      "roe": 17.5,
      "der": 0.75,
      "pe": 10.5,
      "pbv": 2.1
    },
    {
      "year": "2026",
      "revenue": 16200000000000,
      "netProfit": 2700000000000,
      "eps": 225,
      "roe": 18.2,
      "der": 0.70,
      "pe": 9.8,
      "pbv": 2.2
    }
  ]
}
`;

      const systemInstruction = `
Anda adalah seorang analis investasi senior dan penasihat keuangan profesional yang ahli dalam menganalisis pasar saham global dan Indonesia.
Tugas Anda adalah menghasilkan analisis fundamental saham kualitatif dan tren kuantitatif yang logis dan realistis berdasarkan ticker, nama, dan sektor yang diberikan.
Gunakan bahasa Indonesia yang profesional, jelas, mudah dipahami.
Format keluaran HARUS berupa objek JSON mentah yang valid sesuai skema yang diminta, tanpa markdown, tanpa blok kode \`\`\`json.
`;

      const textResponse = await callDeepseekProxy(promptText, systemInstruction);
      const aiThesis = JSON.parse(textResponse);

      onDraftChange({
        ...draft,
        companyName: tickerData.name,
        sector: tickerData.sector,
        currentPrice: tickerData.price,
        syariahStatus: aiThesis.syariahStatus || draft.syariahStatus || "Not Checked",
        summary: aiThesis.summary || draft.summary || "",
        businessQualityNotes: aiThesis.businessQualityNotes || draft.businessQualityNotes || "",
        financialStrengthNotes: aiThesis.financialStrengthNotes || draft.financialStrengthNotes || "",
        valuationNotes: aiThesis.valuationNotes || draft.valuationNotes || "",
        portfolioFitNotes: aiThesis.portfolioFitNotes || draft.portfolioFitNotes || "",
        risks: Array.isArray(aiThesis.risks) && aiThesis.risks.length > 0
          ? aiThesis.risks.map((r: any) => ({
              id: createId(),
              name: r.name || "",
              impact: r.impact || "Medium",
              probability: r.probability || "Medium",
              mitigation: r.mitigation || "",
            }))
          : draft.risks,
        thesisWrongCriteria: aiThesis.thesisWrongCriteria || draft.thesisWrongCriteria || "",
        stopAveragingDownCriteria: aiThesis.stopAveragingDownCriteria || draft.stopAveragingDownCriteria || "",
        reviewSellReduceCriteria: aiThesis.reviewSellReduceCriteria || draft.reviewSellReduceCriteria || "",
        fundamentalMetrics: Array.isArray(aiThesis.fundamentalMetrics)
          ? aiThesis.fundamentalMetrics.map((m: any) => ({
              year: String(m.year || ""),
              revenue: Number(m.revenue || 0),
              netProfit: Number(m.netProfit || 0),
              eps: Number(m.eps || 0),
              roe: Number(m.roe || 0),
              der: Number(m.der || 0),
              pe: m.pe !== undefined ? Number(m.pe) : undefined,
              pbv: m.pbv !== undefined ? Number(m.pbv) : undefined,
            }))
          : draft.fundamentalMetrics,
      });
    } catch (err: any) {
      console.error("Gagal men-generate fundamental:", err);
      setAiError(err.message || "Gagal menghasilkan fundamental. Silakan periksa koneksi internet atau API Key Anda.");
    } finally {
      setIsGeneratingFund(false);
    }
  }

  return (
    <section className="grid gap-5">
      <AnimatePresence>
        {(errors.length || aiError) && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-xl border border-rose-200 dark:border-rose-900/30 bg-rose-50 dark:bg-rose-950/20 p-4 text-xs font-bold text-rose-800 dark:text-rose-400 overflow-hidden flex flex-col gap-1"
          >
            {aiError && <p>• {aiError}</p>}
            {errors.map((error) => <p key={error}>• {error}</p>)}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="panel grid gap-4 bg-white/95">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <h3 className="section-title text-base font-extrabold text-navy">Buat / Edit Tesis</h3>
          <div className="flex gap-2">
            <button className="secondary-button min-h-9 px-3.5 rounded-xl font-bold" type="button" onClick={onCancel}>Batal</button>
            <button className="primary-button min-h-9 px-3.5 rounded-xl font-bold" type="button" onClick={onSave} disabled={isGenerating}>Simpan Tesis</button>
          </div>
        </div>
        
        <FormSection title="Basic Information">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <TextField label="Ticker" value={draft.ticker} onChange={(ticker) => patch({ ticker })} required />
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                disabled={isGenerating || isGeneratingFund || !draft.ticker}
                onClick={handleAiGenerate}
                title="Menghasilkan seluruh tesis investasi termasuk rekomendasi harga beli dan alokasi dana"
                className="primary-button min-h-11 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:from-slate-300 disabled:to-slate-400 disabled:cursor-not-allowed text-xs"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Menganalisis...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>Buat Tesis AI</span>
                  </>
                )}
              </button>
              <button
                type="button"
                disabled={isGenerating || isGeneratingFund || !draft.ticker}
                onClick={handleAiGenerateFundamentals}
                title="Hanya menghasilkan analisis bisnis kualitatif, profil risiko, dan data keuangan tahunan tanpa menimpa target harga rencana beli Anda"
                className="secondary-button min-h-11 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed text-xs dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
              >
                {isGeneratingFund ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-teal" />
                    <span>Menganalisis...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 text-teal" />
                    <span>Generate Fundamental AI</span>
                  </>
                )}
              </button>
            </div>
          </div>
          <TextField label="Company Name" value={draft.companyName} onChange={(companyName) => patch({ companyName })} required />
          <TextField label="Sector" value={draft.sector} onChange={(sector) => patch({ sector })} />
          <SelectField label="Syariah Status" value={draft.syariahStatus} options={syariahStatuses} onChange={(syariahStatus) => patch({ syariahStatus: syariahStatus as SyariahStatus })} />
          <SelectField label="Status" value={draft.status} options={thesisStatuses} onChange={(status) => patch({ status: status as ThesisStatus })} />
          <SelectField label="Portfolio Role" value={draft.portfolioRole} options={portfolioRoles} onChange={(portfolioRole) => patch({ portfolioRole: portfolioRole as PortfolioRole })} />
          <SelectField label="Thesis Type" value={draft.thesisType} options={thesisTypes} onChange={(thesisType) => patch({ thesisType: thesisType as ThesisType })} />
          <SelectField label="Investment Horizon" value={draft.investmentHorizon} options={investmentHorizons} onChange={(investmentHorizon) => patch({ investmentHorizon: investmentHorizon as InvestmentThesis["investmentHorizon"] })} />
          <SelectField label="Conviction Level" value={draft.convictionLevel} options={convictionLevels} onChange={(convictionLevel) => patch({ convictionLevel: convictionLevel as ConvictionLevel })} />
        </FormSection>

        <FormSection title="Ringkasan Tesis">
          <TextArea label="One paragraph summary" value={draft.summary} onChange={(summary) => patch({ summary })} wide />
          <TextArea label="Kualitas Bisnis" value={draft.businessQualityNotes} onChange={(businessQualityNotes) => patch({ businessQualityNotes })} />
          <TextArea label="Financial Strength" value={draft.financialStrengthNotes} onChange={(financialStrengthNotes) => patch({ financialStrengthNotes })} />
          <TextArea label="Valuation Notes" value={draft.valuationNotes} onChange={(valuationNotes) => patch({ valuationNotes })} />
          <TextArea label="Portfolio Fit" value={draft.portfolioFitNotes} onChange={(portfolioFitNotes) => patch({ portfolioFitNotes })} />
        </FormSection>

        <FormSection title="Valuasi & Area Beli">
          <NumberField label="Current Price" value={draft.currentPrice} onChange={(value) => numberPatch("currentPrice", value)} currency />
          <NumberField label="Conservative Fair Value" value={draft.conservativeFairValue} onChange={(value) => numberPatch("conservativeFairValue", value)} currency />
          <NumberField label="Moderate Fair Value" value={draft.moderateFairValue} onChange={(value) => numberPatch("moderateFairValue", value)} currency />
          <NumberField label="Required Margin of Safety %" value={draft.requiredMarginOfSafety} onChange={(value) => numberPatch("requiredMarginOfSafety", value)} />
          <NumberField label="First Buy Price" value={draft.firstBuyPrice} onChange={(value) => numberPatch("firstBuyPrice", value)} currency />
          <NumberField label="Add Price" value={draft.addPrice} onChange={(value) => numberPatch("addPrice", value)} currency />
          <NumberField label="Strong Buy Price" value={draft.strongBuyPrice} onChange={(value) => numberPatch("strongBuyPrice", value)} currency />
          <NumberField label="Do Not Buy Above" value={draft.doNotBuyAbovePrice} onChange={(value) => numberPatch("doNotBuyAbovePrice", value)} currency />
          <NumberField label="Max Allocation %" value={draft.maxAllocation} onChange={(value) => numberPatch("maxAllocation", value)} />
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 text-xs text-slate-600 font-bold self-end min-h-11 flex items-center justify-between">
            <span><HelpLabel label="Margin of Safety" /></span>
            <span className="text-teal font-black text-sm">{mos === null ? "Not available" : `${mos.toFixed(1)}%`}</span>
          </div>
        </FormSection>

        <FormSection title="Rencana Entry">
          <NumberField label="Planned Capital" value={draft.plannedCapital} onChange={(value) => numberPatch("plannedCapital", value)} currency />
          <NumberField label="First Entry %" value={draft.firstEntryPercent} onChange={(value) => numberPatch("firstEntryPercent", value)} helper={formatIDR(entryAmounts[0])} />
          <NumberField label="Second Entry %" value={draft.secondEntryPercent} onChange={(value) => numberPatch("secondEntryPercent", value)} helper={formatIDR(entryAmounts[1])} />
          <NumberField label="Third Entry %" value={draft.thirdEntryPercent} onChange={(value) => numberPatch("thirdEntryPercent", value)} helper={formatIDR(entryAmounts[2])} />
          <TextArea label="Entry Notes" value={draft.entryNotes} onChange={(entryNotes) => patch({ entryNotes })} wide />
        </FormSection>

        <RiskEditor thesis={draft} onChange={onDraftChange} />

        <FormSection title="Kriteria Tesis Salah">
          <TextArea label="Apa yang membuat tesis salah?" value={draft.thesisWrongCriteria} onChange={(thesisWrongCriteria) => patch({ thesisWrongCriteria })} />
          <TextArea label="Kapan stop averaging down?" value={draft.stopAveragingDownCriteria} onChange={(stopAveragingDownCriteria) => patch({ stopAveragingDownCriteria })} />
          <TextArea label="Kapan review/sell/reduce?" value={draft.reviewSellReduceCriteria} onChange={(reviewSellReduceCriteria) => patch({ reviewSellReduceCriteria })} />
        </FormSection>

        <FormSection title="Jadwal Review & Keputusan">
          <TextField label="Last Review Date" type="date" value={draft.lastReviewDate} onChange={(lastReviewDate) => patch({ lastReviewDate })} />
          <TextField label="Next Review Date" type="date" value={draft.nextReviewDate} onChange={(nextReviewDate) => patch({ nextReviewDate })} />
          <SelectField label="Review Frequency" value={draft.reviewFrequency} options={reviewFrequencies} onChange={(reviewFrequency) => patch({ reviewFrequency: reviewFrequency as InvestmentThesis["reviewFrequency"] })} />
          <SelectField label="Current Decision" value={draft.currentDecision} options={currentDecisions} onChange={(currentDecision) => patch({ currentDecision: currentDecision as CurrentDecision })} />
          <TextArea label="Review Notes" value={draft.reviewNotes} onChange={(reviewNotes) => patch({ reviewNotes })} />
          <TextArea label="Decision Reason" value={draft.decisionReason} onChange={(decisionReason) => patch({ decisionReason })} />
        </FormSection>

        <div className="col-span-full border-t border-slate-100 dark:border-white/5 pt-5 mt-3">
          <h3 className="section-title text-base font-extrabold text-navy mb-3">Tren Fundamental Tahunan</h3>
          <div className="overflow-x-auto rounded-3xl border border-slate-100 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-900/30 p-3 shadow-inner backdrop-blur-md">
            <table className="w-full text-xs text-left border-collapse min-w-max">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="py-3 px-4 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Tahun</th>
                  <th className="py-3 px-4 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Pendapatan (Revenue)</th>
                  <th className="py-3 px-4 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Laba Bersih</th>
                  <th className="py-3 px-4 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">EPS</th>
                  <th className="py-3 px-4 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">ROE (%)</th>
                  <th className="py-3 px-4 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">DER (Rasio)</th>
                  <th className="py-3 px-4 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">PE (Rasio)</th>
                  <th className="py-3 px-4 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">PBV (Rasio)</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((metric) => (
                  <tr key={metric.year} className="border-b border-slate-100/50 dark:border-slate-800/40 last:border-0">
                    <td className="py-3 px-4 font-black text-navy dark:text-slate-200 text-sm">{metric.year}</td>
                    <td className="py-3 px-2">
                      <input
                        type="number"
                        placeholder="e.g. 15 Triliun"
                        className="w-44 min-h-9 text-xs px-3 py-1.5 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-teal dark:focus:border-teal focus:ring-1 focus:ring-teal dark:focus:ring-teal transition duration-200 font-semibold text-navy dark:text-slate-200 shadow-sm"
                        value={metric.revenue || ""}
                        onChange={(e) => updateMetric(metric.year, { revenue: Number(e.target.value) })}
                      />
                    </td>
                    <td className="py-3 px-2">
                      <input
                        type="number"
                        placeholder="e.g. 2 Triliun"
                        className="w-44 min-h-9 text-xs px-3 py-1.5 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-teal dark:focus:border-teal focus:ring-1 focus:ring-teal dark:focus:ring-teal transition duration-200 font-semibold text-navy dark:text-slate-200 shadow-sm"
                        value={metric.netProfit || ""}
                        onChange={(e) => updateMetric(metric.year, { netProfit: Number(e.target.value) })}
                      />
                    </td>
                    <td className="py-3 px-2">
                      <input
                        type="number"
                        placeholder="EPS"
                        className="w-24 min-h-9 text-xs px-3 py-1.5 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-teal dark:focus:border-teal focus:ring-1 focus:ring-teal dark:focus:ring-teal transition duration-200 font-semibold text-navy dark:text-slate-200 shadow-sm"
                        value={metric.eps || ""}
                        onChange={(e) => updateMetric(metric.year, { eps: Number(e.target.value) })}
                      />
                    </td>
                    <td className="py-3 px-2">
                      <input
                        type="number"
                        placeholder="ROE"
                        className="w-24 min-h-9 text-xs px-3 py-1.5 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-teal dark:focus:border-teal focus:ring-1 focus:ring-teal dark:focus:ring-teal transition duration-200 font-semibold text-navy dark:text-slate-200 shadow-sm"
                        value={metric.roe || ""}
                        onChange={(e) => updateMetric(metric.year, { roe: Number(e.target.value) })}
                      />
                    </td>
                    <td className="py-3 px-2">
                      <input
                        type="number"
                        step="0.01"
                        placeholder="DER"
                        className="w-24 min-h-9 text-xs px-3 py-1.5 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-teal dark:focus:border-teal focus:ring-1 focus:ring-teal dark:focus:ring-teal transition duration-200 font-semibold text-navy dark:text-slate-200 shadow-sm"
                        value={metric.der || ""}
                        onChange={(e) => updateMetric(metric.year, { der: Number(e.target.value) })}
                      />
                    </td>
                    <td className="py-3 px-2">
                      <input
                        type="number"
                        step="0.1"
                        placeholder="PE"
                        className="w-24 min-h-9 text-xs px-3 py-1.5 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-teal dark:focus:border-teal focus:ring-1 focus:ring-teal dark:focus:ring-teal transition duration-200 font-semibold text-navy dark:text-slate-200 shadow-sm"
                        value={metric.pe || ""}
                        onChange={(e) => updateMetric(metric.year, { pe: Number(e.target.value) })}
                      />
                    </td>
                    <td className="py-3 px-2">
                      <input
                        type="number"
                        step="0.01"
                        placeholder="PBV"
                        className="w-24 min-h-9 text-xs px-3 py-1.5 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-teal dark:focus:border-teal focus:ring-1 focus:ring-teal dark:focus:ring-teal transition duration-200 font-semibold text-navy dark:text-slate-200 shadow-sm"
                        value={metric.pbv || ""}
                        onChange={(e) => updateMetric(metric.year, { pbv: Number(e.target.value) })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <small className="text-[10px] text-slate-400 font-medium leading-normal mt-1 block">
            💡 Pendapatan dan Laba Bersih diisi dengan nilai penuh dalam Rupiah (e.g. 15000000000000 untuk 15 Triliun) agar grafik divisualisasikan dengan rasio skala yang benar.
          </small>
        </div>
      </div>
    </section>
  );
}

function RiskEditor({ thesis, onChange }: { thesis: InvestmentThesis; onChange: (thesis: InvestmentThesis) => void }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 bg-white/50 dark:bg-slate-900/30 shadow-sm">
      <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
        <h4 className="font-extrabold text-sm text-navy"><HelpLabel label="Risiko Utama" /></h4>
        <button
          className="secondary-button min-h-9 px-3.5 rounded-xl font-bold"
          type="button"
          onClick={() =>
            onChange({
              ...thesis,
              risks: [...thesis.risks, { id: createId(), name: "", impact: "Medium", probability: "Medium", mitigation: "" }],
            })
          }
        >
          Tambah Risiko
        </button>
      </div>
      <div className="grid gap-2.5">
        <AnimatePresence mode="popLayout">
          {thesis.risks.length === 0 ? <div className="empty-state">Belum ada risiko utama.</div> : null}
          {thesis.risks.map((risk) => (
            <motion.div 
              key={risk.id} 
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="grid gap-2 rounded-xl bg-slate-50/70 p-3.5 border border-slate-100 md:grid-cols-[1.5fr_1fr_1fr_2fr] items-center"
            >
              <input
                className="bg-white min-h-10"
                title={helpText["Risk name"]}
                placeholder="Risk name"
                value={risk.name}
                onChange={(event) => onChange({ ...thesis, risks: thesis.risks.map((item) => item.id === risk.id ? { ...item, name: event.target.value } : item) })}
              />
              <select className="bg-white min-h-10" title={helpText.Impact} value={risk.impact} onChange={(event) => onChange({ ...thesis, risks: thesis.risks.map((item) => item.id === risk.id ? { ...item, impact: event.target.value as typeof risk.impact } : item) })}>
                {lowMediumHigh.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
              <select className="bg-white min-h-10" title={helpText.Probability} value={risk.probability} onChange={(event) => onChange({ ...thesis, risks: thesis.risks.map((item) => item.id === risk.id ? { ...item, probability: event.target.value as typeof risk.probability } : item) })}>
                {lowMediumHigh.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
              <div className="flex gap-2">
                <input
                  className="bg-white min-h-10"
                  title={helpText.Mitigation}
                  placeholder="Mitigation"
                  value={risk.mitigation}
                  onChange={(event) => onChange({ ...thesis, risks: thesis.risks.map((item) => item.id === risk.id ? { ...item, mitigation: event.target.value } : item) })}
                />
                <button className="danger-button min-h-10 px-3 rounded-xl font-bold" type="button" onClick={() => onChange({ ...thesis, risks: thesis.risks.filter((item) => item.id !== risk.id) })}>Hapus</button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

type ThesisDetailProps = {
  assets: Asset[];
  thesis: InvestmentThesis;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onUpdate: (thesis: InvestmentThesis) => void;
};

function ThesisDetail({
  assets,
  thesis,
  onBack,
  onEdit,
  onDelete,
  onUpdate,
}: ThesisDetailProps) {
  const checklist = calculateChecklistCompletion(thesis);
  const mos = calculateMarginOfSafety(thesis.currentPrice, thesis.moderateFairValue);
  const linkedAssetValue = assets.reduce((sum, asset) => sum + asset.value, 0);

  const priceChange = thesis.currentPrice && thesis.firstBuyPrice ? thesis.currentPrice - thesis.firstBuyPrice : 0;
  const priceChangePercent = thesis.firstBuyPrice ? (priceChange / thesis.firstBuyPrice) * 100 : 0;
  
  const currentPriceDisplay = (
    <span className="flex items-center gap-1.5 flex-wrap">
      <span>{formatIDR(thesis.currentPrice)}</span>
      {thesis.currentPrice > 0 && thesis.firstBuyPrice > 0 && (
        <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-black ${
          priceChange >= 0 
            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400" 
            : "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400"
        }`}>
          {priceChange >= 0 ? "▲" : "▼"} {priceChange >= 0 ? "+" : ""}{priceChangePercent.toFixed(1)}% dari harga awal
        </span>
      )}
    </span>
  );
  const [activeChartTab, setActiveChartTab] = useState<"performance" | "profitability" | "valuation">("performance");

  const chartData = useMemo(() => {
    if (!thesis.fundamentalMetrics || thesis.fundamentalMetrics.length === 0) return [];
    return [...thesis.fundamentalMetrics]
      .sort((a, b) => a.year.localeCompare(b.year))
      .map((m) => ({
        ...m,
        revenueBillions: Math.round(m.revenue / 1_000_000_000 * 10) / 10,
        netProfitBillions: Math.round(m.netProfit / 1_000_000_000 * 10) / 10,
      }));
  }, [thesis.fundamentalMetrics]);

  const renderChart = () => {
    if (chartData.length === 0) {
      return (
        <div className="empty-state py-8">
          <div>
            <p>Data tren keuangan 3 tahun terakhir belum diisi.</p>
            <p className="text-xs text-slate-400 mt-1 font-medium">Klik tombol "Edit Tesis" di atas, lalu tekan "Generate Fundamental AI" di dalam formulir untuk mengisinya secara otomatis lewat asisten AI.</p>
          </div>
        </div>
      );
    }

    return (
      <div className="mt-4 p-4 rounded-2xl border border-slate-100 dark:border-white/5 bg-slate-50/30 dark:bg-slate-900/30 shadow-inner">
        <div className="h-60 w-full">
          <ResponsiveContainer width="100%" height="100%">
            {activeChartTab === "performance" ? (
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
                <XAxis dataKey="year" tick={{ fontSize: 11, fontWeight: 'bold' }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" unit=" M" />
                <ChartTooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgba(15, 23, 42, 0.95)', 
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '12px',
                    fontSize: '12px'
                  }} 
                  labelStyle={{ color: '#f8fafc', fontWeight: 'bold', marginBottom: '4px' }}
                  itemStyle={{ color: '#cbd5e1' }}
                />
                <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
                <Bar name="Pendapatan (Miliar Rp)" dataKey="revenueBillions" fill="#0f9f9a" radius={[4, 4, 0, 0]} />
                <Bar name="Laba Bersih (Miliar Rp)" dataKey="netProfitBillions" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : activeChartTab === "profitability" ? (
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
                <XAxis dataKey="year" tick={{ fontSize: 11, fontWeight: 'bold' }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <ChartTooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgba(15, 23, 42, 0.95)', 
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '12px',
                    fontSize: '12px'
                  }}
                  labelStyle={{ color: '#f8fafc', fontWeight: 'bold', marginBottom: '4px' }}
                  itemStyle={{ color: '#cbd5e1' }}
                />
                <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
                <Line name="ROE (%)" type="monotone" dataKey="roe" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line name="DER (Rasio)" type="monotone" dataKey="der" stroke="#ef4444" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            ) : (
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
                <XAxis dataKey="year" tick={{ fontSize: 11, fontWeight: 'bold' }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <ChartTooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgba(15, 23, 42, 0.95)', 
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '12px',
                    fontSize: '12px'
                  }}
                  labelStyle={{ color: '#f8fafc', fontWeight: 'bold', marginBottom: '4px' }}
                  itemStyle={{ color: '#cbd5e1' }}
                />
                <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
                <Line name="Rasio PE (x)" type="monotone" dataKey="pe" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line name="Rasio PBV (x)" type="monotone" dataKey="pbv" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  const renderMetricsTable = () => {
    if (chartData.length === 0) return null;
    return (
      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100 dark:border-white/5 bg-slate-50/10">
        <table className="w-full text-xs text-left border-collapse min-w-max">
          <thead>
            <tr className="text-slate-400 font-bold border-b border-slate-100 dark:border-white/5 bg-slate-50/50">
              <th className="py-2 px-3">Tahun</th>
              <th className="py-2 px-3">Pendapatan</th>
              <th className="py-2 px-3">Laba Bersih</th>
              <th className="py-2 px-3">EPS</th>
              <th className="py-2 px-3">ROE</th>
              <th className="py-2 px-3">DER</th>
              <th className="py-2 px-3">PE</th>
              <th className="py-2 px-3">PBV</th>
            </tr>
          </thead>
          <tbody>
            {chartData.map((m) => (
              <tr key={m.year} className="border-b border-slate-100/50 dark:border-white/5 text-slate-700 dark:text-slate-300 font-semibold">
                <td className="py-2 px-3 font-extrabold text-navy">{m.year}</td>
                <td className="py-2 px-3">{m.revenue ? `Rp ${(m.revenue / 1_000_000_000).toFixed(1)} M` : "-"}</td>
                <td className="py-2 px-3">{m.netProfit ? `Rp ${(m.netProfit / 1_000_000_000).toFixed(1)} M` : "-"}</td>
                <td className="py-2 px-3">{m.eps ? `Rp ${m.eps}` : "-"}</td>
                <td className="py-2 px-3">{m.roe ? `${m.roe}%` : "-"}</td>
                <td className="py-2 px-3">{m.der ? `${m.der}x` : "-"}</td>
                <td className="py-2 px-3">{m.pe ? `${m.pe}x` : "-"}</td>
                <td className="py-2 px-3">{m.pbv ? `${m.pbv}x` : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };
  function addReview() {
    const review = {
      id: createId(),
      reviewDate: new Date().toISOString().slice(0, 10),
      whatChanged: "",
      thesisStillValid: "Unclear" as ReviewValidity,
      action: "Review Again" as ReviewAction,
      reason: "",
      emotionCheck: "Calm" as EmotionCheck,
      nextReviewDate: thesis.nextReviewDate,
    };
    onUpdate({ ...thesis, reviews: [review, ...thesis.reviews], lastReviewDate: review.reviewDate, updatedAt: new Date().toISOString() });
  }

  function addDecisionLog() {
    const decision = {
      id: createId(),
      date: new Date().toISOString().slice(0, 10),
      ticker: thesis.ticker,
      decision: thesis.currentDecision,
      amount: 0,
      price: thesis.currentPrice,
      reason: thesis.decisionReason,
      risk: "",
      expectedOutcome: "",
      actualOutcome: "",
      status: "Open" as DecisionStatus,
    };
    onUpdate({ ...thesis, decisions: [decision, ...thesis.decisions], updatedAt: new Date().toISOString() });
  }

  return (
    <section className="grid gap-5">
      <div className="panel flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between bg-white/95">
        <div>
          <button className="mb-2 text-xs font-black text-teal flex items-center hover:translate-x-[-3px] transition duration-200" type="button" onClick={onBack}>← Kembali ke daftar</button>
          <h3 className="text-xl font-black text-navy">{thesis.ticker} · {thesis.companyName}</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge value={thesis.status} />
            <Badge value={thesis.portfolioRole} />
            <Badge value={thesis.convictionLevel} />
            <Badge value={thesis.syariahStatus} />
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button className="secondary-button min-h-9 px-4 rounded-xl font-bold" type="button" onClick={onEdit}>Edit Tesis</button>
          <button className="danger-button min-h-9 px-4 rounded-xl font-bold" type="button" onClick={onDelete}>Hapus</button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr] items-start">
        <div className="grid gap-5">
          <DetailSection title="Ringkasan Tesis" body={thesis.summary} />
          <DetailSection title="Kualitas Bisnis" body={thesis.businessQualityNotes} />
          <DetailSection title="Financial Strength" body={thesis.financialStrengthNotes} />

          <DetailSection title="Tren & Kinerja Keuangan">
            {chartData.length > 0 && (
              <div className="flex flex-wrap gap-1.5 border-b border-slate-100 dark:border-white/5 pb-2 mb-2">
                <button
                  onClick={() => setActiveChartTab("performance")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition duration-200 ${
                    activeChartTab === "performance"
                      ? "bg-teal/15 text-teal border border-teal/20"
                      : "text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 border border-transparent"
                  }`}
                  type="button"
                >
                  <TrendingUp size={14} className="inline mr-1 align-text-bottom" />
                  Pendapatan & Laba
                </button>
                <button
                  onClick={() => setActiveChartTab("profitability")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition duration-200 ${
                    activeChartTab === "profitability"
                      ? "bg-teal/15 text-teal border border-teal/20"
                      : "text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 border border-transparent"
                  }`}
                  type="button"
                >
                  <Percent size={14} className="inline mr-1 align-text-bottom" />
                  Profitabilitas (ROE/DER)
                </button>
                <button
                  onClick={() => setActiveChartTab("valuation")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition duration-200 ${
                    activeChartTab === "valuation"
                      ? "bg-teal/15 text-teal border border-teal/20"
                      : "text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 border border-transparent"
                  }`}
                  type="button"
                >
                  <Activity size={14} className="inline mr-1 align-text-bottom" />
                  Rasio Valuasi (PE/PBV)
                </button>
              </div>
            )}
            {renderChart()}
            {renderMetricsTable()}
          </DetailSection>
          <DetailSection title="Valuasi & Area Beli">
            <InfoGrid items={[
              ["Current Price", currentPriceDisplay],
              ["Conservative Fair Value", formatIDR(thesis.conservativeFairValue)],
              ["Moderate Fair Value", formatIDR(thesis.moderateFairValue)],
              ["Margin of Safety", mos === null ? "Not available" : `${mos.toFixed(1)}%`],
              ["First Buy", formatIDR(thesis.firstBuyPrice)],
              ["Add Price", formatIDR(thesis.addPrice)],
              ["Strong Buy", formatIDR(thesis.strongBuyPrice)],
              ["Do Not Buy Above", formatIDR(thesis.doNotBuyAbovePrice)],
              ["Max Allocation", `${thesis.maxAllocation}%`],
            ]} />
          </DetailSection>
          <DetailSection title="Rencana Entry">
            <InfoGrid items={[
              ["Planned Capital", formatIDR(thesis.plannedCapital)],
              ["First Entry", `${thesis.firstEntryPercent}%`],
              ["Second Entry", `${thesis.secondEntryPercent}%`],
              ["Third Entry", `${thesis.thirdEntryPercent}%`],
            ]} />
            <p className="mt-3 text-sm text-slate-600 bg-slate-50/50 p-3 rounded-xl border border-slate-100 font-semibold leading-relaxed">{thesis.entryNotes || "-"}</p>
          </DetailSection>
          <DetailSection title="Risiko Utama">
            {thesis.risks.length === 0 ? <div className="empty-state">Belum ada risk register.</div> : (
              <div className="grid gap-3">
                {thesis.risks.map((risk) => {
                  const isHigh = risk.impact === "High" || risk.probability === "High";
                  const isMedium = risk.impact === "Medium" || risk.probability === "Medium";
                  const accentClass = isHigh 
                    ? "border-l-4 border-l-rose-500" 
                    : isMedium 
                      ? "border-l-4 border-l-amber-500" 
                      : "border-l-4 border-l-emerald-500";
                  
                  return (
                    <div 
                      key={risk.id} 
                      className={`rounded-2xl border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900/35 p-4 shadow-sm hover:shadow-md transition-all duration-200 ${accentClass}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <strong className="text-navy dark:text-slate-200 text-sm font-extrabold">{risk.name}</strong>
                        
                        {/* Badges */}
                        <div className="flex gap-1.5 shrink-0">
                          <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-full ${
                            risk.impact === "High" 
                              ? "bg-rose-50 dark:bg-rose-950/25 text-rose-700 dark:text-rose-400 border border-rose-100 dark:border-rose-900/30"
                              : risk.impact === "Medium"
                                ? "bg-amber-50 dark:bg-amber-950/25 text-amber-700 dark:text-amber-400 border border-amber-100 dark:border-amber-900/30"
                                : "bg-emerald-50 dark:bg-emerald-950/25 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30"
                          }`}>
                            Impact: {risk.impact}
                          </span>
                          <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-full ${
                            risk.probability === "High" 
                              ? "bg-rose-50 dark:bg-rose-950/25 text-rose-700 dark:text-rose-400 border border-rose-100 dark:border-rose-900/30"
                              : risk.probability === "Medium"
                                ? "bg-amber-50 dark:bg-amber-950/25 text-amber-700 dark:text-amber-400 border border-amber-100 dark:border-amber-900/30"
                                : "bg-emerald-50 dark:bg-emerald-950/25 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30"
                          }`}>
                            Prob: {risk.probability}
                          </span>
                        </div>
                      </div>

                      {/* Mitigation */}
                      <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 text-xs flex gap-3 items-start text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                        <span className="text-[9px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider mt-0.5 shrink-0">Mitigasi</span>
                        <p className="flex-1 whitespace-pre-wrap">{risk.mitigation || "-"}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </DetailSection>
          <DetailSection title="Kriteria Tesis Salah">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/30 p-4">
                <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">Tesis salah jika</span>
                <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300 font-medium whitespace-pre-wrap">
                  {thesis.thesisWrongCriteria || "-"}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/30 p-4">
                <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">Stop averaging down jika</span>
                <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300 font-medium whitespace-pre-wrap">
                  {thesis.stopAveragingDownCriteria || "-"}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/30 p-4">
                <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">Review/sell/reduce jika</span>
                <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300 font-medium whitespace-pre-wrap">
                  {thesis.reviewSellReduceCriteria || "-"}
                </p>
              </div>
            </div>
          </DetailSection>
        </div>

        <div className="grid content-start gap-5">
          <DetailSection title="Aset Terkait">
            {assets.length === 0 ? (
              <div className="empty-state">Belum ada aset saham yang terhubung ke tesis ini.</div>
            ) : (
              <div className="grid gap-3">
                <div className="rounded-2xl bg-teal-50 dark:bg-teal-950/20 border border-teal-100 dark:border-teal-900/30 p-4 text-sm text-teal-900 dark:text-teal-200">
                  <p className="font-extrabold text-[10px] uppercase tracking-wider text-teal-600 dark:text-teal-400">Total Posisi Terkait</p>
                  <p className="mt-1 text-2xl font-black">{formatIDR(linkedAssetValue)}</p>
                </div>
                {assets.map((asset) => (
                  <div key={asset.id} className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/35 p-3.5 shadow-sm dark:shadow-none">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-navy dark:text-slate-200 text-sm font-extrabold">{asset.name}</strong>
                      <span className="pill-neutral text-[10px]">{asset.type}</span>
                    </div>
                    <p className="mt-2 text-lg font-black text-emerald-700 dark:text-emerald-400">{formatIDR(asset.value)}</p>
                    {asset.notes ? <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400 font-semibold">{asset.notes}</p> : null}
                  </div>
                ))}
              </div>
            )}
          </DetailSection>
          <DetailSection title="Checklist Sebelum Beli">
            <div className={`rounded-2xl border p-4 text-xs font-bold flex items-center gap-2 ${
              checklist.isReady 
                ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/30 text-emerald-800 dark:text-emerald-400" 
                : "bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/30 text-rose-800 dark:text-rose-400"
            }`}>
              <AlertCircle size={16} />
              <span>
                {checklist.isReady
                  ? "Tesis terstruktur dengan baik. Periksa harga, risiko, dan alokasi sebelum membeli."
                  : "Struktur tesis belum lengkap. Tuntaskan checklist sebelum melakukan order."}
              </span>
            </div>
            <div className="mt-3 grid gap-2">
              {checklist.checks.map((check) => (
                <div key={check.label} className="flex items-center justify-between rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 px-3.5 py-2.5 text-xs font-bold">
                  <span className="text-slate-600 dark:text-slate-300">{check.label}</span>
                  <span className={check.complete ? "text-emerald-700 dark:text-emerald-400 pill-good" : "text-rose-700 dark:text-rose-400 pill-bad"}>
                    {check.complete ? "OK" : "Missing"}
                  </span>
                </div>
              ))}
            </div>
          </DetailSection>
          <DetailSection title="Kecocokan Portfolio" body={thesis.portfolioFitNotes} />
          <DetailSection title="Jadwal Review">
            <InfoGrid items={[
              ["Last Review", thesis.lastReviewDate || "-"],
              ["Next Review", thesis.nextReviewDate || "-"],
              ["Frequency", thesis.reviewFrequency],
              ["Notes", thesis.reviewNotes || "-"],
            ]} />
          </DetailSection>
          <DetailSection title="Keputusan Saat Ini">
            <InfoGrid items={[
              ["Decision", thesis.currentDecision],
              ["Reason", thesis.decisionReason || "-"],
            ]} />
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="secondary-button mt-3 w-full min-h-10 rounded-xl font-bold" 
              type="button" 
              onClick={addDecisionLog}
            >
              Tambah Decision Log
            </motion.button>
          </DetailSection>
          <ReviewLog thesis={thesis} onAddReview={addReview} onUpdate={onUpdate} />
          <DecisionLog thesis={thesis} onUpdate={onUpdate} />
        </div>
      </div>
    </section>
  );
}

function ReviewLog({ thesis, onAddReview, onUpdate }: { thesis: InvestmentThesis; onAddReview: () => void; onUpdate: (thesis: InvestmentThesis) => void }) {
  return (
    <DetailSection title="Riwayat Review">
      <motion.button 
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="secondary-button mb-3 w-full min-h-10 rounded-xl font-bold" 
        type="button" 
        onClick={onAddReview}
      >
        Tambah Review
      </motion.button>
      <div className="grid gap-3">
        <AnimatePresence mode="popLayout">
          {thesis.reviews.length === 0 ? <div className="empty-state">Belum ada review log.</div> : null}
          {thesis.reviews.map((review) => (
            <motion.div 
              key={review.id} 
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="grid gap-2.5 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 shadow-inner"
            >
              <label className="field">
                <span className="text-[10px] font-bold text-slate-500">Review Date</span>
                <input type="date" className="bg-white min-h-9 text-xs" value={review.reviewDate} onChange={(event) => onUpdate({ ...thesis, reviews: thesis.reviews.map((item) => item.id === review.id ? { ...item, reviewDate: event.target.value } : item) })} />
              </label>
              <label className="field">
                <span className="text-[10px] font-bold text-slate-500">What Changed?</span>
                <input title={helpText["What changed?"]} className="bg-white min-h-9 text-xs" placeholder="What changed?" value={review.whatChanged} onChange={(event) => onUpdate({ ...thesis, reviews: thesis.reviews.map((item) => item.id === review.id ? { ...item, whatChanged: event.target.value } : item) })} />
              </label>
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="field">
                  <span className="text-[10px] font-bold text-slate-500">Thesis Still Valid</span>
                  <select title={helpText["Thesis Still Valid"]} className="bg-white min-h-9 text-xs" value={review.thesisStillValid} onChange={(event) => onUpdate({ ...thesis, reviews: thesis.reviews.map((item) => item.id === review.id ? { ...item, thesisStillValid: event.target.value as ReviewValidity } : item) })}>{reviewValidities.map((value) => <option key={value}>{value}</option>)}</select>
                </label>
                <label className="field">
                  <span className="text-[10px] font-bold text-slate-500">Action</span>
                  <select title={helpText.Action} className="bg-white min-h-9 text-xs" value={review.action} onChange={(event) => onUpdate({ ...thesis, reviews: thesis.reviews.map((item) => item.id === review.id ? { ...item, action: event.target.value as ReviewAction } : item) })}>{reviewActions.map((value) => <option key={value}>{value}</option>)}</select>
                </label>
                <label className="field">
                  <span className="text-[10px] font-bold text-slate-500">Emotion Check</span>
                  <select title={helpText["Emotion Check"]} className="bg-white min-h-9 text-xs" value={review.emotionCheck} onChange={(event) => onUpdate({ ...thesis, reviews: thesis.reviews.map((item) => item.id === review.id ? { ...item, emotionCheck: event.target.value as EmotionCheck } : item) })}>{emotionChecks.map((value) => <option key={value}>{value}</option>)}</select>
                </label>
              </div>
              <label className="field">
                <span className="text-[10px] font-bold text-slate-500">Reason</span>
                <input title={helpText.Reason} className="bg-white min-h-9 text-xs" placeholder="Reason" value={review.reason} onChange={(event) => onUpdate({ ...thesis, reviews: thesis.reviews.map((item) => item.id === review.id ? { ...item, reason: event.target.value } : item) })} />
              </label>
              <label className="field">
                <span className="text-[10px] font-bold text-slate-500">Next Review Date</span>
                <input type="date" className="bg-white min-h-9 text-xs" value={review.nextReviewDate} onChange={(event) => onUpdate({ ...thesis, reviews: thesis.reviews.map((item) => item.id === review.id ? { ...item, nextReviewDate: event.target.value } : item) })} />
              </label>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </DetailSection>
  );
}

function DecisionLog({ thesis, onUpdate }: { thesis: InvestmentThesis; onUpdate: (thesis: InvestmentThesis) => void }) {
  return (
    <DetailSection title="Riwayat Keputusan">
      <div className="grid gap-3">
        <AnimatePresence mode="popLayout">
          {thesis.decisions.length === 0 ? <div className="empty-state">Belum ada decision log.</div> : null}
          {thesis.decisions.map((decision) => (
            <motion.div 
              key={decision.id} 
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="grid gap-2.5 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 shadow-inner"
            >
              <label className="field">
                <span className="text-[10px] font-bold text-slate-500">Decision Date</span>
                <input type="date" className="bg-white min-h-9 text-xs" value={decision.date} onChange={(event) => onUpdate({ ...thesis, decisions: thesis.decisions.map((item) => item.id === decision.id ? { ...item, date: event.target.value } : item) })} />
              </label>
              <label className="field">
                <span className="text-[10px] font-bold text-slate-500">Decision</span>
                <select className="bg-white min-h-9 text-xs" value={decision.decision} onChange={(event) => onUpdate({ ...thesis, decisions: thesis.decisions.map((item) => item.id === decision.id ? { ...item, decision: event.target.value as CurrentDecision } : item) })}>{currentDecisions.map((value) => <option key={value}>{value}</option>)}</select>
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="field">
                  <span className="text-[10px] font-bold text-slate-500">Amount</span>
                  <CurrencyInput title={helpText.Amount} placeholder="Amount" value={decision.amount || ""} onValueChange={(amount) => onUpdate({ ...thesis, decisions: thesis.decisions.map((item) => item.id === decision.id ? { ...item, amount } : item) })} />
                </label>
                <label className="field">
                  <span className="text-[10px] font-bold text-slate-500">Price</span>
                  <CurrencyInput title={helpText.Price} placeholder="Price" value={decision.price || ""} onValueChange={(price) => onUpdate({ ...thesis, decisions: thesis.decisions.map((item) => item.id === decision.id ? { ...item, price } : item) })} />
                </label>
              </div>
              <label className="field">
                <span className="text-[10px] font-bold text-slate-500">Reason</span>
                <input title={helpText.Reason} className="bg-white min-h-9 text-xs" placeholder="Reason" value={decision.reason} onChange={(event) => onUpdate({ ...thesis, decisions: thesis.decisions.map((item) => item.id === decision.id ? { ...item, reason: event.target.value } : item) })} />
              </label>
              <label className="field">
                <span className="text-[10px] font-bold text-slate-500">Risk</span>
                <input title={helpText.Risk} className="bg-white min-h-9 text-xs" placeholder="Risk" value={decision.risk} onChange={(event) => onUpdate({ ...thesis, decisions: thesis.decisions.map((item) => item.id === decision.id ? { ...item, risk: event.target.value } : item) })} />
              </label>
              <label className="field">
                <span className="text-[10px] font-bold text-slate-500">Expected Outcome</span>
                <input title={helpText["Expected Outcome"]} className="bg-white min-h-9 text-xs" placeholder="Expected Outcome" value={decision.expectedOutcome} onChange={(event) => onUpdate({ ...thesis, decisions: thesis.decisions.map((item) => item.id === decision.id ? { ...item, expectedOutcome: event.target.value } : item) })} />
              </label>
              <label className="field">
                <span className="text-[10px] font-bold text-slate-500">Actual Outcome</span>
                <input title={helpText["Actual Outcome"]} className="bg-white min-h-9 text-xs" placeholder="Actual Outcome" value={decision.actualOutcome} onChange={(event) => onUpdate({ ...thesis, decisions: thesis.decisions.map((item) => item.id === decision.id ? { ...item, actualOutcome: event.target.value } : item) })} />
              </label>
              <label className="field">
                <span className="text-[10px] font-bold text-slate-500">Status</span>
                <select className="bg-white min-h-9 text-xs" value={decision.status} onChange={(event) => onUpdate({ ...thesis, decisions: thesis.decisions.map((item) => item.id === decision.id ? { ...item, status: event.target.value as DecisionStatus } : item) })}>{decisionStatuses.map((value) => <option key={value}>{value}</option>)}</select>
              </label>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </DetailSection>
  );
}

function Badge({ value }: { value: string }) {
  return (
    <motion.span 
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`inline-block transition-transform duration-200 hover:scale-105 cursor-help ${getThesisStatusBadge(value as ThesisStatus | ConvictionLevel | SyariahStatus)}`} 
      title={helpText[value]}
    >
      {value}
    </motion.span>
  );
}

function SelectFilter({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <HelpLabel label={label} />
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <div className="rounded-2xl border border-slate-200/80 p-4 bg-white shadow-sm overflow-hidden">
      <button 
        type="button" 
        className="w-full flex items-center justify-between font-extrabold text-navy text-sm outline-none"
        onClick={() => setIsOpen(!isOpen)}
      >
        <HelpLabel label={title} />
        <span className={`text-slate-400 font-bold transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}>▼</span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0, marginTop: 0 }}
            animate={{ height: "auto", opacity: 1, marginTop: 12 }}
            exit={{ height: 0, opacity: 0, marginTop: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="grid gap-3 md:grid-cols-3 overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DetailSection({ title, body, children }: { title: string; body?: string; children?: React.ReactNode }) {
  return (
    <div className="panel bg-white/95">
      <h4 className="mb-3 font-extrabold text-sm text-navy"><HelpLabel label={title} /></h4>
      {children || <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700 font-medium">{body || "-"}</p>}
    </div>
  );
}

function InfoGrid({ items }: { items: Array<[string, React.ReactNode]> }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label} className="grid gap-0.5 rounded-xl border border-slate-100 dark:border-white/5 bg-slate-50/50 p-3 text-xs font-semibold">
          <span className="text-slate-400"><HelpLabel label={label} /></span>
          <span className="text-navy font-extrabold mt-0.5 flex items-center flex-wrap gap-1.5">{value}</span>
        </div>
      ))}
    </div>
  );
}

function TextField({ label, value, onChange, type = "text", required = false }: { label: string; value: string; type?: string; required?: boolean; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span className="inline-flex items-center gap-1"><HelpLabel label={label} />{required ? " *" : ""}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function NumberField({ label, value, helper, currency = false, onChange }: { label: string; value: number; helper?: string; currency?: boolean; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <HelpLabel label={label} />
      {currency ? (
        <CurrencyInput value={value || ""} onValueChange={(amount) => onChange(String(amount || ""))} />
      ) : (
        <input type="number" min="0" step="1" value={value || ""} onChange={(event) => onChange(event.target.value)} />
      )}
      {helper ? <span className="text-xs text-slate-500">{helper}</span> : null}
    </label>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <HelpLabel label={label} />
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function TextArea({ label, value, wide = false, onChange }: { label: string; value: string; wide?: boolean; onChange: (value: string) => void }) {
  return (
    <label className={`field ${wide ? "md:col-span-3" : ""}`}>
      <HelpLabel label={label} />
      <textarea className="min-h-20" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function HelpLabel({ label }: { label: string }) {
  const text = helpText[label];
  if (!text) return <span>{label}</span>;

  return (
    <span className="help-label">
      <span>{label}</span>
      <span className="help-dot" tabIndex={0} aria-label={`Penjelasan ${label}`}>
        ?
        <span className="help-tooltip">{text}</span>
      </span>
    </span>
  );
}
