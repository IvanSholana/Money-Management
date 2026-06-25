import { useMemo, useState } from "react";
import { AlertCircle, CalendarDays, CheckCircle2, Pencil, PiggyBank, Plus, Trash2, Trophy } from "lucide-react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { CurrencyInput } from "../components/CurrencyInput";
import { MetricCard } from "../components/MetricCard";
import { Asset, BudgetPocket, FinancialTarget, TargetType, Transaction } from "../types";
import { formatIDR } from "../utils/finance";
import { createId } from "../utils/id";
import { calculatePocketMonthSummary, PocketSummary } from "../utils/pockets";
import { assetTargetValue, pocketTargetValue } from "../utils/targetAllocations";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";

type TargetsProps = {
  assets: Asset[];
  pockets: BudgetPocket[];
  selectedMonth: string;
  targets: FinancialTarget[];
  transactions: Transaction[];
  onTargetsChange: (targets: FinancialTarget[]) => void;
};

const colors = ["#0f9f9a", "#2f6fed", "#f59e0b", "#16a34a", "#e11d48", "#8b5cf6", "#12324a"];

const emptyDraft = {
  id: "",
  name: "",
  type: "Wishlist",
  targetAmount: "",
  currentAmount: "",
  targetDate: "",
  notes: "",
  color: colors[0],
};

const targetTypes: TargetType[] = ["Wishlist", "Savings Goal", "Installment", "Debt Payoff", "Emergency Fund", "Other"];

function linkedAssetValue(assets: Asset[], targetId: string): number {
  return assets.reduce((sum, asset) => sum + assetTargetValue(asset, targetId), 0);
}

function linkedPocketValue(pocketSummaries: PocketSummary[], targetId: string): number {
  return pocketSummaries.reduce((sum, item) => sum + pocketTargetValue(item, targetId), 0);
}

function effectiveSavedAmount(target: FinancialTarget, assets: Asset[], pocketSummaries: PocketSummary[]): number {
  return target.currentAmount + linkedAssetValue(assets, target.id) + linkedPocketValue(pocketSummaries, target.id);
}

function progressPercent(target: FinancialTarget, assets: Asset[] = [], pocketSummaries: PocketSummary[] = []): number {
  if (target.targetAmount <= 0) return 0;
  return Math.min(100, Math.round((effectiveSavedAmount(target, assets, pocketSummaries) / target.targetAmount) * 100));
}

