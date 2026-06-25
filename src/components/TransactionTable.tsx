import { BudgetPocket, Category, Transaction, TransactionType } from "../types";
import { formatIDR } from "../utils/finance";
import { getActivePockets, getAllocations, getPocketName } from "../utils/pockets";
import { motion, AnimatePresence } from "framer-motion";

type TransactionTableProps = {
  transactions: Transaction[];
  categories: Category[];
  pockets: BudgetPocket[];
  filters: {
    month: string;
    type: "all" | TransactionType;
    category: string;
    pocketId: string;
    search: string;
  };
  onFilterChange: (filters: TransactionTableProps["filters"]) => void;
  onEdit: (transaction: Transaction) => void;
  onDelete: (id: string) => void;
  scrollable?: boolean;
  showFilters?: boolean;
};

export function TransactionTable({
  transactions,
  categories,
  pockets,
  filters,
  onFilterChange,
  onEdit,
  onDelete,
  scrollable = false,
  showFilters = true,
}: TransactionTableProps) {
  const filteredTransactions = transactions
    .filter((transaction) => !filters.month || transaction.date.startsWith(filters.month))
    .filter((transaction) => filters.type === "all" || transaction.type === filters.type)
    .filter((transaction) => !filters.category || transaction.category === filters.category)
    .filter(
      (transaction) =>
        !filters.pocketId ||
        transaction.pocketId === filters.pocketId ||
        getAllocations(transaction).some((allocation) => allocation.pocketId === filters.pocketId),
    )
    .filter((transaction) => {
      const query = filters.search.trim().toLowerCase();
      if (!query) return true;
      return (transaction.notes || "").toLowerCase().includes(query);
    })
    .sort((a, b) => `${b.date}-${b.id}`.localeCompare(`${a.date}-${a.id}`));

  const categoryOptions = categories.filter((category) => filters.type === "all" || category.type === filters.type);
  const pocketOptions = getActivePockets(pockets);

  return (
    <section className={`panel min-w-0 ${scrollable ? "flex max-h-[calc(100vh-19rem)] min-h-[540px] flex-col overflow-hidden" : ""}`}>
      <div className="mb-4 grid shrink-0 gap-4">
        <h2 className="section-title text-lg font-black tracking-tight text-navy">Daftar Transaksi</h2>
        {showFilters ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
            <label className="field">
              <span className="text-xs text-slate-500">Bulan</span>
              <input
                type="month"
                className="bg-white"
                value={filters.month}
                onChange={(event) => onFilterChange({ ...filters, month: event.target.value })}
              />
            </label>
            <label className="field">
              <span className="text-xs text-slate-500">Tipe</span>
              <select
                value={filters.type}
                className="bg-white"
                onChange={(event) =>
                  onFilterChange({ ...filters, type: event.target.value as "all" | TransactionType, category: "" })
                }
              >
                <option value="all">Semua</option>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
            </label>
            <label className="field">
              <span className="text-xs text-slate-500">Kategori</span>
              <select
                value={filters.category}
                className="bg-white"
                onChange={(event) => onFilterChange({ ...filters, category: event.target.value })}
              >
                <option value="">Semua kategori</option>
                {categoryOptions.map((category) => (
                  <option key={category.id} value={category.name}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="text-xs text-slate-500">Cari catatan</span>
              <input
                value={filters.search}
                className="bg-white"
                onChange={(event) => onFilterChange({ ...filters, search: event.target.value })}
                placeholder="Kata kunci"
              />
            </label>
            <label className="field">
              <span className="text-xs text-slate-500">Kantong</span>
              <select 
                value={filters.pocketId} 
                className="bg-white" 
                onChange={(event) => onFilterChange({ ...filters, pocketId: event.target.value })}
              >
                <option value="">Semua kantong</option>
                {pocketOptions.map((pocket) => (
                  <option key={pocket.id} value={pocket.id}>
                    {pocket.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </div>

      {filteredTransactions.length === 0 ? (
        <div className="empty-state py-12 flex flex-col items-center justify-center border-dashed rounded-2xl border-teal/20 text-slate-400">
          <p className="font-semibold text-sm">Belum ada transaksi sesuai filter.</p>
        </div>
      ) : (
        <div className={`grid gap-3 ${scrollable ? "overflow-y-auto pr-1" : ""}`}>
          <AnimatePresence mode="popLayout">
            {filteredTransactions.map((transaction, index) => {
              const pocketText =
                transaction.type === "expense"
                  ? getPocketName(pockets, transaction.pocketId)
                  : getAllocations(transaction).length
                    ? getAllocations(transaction)
                        .map((allocation) => `${getPocketName(pockets, allocation.pocketId)} (${formatIDR(allocation.amount)})`)
                        .join(", ")
                    : "Income Belum Dialokasikan";

              return (
                <motion.article
                  key={transaction.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  transition={{ duration: 0.25, delay: Math.min(index * 0.03, 0.2) }}
                  whileHover={{ y: -2, border: "1px solid rgba(15, 159, 154, 0.3)" }}
                  className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm hover:shadow-md cursor-pointer transition-shadow duration-200"
                >
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                    <div className="grid min-w-0 gap-3">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className={transaction.type === "income" ? "pill-good" : "pill-bad"}>
                          {transaction.type === "income" ? "Income" : "Expense"}
                        </span>
                        <span className="font-bold text-navy text-xs">{transaction.date}</span>
                        <span className="min-w-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">
                          {transaction.category}
                        </span>
                      </div>
                      <p className={`text-2xl font-black tracking-tight ${transaction.type === "income" ? "text-emerald-700" : "text-rose-700"}`}>
                        {formatIDR(transaction.amount)}
                      </p>
                      <div className="grid gap-3 text-xs md:grid-cols-3">
                        <div className="min-w-0 rounded-xl bg-slate-50/70 p-3 border border-slate-100">
                          <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-slate-400">Kantong</p>
                          <p className="break-words font-semibold leading-5 text-slate-700">{pocketText}</p>
                        </div>
                        <div className="min-w-0 rounded-xl bg-slate-50/70 p-3 border border-slate-100">
                          <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-slate-400">Sumber Dana</p>
                          <p className="break-words font-semibold leading-5 text-slate-700">{transaction.account || "-"}</p>
                        </div>
                        <div className="min-w-0 rounded-xl bg-slate-50/70 p-3 border border-slate-100">
                          <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-slate-400">Catatan</p>
                          <p className="break-words font-semibold leading-5 text-slate-700">{transaction.notes || "-"}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2 lg:flex-col lg:gap-1.5 self-center lg:self-start">
                      <button className="secondary-button min-h-9 min-w-20 rounded-xl font-bold" type="button" onClick={() => onEdit(transaction)}>
                        Edit
                      </button>
                      <button className="danger-button min-h-9 min-w-20 rounded-xl font-bold" type="button" onClick={() => onDelete(transaction.id)}>
                        Hapus
                      </button>
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}

