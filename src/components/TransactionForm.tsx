import { useEffect, useState } from "react";
import { BudgetPocket, Category, IncomeAllocation, Transaction, TransactionType } from "../types";
import { getTodayInputValue } from "../utils/date";
import { createId } from "../utils/id";
import { formatIDR } from "../utils/finance";
import { getAllocatedAmount } from "../utils/pockets";
import { CurrencyInput } from "./CurrencyInput";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, AlertTriangle } from "lucide-react";

type TransactionFormProps = {
  categories: Category[];
  pockets: BudgetPocket[];
  pocketBalances?: Record<string, number>;
  editingTransaction?: Transaction | null;
  onSubmit: (transaction: Transaction) => void;
  onCancelEdit?: () => void;
};

const emptyForm = {
  date: getTodayInputValue(),
  type: "expense" as TransactionType,
  category: "",
  amount: "",
  pocketId: "",
  allocations: [] as IncomeAllocation[],
  account: "",
  notes: "",
};

export function TransactionForm({
  categories,
  pockets,
  pocketBalances = {},
  editingTransaction,
  onSubmit,
  onCancelEdit,
}: TransactionFormProps) {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [isSubmitSuccess, setIsSubmitSuccess] = useState(false);

  useEffect(() => {
    if (editingTransaction) {
      setForm({
        date: editingTransaction.date,
        type: editingTransaction.type,
        category: editingTransaction.category,
        amount: String(editingTransaction.amount),
        pocketId: editingTransaction.pocketId || "",
        allocations: editingTransaction.allocations || [],
        account: editingTransaction.account || "",
        notes: editingTransaction.notes || "",
      });
    }
  }, [editingTransaction]);

  const filteredCategories = categories.filter((category) => category.type === form.type);
  const selectedAllocationPocketIds = new Set(form.allocations.map((allocation) => allocation.pocketId));
  const activePockets = pockets.filter(
    (pocket) => !pocket.isArchived || pocket.id === form.pocketId || selectedAllocationPocketIds.has(pocket.id),
  );
  const allocatedAmount = getAllocatedAmount({ ...form, amount: Number(form.amount || 0), id: "", category: form.category });
  const unallocatedAmount = Math.max(0, Number(form.amount || 0) - allocatedAmount);
  const selectedPocketBalance = form.pocketId ? pocketBalances[form.pocketId] ?? 0 : 0;
  const expenseAmount = Number(form.amount || 0);
  const isOverspendingPocket = form.type === "expense" && form.pocketId && expenseAmount > selectedPocketBalance;

  function updateField(name: string, value: string) {
    setForm((current) => ({
      ...current,
      [name]: value,
      ...(name === "type" ? { category: "", pocketId: "", allocations: [] } : {}),
    }));
  }

  function addAllocation() {
    setForm((current) => ({
      ...current,
      allocations: [...current.allocations, { id: createId(), pocketId: "", amount: 0 }],
    }));
  }

  function updateAllocation(id: string, update: Partial<IncomeAllocation>) {
    setForm((current) => ({
      ...current,
      allocations: current.allocations.map((allocation) =>
        allocation.id === id ? { ...allocation, ...update } : allocation,
      ),
    }));
  }

  function removeAllocation(id: string) {
    setForm((current) => ({
      ...current,
      allocations: current.allocations.filter((allocation) => allocation.id !== id),
    }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const amount = Number(form.amount);

    if (!form.type || !form.category || !form.amount) {
      setError("Tipe, kategori, dan nominal wajib diisi.");
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Nominal harus lebih besar dari 0.");
      return;
    }

    const allocations = form.type === "income" ? form.allocations.filter((allocation) => allocation.pocketId && allocation.amount > 0) : [];
    const allocationTotal = allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
    if (form.type === "income" && allocationTotal > amount) {
      setError("Total alokasi kantong tidak boleh melebihi nominal income.");
      return;
    }

    if (form.type === "expense" && !form.pocketId && !editingTransaction) {
      setError("Kantong anggaran wajib dipilih untuk expense baru.");
      return;
    }

    onSubmit({
      id: editingTransaction?.id || createId(),
      date: form.date,
      type: form.type,
      category: form.category,
      amount,
      pocketId: form.type === "expense" ? form.pocketId : "",
      allocations,
      account: form.account.trim(),
      notes: form.notes.trim(),
    });
    setForm(emptyForm);
    setError("");
    setIsSubmitSuccess(true);
    setTimeout(() => setIsSubmitSuccess(false), 2000);
  }

  return (
    <form className="panel grid gap-4 bg-white/95" onSubmit={handleSubmit}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="section-title text-lg font-black tracking-tight text-navy">
          {editingTransaction ? "Edit Transaksi" : "Tambah Transaksi"}
        </h2>
        {editingTransaction ? (
          <button className="secondary-button min-h-9 px-3 rounded-xl font-bold" type="button" onClick={onCancelEdit}>
            Batal
          </button>
        ) : null}
      </div>

      <AnimatePresence mode="wait">
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -10 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="rounded-xl bg-rose-50 border border-rose-100 p-3 text-xs font-bold text-rose-700 flex items-center gap-2 overflow-hidden"
          >
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="field">
          <span className="text-xs text-slate-500">Tanggal</span>
          <input
            type="date"
            value={form.date}
            onChange={(event) => updateField("date", event.target.value)}
            required
          />
        </label>
        <label className="field">
          <span className="text-xs text-slate-500">Tipe</span>
          <select
            value={form.type}
            onChange={(event) => updateField("type", event.target.value)}
            required
          >
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
        </label>
        <label className="field">
          <span className="text-xs text-slate-500">Kategori</span>
          <select
            value={form.category}
            onChange={(event) => updateField("category", event.target.value)}
            required
          >
            <option value="">Pilih kategori</option>
            {filteredCategories.map((category) => (
              <option key={category.id} value={category.name}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="text-xs text-slate-500">Nominal</span>
          <CurrencyInput
            value={form.amount}
            onValueChange={(amount) => updateField("amount", amount ? String(amount) : "")}
            required
          />
        </label>
        {form.type === "expense" ? (
          <label className="field">
            <span className="text-xs text-slate-500">Kantong Anggaran</span>
            <select value={form.pocketId} onChange={(event) => updateField("pocketId", event.target.value)}>
              <option value="">Pilih kantong</option>
              {activePockets.map((pocket) => (
                <option key={pocket.id} value={pocket.id}>
                  {pocket.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <AnimatePresence>
          {isOverspendingPocket && (
            <motion.div
              initial={{ opacity: 0, height: 0, y: -8 }}
              animate={{ opacity: 1, height: "auto", y: 0 }}
              exit={{ opacity: 0, height: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs font-bold text-amber-800 sm:col-span-2 overflow-hidden flex items-start gap-2.5"
            >
              <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
              <span>
                Warning: expense ini melebihi saldo kantong saat ini ({formatIDR(selectedPocketBalance)}). Transaksi tetap boleh disimpan.
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        <label className="field">
          <span className="text-xs text-slate-500">Sumber Dana</span>
          <input
            value={form.account}
            onChange={(event) => updateField("account", event.target.value)}
            placeholder="BCA, Cash, GoPay"
          />
        </label>
        <label className="field">
          <span className="text-xs text-slate-500">Catatan</span>
          <input value={form.notes} onChange={(event) => updateField("notes", event.target.value)} placeholder="Misal: Makan siang" />
        </label>
      </div>

      <AnimatePresence>
        {form.type === "income" && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
            transition={{ duration: 0.25 }}
            className="rounded-2xl border border-slate-200/80 p-4 bg-slate-50/40"
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-extrabold text-sm text-navy">Alokasi ke Kantong</h3>
                <p className="text-xs text-slate-500 mt-0.5">Sisa belum dialokasikan: {formatIDR(unallocatedAmount)}</p>
              </div>
              <button className="secondary-button min-h-9 px-3 rounded-xl font-bold" type="button" onClick={addAllocation}>
                Tambah Alokasi
              </button>
            </div>
            <div className="grid gap-2">
              <AnimatePresence mode="popLayout">
                {form.allocations.length === 0 ? (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="rounded-xl border border-dashed border-slate-200 p-3 text-center text-xs font-semibold text-slate-500 bg-white"
                  >
                    Income ini belum dialokasikan ke kantong.
                  </motion.p>
                ) : null}
                {form.allocations.map((allocation) => (
                  <motion.div
                    key={allocation.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="grid gap-2 sm:grid-cols-[1fr_160px_auto] bg-white p-2 rounded-xl border border-slate-100 shadow-sm"
                  >
                    <select
                      value={allocation.pocketId}
                      onChange={(event) => updateAllocation(allocation.id, { pocketId: event.target.value })}
                      className="min-h-10"
                    >
                      <option value="">Pilih kantong</option>
                      {activePockets.map((pocket) => (
                        <option key={pocket.id} value={pocket.id}>
                          {pocket.name}
                        </option>
                      ))}
                    </select>
                    <CurrencyInput
                      value={allocation.amount || ""}
                      onValueChange={(amount) => updateAllocation(allocation.id, { amount })}
                      placeholder="Nominal"
                    />
                    <button className="danger-button min-h-10 px-3 rounded-xl font-bold" type="button" onClick={() => removeAllocation(allocation.id)}>
                      Hapus
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        className={`primary-button min-h-11 rounded-xl font-extrabold shadow-md relative overflow-hidden ${
          isSubmitSuccess ? "from-emerald-600 to-teal-600" : ""
        }`}
        type="submit"
        whileTap={{ scale: 0.98 }}
      >
        <AnimatePresence mode="wait">
          {isSubmitSuccess ? (
            <motion.span
              key="success"
              initial={{ y: 15, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -15, opacity: 0 }}
              className="flex items-center justify-center gap-1.5"
            >
              Sukses Disimpan! ✓
            </motion.span>
          ) : (
            <motion.span
              key="default"
              initial={{ y: -15, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 15, opacity: 0 }}
            >
              {editingTransaction ? "Simpan Perubahan" : "Tambah Transaksi"}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </form>
  );
}

