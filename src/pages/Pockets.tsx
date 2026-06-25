import { useState } from "react";
import { AllocationSpendingChart, ExpensePieChart, PocketTrendChart } from "../components/Charts";
import { CurrencyInput } from "../components/CurrencyInput";
import { MetricCard } from "../components/MetricCard";
import { BudgetPocket, FinancialTarget, TargetAllocation, Transaction } from "../types";
import { monthLabel } from "../utils/date";
import { formatIDR } from "../utils/finance";
import { createId } from "../utils/id";
import {
  calculatePocketMonthSummary,
  pocketAllocationSpendingData,
  pocketExpenseChartData,
  pocketMonthlyTrendData,
} from "../utils/pockets";
import { sumTargetAllocations } from "../utils/targetAllocations";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Plus, Trash2 } from "lucide-react";

type PocketsProps = {
  transactions: Transaction[];
  pockets: BudgetPocket[];
  targets: FinancialTarget[];
  selectedMonth: string;
  onSelectedMonthChange: (month: string) => void;
  onPocketsChange: (pockets: BudgetPocket[]) => void;
};

const colors = ["#0f9f9a", "#12324a", "#2f6fed", "#16a34a", "#f59e0b", "#e11d48", "#64748b"];

export function Pockets({
  transactions,
  pockets,
  targets,
  selectedMonth,
  onSelectedMonthChange,
  onPocketsChange,
}: PocketsProps) {
  const [draft, setDraft] = useState({
    id: "",
    name: "",
    initialBalance: "",
    monthlyTarget: "",
    targetId: "",
    targetAllocations: [] as Array<{ id: string; targetId: string; amount: string }>,
    color: colors[0],
  });
  const [message, setMessage] = useState("");
  const summary = calculatePocketMonthSummary(transactions, pockets, selectedMonth);
  const manualPocketBalance = pockets.reduce((sum, pocket) => sum + Number(pocket.initialBalance || 0), 0);

  function getTargetName(targetId?: string) {
    if (!targetId) return "-";
    return targets.find((target) => target.id === targetId)?.name || "Target tidak ditemukan";
  }

  function getTargetAllocationLabel(allocations: TargetAllocation[] | undefined, targetId?: string, value = 0) {
    if (allocations?.length) {
      return allocations.map((allocation) => `${getTargetName(allocation.targetId)}: ${formatIDR(allocation.amount)}`).join(", ");
    }
    return targetId ? `${getTargetName(targetId)}: ${formatIDR(value)}` : "-";
  }

  function savePocket() {
    const name = draft.name.trim();
    if (!name) {
      setMessage("Nama kantong wajib diisi.");
      return;
    }
    const now = new Date().toISOString();
    const existingSummary = summary.pockets.find((item) => item.pocket.id === draft.id);
    const previousPocket = pockets.find((item) => item.id === draft.id);
    const targetAllocations = draft.targetAllocations
      .map((allocation) => ({
        id: allocation.id || createId(),
        targetId: allocation.targetId,
        amount: Number(allocation.amount || 0),
      }))
      .filter((allocation) => allocation.targetId && allocation.amount > 0);
    const draftInitialBalance = Number(draft.initialBalance || 0);
    const allocationLimit = draft.id
      ? Math.max(0, (existingSummary?.availableBalance || 0) - Number(previousPocket?.initialBalance || 0) + draftInitialBalance)
      : draftInitialBalance;

    if (sumTargetAllocations(targetAllocations) > allocationLimit) {
      setMessage(`Total alokasi target tidak boleh melebihi saldo kantong (${formatIDR(allocationLimit)}).`);
      return;
    }

    const pocket: BudgetPocket = {
      id: draft.id || createId(),
      name,
      initialBalance: draftInitialBalance,
      monthlyTarget: Number(draft.monthlyTarget || 0),
      targetId: "",
      targetAllocations,
      color: draft.color,
      isArchived: false,
      createdAt: pockets.find((item) => item.id === draft.id)?.createdAt || now,
      updatedAt: now,
    };
    onPocketsChange(draft.id ? pockets.map((item) => (item.id === draft.id ? pocket : item)) : [...pockets, pocket]);
    setDraft({ id: "", name: "", initialBalance: "", monthlyTarget: "", targetId: "", targetAllocations: [], color: colors[0] });
    setMessage(draft.id ? "Kantong berhasil diperbarui." : "Kantong baru berhasil ditambahkan.");
    setTimeout(() => setMessage(""), 3000);
  }

  function archivePocket(pocket: BudgetPocket) {
    onPocketsChange(
      pockets.map((item) =>
        item.id === pocket.id ? { ...item, isArchived: !item.isArchived, updatedAt: new Date().toISOString() } : item,
      ),
    );
  }

  return (
    <div className="grid gap-5">
      <motion.section 
        initial={{ opacity: 0, y: -15 }}
        animate={{ opacity: 1, y: 0 }}
        className="hero-card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-teal">Envelope budgeting</p>
          <h2 className="section-title text-xl font-black text-navy mt-0.5">Kantong Anggaran {monthLabel(selectedMonth)}</h2>
          <p className="text-sm text-slate-500 mt-1">Alokasikan income ke kantong dan pantau pola pengeluaran.</p>
        </div>
        <label className="field max-w-xs">
          <span className="text-xs text-slate-500 font-bold">Bulan</span>
          <input type="month" className="bg-white/80" value={selectedMonth} onChange={(event) => onSelectedMonthChange(event.target.value)} />
        </label>
      </motion.section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Dialokasikan Bulan Ini" value={formatIDR(summary.totalAllocated)} tone="good" index={0} />
        <MetricCard label="Terpakai dari Kantong" value={formatIDR(summary.totalPocketExpense)} tone="bad" index={1} />
        <MetricCard label="Income Belum Dialokasikan" value={formatIDR(summary.totalUnallocatedIncome)} index={2} />
        <MetricCard label="Saldo Manual" value={formatIDR(manualPocketBalance)} tone="good" index={3} />
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[380px_1fr]">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="panel self-start bg-white/95"
        >
          <h3 className="section-title text-base font-extrabold text-navy mb-4">{draft.id ? "Edit Kantong" : "Tambah Kantong"}</h3>
          
          <AnimatePresence mode="wait">
            {message && (
              <motion.div
                initial={{ opacity: 0, height: 0, y: -10 }}
                animate={{ opacity: 1, height: "auto", y: 0 }}
                exit={{ opacity: 0, height: 0, y: -10 }}
                className="mb-4 rounded-xl bg-teal-50 border border-teal-100 p-3 text-xs font-bold text-teal-800 flex items-center gap-2 overflow-hidden"
              >
                <AlertCircle size={15} />
                <span>{message}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid gap-3">
            <label className="field">
              <span className="text-xs text-slate-500">Nama Kantong</span>
              <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Misal: Belanja Bulanan" />
            </label>
            <label className="field">
              <span className="text-xs text-slate-500">Saldo Awal / Manual</span>
              <CurrencyInput
                value={draft.initialBalance}
                onValueChange={(initialBalance) =>
                  setDraft({ ...draft, initialBalance: initialBalance ? String(initialBalance) : "" })
                }
              />
              <small className="text-[10px] text-slate-400 font-semibold mt-0.5 leading-normal">Untuk uang lama yang sudah ada sebelum dicatat lewat income.</small>
            </label>
            <label className="field">
              <span className="text-xs text-slate-500">Target Bulanan</span>
              <CurrencyInput
                value={draft.monthlyTarget}
                onValueChange={(monthlyTarget) =>
                  setDraft({ ...draft, monthlyTarget: monthlyTarget ? String(monthlyTarget) : "" })
                }
              />
            </label>
            <label className="field">
              <span className="text-xs text-slate-500">Alokasi ke Target</span>
              <div className="grid gap-2">
                <AnimatePresence mode="popLayout">
                  {draft.targetAllocations.map((allocation) => (
                    <motion.div 
                      key={allocation.id} 
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="grid gap-2 rounded-2xl bg-slate-50 p-2.5 border border-slate-100"
                    >
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
                      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
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
                          className="danger-button w-auto min-h-10 px-3 rounded-xl flex items-center justify-center"
                          type="button"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              targetAllocations: draft.targetAllocations.filter((item) => item.id !== allocation.id),
                            })
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                <button
                  className="secondary-button min-h-9 rounded-xl font-bold flex items-center justify-center gap-1 mt-1"
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      targetAllocations: [...draft.targetAllocations, { id: createId(), targetId: "", amount: "" }],
                    })
                  }
                >
                  <Plus size={16} />
                  <span>Tambah Alokasi Target</span>
                </button>
                <small className="text-[10px] text-slate-400 font-semibold mt-0.5 leading-normal">
                  Contoh: saldo kantong Rp3 juta, Rp1 juta untuk target A dan Rp2 juta untuk target B.
                </small>
              </div>
            </label>
            <div className="my-1 border-t border-slate-100 pt-3">
              <MetricCard label="Expense Tanpa Kantong" value={formatIDR(summary.totalExpenseWithoutPocket)} tone={summary.totalExpenseWithoutPocket ? "bad" : "default"} />
            </div>
            <label className="field mt-1">
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
            <button className="primary-button min-h-11 rounded-xl font-extrabold mt-2" type="button" onClick={savePocket}>
              {draft.id ? "Simpan Kantong" : "Tambah Kantong"}
            </button>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="grid min-w-0 gap-5"
        >
          <div className="panel bg-white/95">
            <h3 className="section-title text-base font-extrabold text-navy mb-4">Saldo Kantong</h3>
            {pockets.length === 0 ? (
              <div className="empty-state">Belum ada kantong. Buat kantong pertama untuk mulai budgeting.</div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-slate-50/20">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="min-w-44 px-4 font-bold text-xs">Kantong</th>
                      <th className="font-bold text-xs">Saldo Awal</th>
                      <th className="font-bold text-xs">Dialokasikan</th>
                      <th className="font-bold text-xs">Terpakai</th>
                      <th className="font-bold text-xs">Saldo Tersedia</th>
                      <th className="font-bold text-xs">Target Bulanan</th>
                      <th className="font-bold text-xs">Alokasi Target</th>
                      <th className="font-bold text-xs">Status</th>
                      <th className="min-w-32 font-bold text-xs">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.pockets.map((item) => {
                      const limitPercent = item.pocket.monthlyTarget > 0
                        ? Math.min(100, Math.round((item.spentThisMonth / item.pocket.monthlyTarget) * 100))
                        : 0;

                      return (
                        <tr key={item.pocket.id} className="hover:bg-teal/[0.02]">
                          <td className="min-w-44 px-4 font-extrabold text-navy">
                            <span className="mr-2.5 inline-block h-3.5 w-3.5 rounded-full shadow-sm align-middle" style={{ background: item.pocket.color }} />
                            <span className="align-middle">{item.pocket.name}</span>
                            {item.pocket.isArchived ? <span className="ml-2 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-400">archived</span> : null}
                          </td>
                          <td className="font-semibold text-slate-600">{formatIDR(item.openingBalance)}</td>
                          <td className="text-emerald-700 font-extrabold">{formatIDR(item.allocatedThisMonth)}</td>
                          <td className="text-rose-700">
                            <div className="flex flex-col gap-1 py-1">
                              <span className="font-extrabold">{formatIDR(item.spentThisMonth)}</span>
                              {item.pocket.monthlyTarget > 0 && (
                                <div className="flex items-center gap-1.5">
                                  <div className="w-16 bg-slate-200 rounded-full h-1 overflow-hidden">
                                    <div 
                                      className={`h-full rounded-full ${limitPercent > 90 ? "bg-rose-500" : "bg-teal"}`}
                                      style={{ width: `${limitPercent}%` }}
                                    />
                                  </div>
                                  <span className="text-[9px] text-slate-500 font-black">{limitPercent}%</span>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5">
                            <span className={item.availableBalance < 0 ? "pill-bad" : "pill-good"}>
                              {formatIDR(item.availableBalance)}
                            </span>
                          </td>
                          <td className="font-semibold text-slate-600">{formatIDR(item.pocket.monthlyTarget)}</td>
                          <td className="max-w-64 whitespace-normal text-xs text-slate-600 font-semibold">
                            {getTargetAllocationLabel(item.pocket.targetAllocations, item.pocket.targetId, item.availableBalance)}
                          </td>
                          <td className="py-2.5">
                            {item.availableBalance < 0 ? (
                              <span className="pill-bad">Overspent</span>
                            ) : item.spentThisMonth > item.pocket.monthlyTarget && item.pocket.monthlyTarget > 0 ? (
                              <span className="pill-warning">Over limit</span>
                            ) : (
                              <span className="pill-good">OK</span>
                            )}
                          </td>
                          <td className="py-2.5">
                            <div className="flex flex-wrap gap-1.5">
                              <button
                                className="secondary-button min-h-9 px-3 rounded-xl font-bold"
                                type="button"
                                onClick={() =>
                                  setDraft({
                                    id: item.pocket.id,
                                    name: item.pocket.name,
                                    initialBalance: String(item.pocket.initialBalance || ""),
                                    monthlyTarget: String(item.pocket.monthlyTarget || ""),
                                    targetId: item.pocket.targetId || "",
                                    targetAllocations: item.pocket.targetAllocations?.length
                                      ? item.pocket.targetAllocations.map((allocation) => ({
                                          id: allocation.id,
                                          targetId: allocation.targetId,
                                          amount: String(allocation.amount || ""),
                                        }))
                                      : item.pocket.targetId
                                        ? [{ id: createId(), targetId: item.pocket.targetId, amount: String(Math.max(0, item.availableBalance) || "") }]
                                        : [],
                                    color: item.pocket.color,
                                  })
                                }
                              >
                                Edit
                              </button>
                              <button 
                                className={`min-h-9 px-3 rounded-xl font-bold ${
                                  item.pocket.isArchived ? "secondary-button" : "danger-button"
                                }`} 
                                type="button" 
                                onClick={() => archivePocket(item.pocket)}
                              >
                                {item.pocket.isArchived ? "Unarchive" : "Archive"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <div className="panel bg-white/95">
              <h3 className="section-title text-base font-extrabold text-navy mb-4">Expense by Pocket</h3>
              <ExpensePieChart data={pocketExpenseChartData(summary)} />
            </div>
            <div className="panel bg-white/95">
              <h3 className="section-title text-base font-extrabold text-navy mb-4">Allocation vs Spending</h3>
              <AllocationSpendingChart data={pocketAllocationSpendingData(summary)} />
            </div>
            <div className="panel bg-white/95 xl:col-span-2">
              <h3 className="section-title text-base font-extrabold text-navy mb-4">Trend Kantong</h3>
              <PocketTrendChart data={pocketMonthlyTrendData(transactions, pockets)} />
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