// 3D Tilt Card Component for each Target
function TargetCard({ 
  target, 
  index, 
  assets, 
  pocketSummaries, 
  onAddProgress, 
  onEdit, 
  onDelete 
}: { 
  target: FinancialTarget; 
  index: number; 
  assets: Asset[]; 
  pocketSummaries: PocketSummary[]; 
  onAddProgress: (t: FinancialTarget, amt: number) => void; 
  onEdit: (t: FinancialTarget) => void; 
  onDelete: (t: FinancialTarget) => void;
}) {
  const assetValue = linkedAssetValue(assets, target.id);
  const pocketValue = linkedPocketValue(pocketSummaries, target.id);
  const savedAmount = effectiveSavedAmount(target, assets, pocketSummaries);
  const progress = progressPercent(target, assets, pocketSummaries);
  const remaining = Math.max(0, target.targetAmount - savedAmount);
  const isDone = progress >= 100;

  // Mouse tilt variables
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useTransform(y, [-0.5, 0.5], [6, -6]);
  const rotateY = useTransform(x, [-0.5, 0.5], [-6, 6]);

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

  return (
    <motion.article 
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.05, 0.25) }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        rotateX,
        rotateY,
        transformStyle: "preserve-3d",
        perspective: 1000,
      }}
      className={`overflow-hidden rounded-2xl border shadow-sm transition-shadow duration-200 cursor-pointer ${
        isDone 
          ? "border-amber-300 dark:border-amber-500/35 shadow-amber-100/50 dark:shadow-amber-950/20 shadow-md bg-gradient-to-br from-white via-white to-amber-50/15 dark:from-slate-800/60 dark:via-slate-800/55 dark:to-amber-500/10" 
          : "border-slate-200/80 bg-white/95 dark:border-white/5 dark:bg-slate-800/45"
      }`}
    >
      <div className="h-1.5" style={{ background: isDone ? "linear-gradient(90deg, #f59e0b, #fbbf24, #f59e0b)" : target.color }} />
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0" style={{ transform: "translateZ(20px)" }}>
          <div className="flex flex-wrap items-center gap-2.5">
            <span 
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm ${
                isDone ? "animate-sparkle" : ""
              }`} 
              style={{ background: isDone ? "linear-gradient(135deg, #f59e0b, #d97706)" : target.color }}
            >
              {isDone ? <Trophy size={20} className="text-amber-100" /> : <PiggyBank size={20} />}
            </span>
            <div className="min-w-0">
              <h4 className="break-words text-base font-black text-navy flex items-center gap-2">
                <span>{target.name}</span>
                {isDone && <span className="inline-block text-xs font-black bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-transparent dark:border-amber-500/20 rounded-full px-2 py-0.5 animate-bounce">Goal! 🏆</span>}
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                <span className="font-bold text-teal">{target.type || "Wishlist"}</span>
                {target.notes ? ` - ${target.notes}` : " - Tanpa catatan"}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <InfoTile label="Manual" value={formatIDR(target.currentAmount)} tone="good" />
            <InfoTile label="Aset Linked" value={formatIDR(assetValue)} tone="good" />
            <InfoTile label="Kantong Linked" value={formatIDR(pocketValue)} tone="good" />
            <InfoTile label="Target" value={formatIDR(target.targetAmount)} />
            <InfoTile label="Sisa" value={formatIDR(remaining)} tone={remaining === 0 ? "good" : "default"} />
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between gap-3 text-xs">
              <span className="font-extrabold text-slate-500">Progress Capaian</span>
              <span className={isDone ? "pill-good" : "pill-neutral"}>
                {isDone ? <CheckCircle2 size={13} className="mr-1 inline align-middle" /> : null}
                <span className="align-middle font-black">{progress}%</span>
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-white/5 relative">
              <motion.div
                className={`h-full rounded-full ${
                  isDone 
                    ? "bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 animate-shimmer" 
                    : "bg-gradient-to-r from-teal to-emerald-400"
                }`}
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-[10px] text-slate-500">
            {target.targetDate ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-white/5 px-3 py-1 font-bold text-slate-600 dark:text-slate-300">
                <CalendarDays size={13} /> Deadline {target.targetDate}
              </span>
            ) : null}
            {isDone ? <span className="pill-good">Selesai</span> : <span className="pill-neutral">Berjalan</span>}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 lg:w-40 lg:flex-col justify-center shrink-0 self-center" style={{ transform: "translateZ(30px)" }}>
          <motion.button 
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="primary-button min-h-9 font-bold" 
            type="button" 
            onClick={() => onAddProgress(target, 100_000)}
          >
            + Rp100rb
          </motion.button>
          <motion.button 
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="secondary-button min-h-9 font-bold" 
            type="button" 
            onClick={() => onEdit(target)}
          >
            <Pencil size={15} className="mr-1 inline" /> Edit
          </motion.button>
          <motion.button 
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="danger-button min-h-9 font-bold" 
            type="button" 
            onClick={() => onDelete(target)}
          >
            <Trash2 size={15} className="mr-1 inline" /> Hapus
          </motion.button>
        </div>
      </div>
    </motion.article>
  );
}

export function Targets({ assets, pockets, selectedMonth, targets, transactions, onTargetsChange }: TargetsProps) {
  const [draft, setDraft] = useState(emptyDraft);
  const [message, setMessage] = useState("");
  const [targetToDelete, setTargetToDelete] = useState<FinancialTarget | null>(null);
  const pocketSummaries = useMemo(
    () => calculatePocketMonthSummary(transactions, pockets, selectedMonth).pockets,
    [pockets, selectedMonth, transactions],
  );

  const summary = useMemo(() => {
    const totalTarget = targets.reduce((sum, target) => sum + target.targetAmount, 0);
    const totalSaved = targets.reduce((sum, target) => sum + effectiveSavedAmount(target, assets, pocketSummaries), 0);
    const completed = targets.filter((target) => target.isCompleted || progressPercent(target, assets, pocketSummaries) >= 100).length;
    const active = targets.length - completed;

    return {
      totalTarget,
      totalSaved,
      completed,
      active,
      overallProgress: totalTarget > 0 ? Math.min(100, Math.round((totalSaved / totalTarget) * 100)) : 0,
    };
  }, [assets, pocketSummaries, targets]);

  function resetDraft() {
    setDraft(emptyDraft);
  }

  function saveTarget() {
    const name = draft.name.trim();
    const targetAmount = Number(draft.targetAmount || 0);
    const currentAmount = Number(draft.currentAmount || 0);

    if (!name) {
      setMessage("Nama target wajib diisi.");
      return;
    }

    if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
      setMessage("Nominal target harus lebih besar dari 0.");
      return;
    }

    if (!Number.isFinite(currentAmount) || currentAmount < 0) {
      setMessage("Nominal terkumpul tidak boleh negatif.");
      return;
    }

    const now = new Date().toISOString();
    const previousTarget = targets.find((target) => target.id === draft.id);
    const target: FinancialTarget = {
      id: draft.id || createId(),
      name,
      type: draft.type as TargetType,
      targetAmount,
      currentAmount,
      targetDate: draft.targetDate,
      notes: draft.notes.trim(),
      color: draft.color,
      isCompleted: currentAmount >= targetAmount,
      createdAt: previousTarget?.createdAt || now,
      updatedAt: now,
    };

    onTargetsChange(draft.id ? targets.map((item) => (item.id === draft.id ? target : item)) : [target, ...targets]);
    setMessage(draft.id ? "Target berhasil diperbarui." : "Target baru berhasil ditambahkan.");
    setTimeout(() => setMessage(""), 3000);
    resetDraft();
  }

  function editTarget(target: FinancialTarget) {
    setDraft({
      id: target.id,
      name: target.name,
      type: target.type || "Wishlist",
      targetAmount: String(target.targetAmount || ""),
      currentAmount: String(target.currentAmount || ""),
      targetDate: target.targetDate || "",
      notes: target.notes || "",
      color: target.color || colors[0],
    });
    setMessage("");
  }

  function confirmDeleteTarget() {
    if (!targetToDelete) return;
    onTargetsChange(targets.filter((target) => target.id !== targetToDelete.id));
    setTargetToDelete(null);
    setMessage("Target sudah dihapus.");
    setTimeout(() => setMessage(""), 3000);
  }

  function addProgress(target: FinancialTarget, amount: number) {
    const currentAmount = Math.max(0, target.currentAmount + amount);
    onTargetsChange(
      targets.map((item) =>
        item.id === target.id
          ? {
              ...item,
              currentAmount,
              isCompleted: currentAmount >= item.targetAmount,
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    );
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
            <p className="text-xs font-black uppercase tracking-wider text-teal">Goal tracker</p>
            <h2 className="section-title text-xl font-black text-navy mt-0.5">Target Keinginan</h2>
            <p className="text-sm text-slate-500 mt-1">Catat hal yang ingin kamu capai dan pantau progress terkumpulnya.</p>
          </div>
          <div className="rounded-2xl bg-teal/10 border border-teal/20 px-4 py-3 text-sm font-bold text-navy shadow-inner backdrop-blur">
            Progress total: <span className="text-teal text-base font-black ml-1">{summary.overallProgress}%</span>
          </div>
        </motion.section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Total Target" value={formatIDR(summary.totalTarget)} index={0} />
          <MetricCard label="Sudah Terkumpul" value={formatIDR(summary.totalSaved)} tone="good" index={1} />
          <MetricCard label="Target Anggaran Aktif" value={String(summary.active)} index={2} />
          <MetricCard label="Target Selesai" value={String(summary.completed)} tone={summary.completed ? "good" : "default"} index={3} />
        </section>

        <div className="grid items-start gap-5 xl:grid-cols-[380px_1fr]">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="panel self-start bg-white/95"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="section-title text-base font-extrabold text-navy">{draft.id ? "Edit Target" : "Tambah Target"}</h3>
              {draft.id ? (
                <button className="secondary-button min-h-9 px-3 rounded-xl font-bold" type="button" onClick={resetDraft}>
                  Batal
                </button>
              ) : null}
            </div>

            <AnimatePresence mode="wait">
              {message && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-3 rounded-xl bg-teal-50 dark:bg-teal-950/20 border border-teal-100 dark:border-teal-900/30 px-3.5 py-2 text-xs font-bold text-teal-800 dark:text-teal-400 overflow-hidden flex items-center gap-2"
                >
                  <AlertCircle size={15} />
                  <span>{message}</span>
                </motion.p>
              )}
            </AnimatePresence>

            <div className="grid gap-3">
              <label className="field">
                <span className="text-xs text-slate-500">Nama Target</span>
                <input
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  placeholder="Contoh: Laptop kerja, liburan, motor"
                />
              </label>
              <label className="field">
                <span className="text-xs text-slate-500">Tipe Target</span>
                <select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })}>
                  {targetTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="text-xs text-slate-500">Nominal Target</span>
                <CurrencyInput
                  value={draft.targetAmount}
                  onValueChange={(targetAmount) => setDraft({ ...draft, targetAmount: targetAmount ? String(targetAmount) : "" })}
                />
              </label>
              <label className="field">
                <span className="text-xs text-slate-500">Sudah Terkumpul</span>
                <CurrencyInput
                  value={draft.currentAmount}
                  onValueChange={(currentAmount) => setDraft({ ...draft, currentAmount: currentAmount ? String(currentAmount) : "" })}
                />
              </label>
              <label className="field">
                <span className="text-xs text-slate-500">Deadline Opsional</span>
                <input type="date" value={draft.targetDate} onChange={(event) => setDraft({ ...draft, targetDate: event.target.value })} />
              </label>
              <label className="field">
                <span className="text-xs text-slate-500">Catatan</span>
                <textarea
                  className="min-h-20"
                  value={draft.notes}
                  onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                  placeholder="Kenapa target ini penting?"
                />
              </label>
              <label className="field">
                <span className="text-xs text-slate-500">Warna</span>
                <div className="flex flex-wrap gap-2">
                  {colors.map((color) => (
                    <button
                      key={color}
                      className={`h-9 w-9 rounded-md border flex items-center justify-center text-white font-bold transition duration-200 ${
                        draft.color === color ? "border-navy scale-110 shadow-md" : "border-slate-200 hover:scale-105"
                      }`}
                      style={{ background: color }}
                      type="button"
                      title={color}
                      onClick={() => setDraft({ ...draft, color })}
                    >
                      {draft.color === color ? "✓" : ""}
                    </button>
                  ))}
                </div>
              </label>
              <button className="primary-button min-h-11 rounded-xl font-extrabold mt-2 flex items-center justify-center gap-1.5" type="button" onClick={saveTarget}>
                <Plus size={16} />
                <span>{draft.id ? "Simpan Target" : "Tambah Target"}</span>
              </button>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="panel bg-white/95"
          >
            <h3 className="section-title text-base font-extrabold text-navy mb-4">Daftar Target</h3>
            {targets.length === 0 ? (
              <div className="empty-state">Belum ada target. Tambahkan sesuatu yang sedang kamu kejar.</div>
            ) : (
              <div className="grid gap-4">
                <AnimatePresence mode="popLayout">
                  {targets
                    .slice()
                    .sort((a, b) => Number(b.isCompleted) - Number(a.isCompleted) || b.updatedAt.localeCompare(a.updatedAt))
                    .map((target, index) => (
                      <TargetCard
                        key={target.id}
                        target={target}
                        index={index}
                        assets={assets}
                        pocketSummaries={pocketSummaries}
                        onAddProgress={addProgress}
                        onEdit={editTarget}
                        onDelete={setTargetToDelete}
                      />
                    ))}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(targetToDelete)}
        title="Hapus target?"
        description="Target ini akan dihapus dari database lokal. Catatan progress target juga ikut hilang."
        confirmLabel="Hapus target"
        cancelLabel="Tidak jadi"
        onCancel={() => setTargetToDelete(null)}
        onConfirm={confirmDeleteTarget}
        details={
          targetToDelete ? (
            <div>
              <p className="text-base font-black text-navy">{targetToDelete.name}</p>
              <p className="mt-1 text-xs text-slate-600 font-semibold">
                Progress {progressPercent(targetToDelete, assets, pocketSummaries)}% - {formatIDR(effectiveSavedAmount(targetToDelete, assets, pocketSummaries))} dari {formatIDR(targetToDelete.targetAmount)}
              </p>
            </div>
          ) : null
        }
      />
    </>
  );
}

function InfoTile({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "good" }) {
  return (
    <div className="rounded-xl bg-slate-50/70 dark:bg-white/3 p-3 border border-slate-100 dark:border-white/5">
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-0.5 break-words text-xs font-black ${tone === "good" ? "text-emerald-700 dark:text-emerald-400" : "text-navy"}`}>{value}</p>
    </div>
  );
}

