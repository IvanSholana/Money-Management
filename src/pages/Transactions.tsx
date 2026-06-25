import { useState } from "react";
import { BudgetPocket, Category, Transaction, TransactionType } from "../types";
import { TransactionForm } from "../components/TransactionForm";
import { TransactionTable } from "../components/TransactionTable";
import { calculatePocketMonthSummary } from "../utils/pockets";
import { MetricCard } from "../components/MetricCard";
import { formatIDR } from "../utils/finance";
import { motion } from "framer-motion";

type TransactionsProps = {
  transactions: Transaction[];
  categories: Category[];
  pockets: BudgetPocket[];
  selectedMonth: string;
  initialEditingTransaction?: Transaction | null;
  onSaveTransaction: (transaction: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
};

type Filters = {
  month: string;
  type: "all" | TransactionType;
  category: string;
  pocketId: string;
  search: string;
};

export function Transactions({
  transactions,
  categories,
  pockets,
  selectedMonth,
  initialEditingTransaction,
  onSaveTransaction,
  onDeleteTransaction,
}: TransactionsProps) {
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(initialEditingTransaction || null);
  const [filters, setFilters] = useState<Filters>({
    month: selectedMonth,
    type: "all",
    category: "",
    pocketId: "",
    search: "",
  });

  function handleSave(transaction: Transaction) {
    onSaveTransaction(transaction);
    setEditingTransaction(null);
  }

  const activeMonth = filters.month || selectedMonth;

  const pocketBalances = Object.fromEntries(
    calculatePocketMonthSummary(transactions, pockets, activeMonth).pockets.map((item) => [
      item.pocket.id,
      item.availableBalance,
    ]),
  );

  // Calculate summary metrics based on filtered month
  const monthlyTransactions = transactions.filter((t) => !activeMonth || t.date.startsWith(activeMonth));
  const totalIncome = monthlyTransactions.filter((t) => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = monthlyTransactions.filter((t) => t.type === "expense").reduce((sum, t) => sum + t.amount, 0);
  const transactionCount = monthlyTransactions.length;

  return (
    <div className="grid gap-5">
      <motion.section 
        initial={{ opacity: 0, y: -15 }}
        animate={{ opacity: 1, y: 0 }}
        className="hero-card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h2 className="section-title text-xl font-black text-navy">Manajemen Transaksi</h2>
          <p className="text-sm text-slate-500 mt-1">Catat pemasukan dan pengeluaran, serta lakukan alokasi kantong belanja secara detail.</p>
        </div>
      </motion.section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Income (Bulan Ini)" value={formatIDR(totalIncome)} tone="good" index={0} />
        <MetricCard label="Total Expense (Bulan Ini)" value={formatIDR(totalExpense)} tone="bad" index={1} />
        <MetricCard 
          label="Net Cashflow (Bulan Ini)" 
          value={formatIDR(totalIncome - totalExpense)} 
          tone={(totalIncome - totalExpense) >= 0 ? "good" : "bad"}
          index={2} 
        />
        <MetricCard label="Transaksi Terdaftar" value={`${transactionCount} Item`} index={3} />
      </section>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
        className="grid min-w-0 items-start gap-5 xl:grid-cols-[400px_minmax(0,1fr)]"
      >
        <div className="self-start">
          <TransactionForm
            categories={categories}
            pockets={pockets}
            pocketBalances={pocketBalances}
            editingTransaction={editingTransaction}
            onCancelEdit={() => setEditingTransaction(null)}
            onSubmit={handleSave}
          />
        </div>
        <TransactionTable
          categories={categories}
          pockets={pockets}
          filters={filters}
          onDelete={onDeleteTransaction}
          onEdit={setEditingTransaction}
          onFilterChange={setFilters}
          scrollable
          transactions={transactions}
        />
      </motion.div>
    </div>
  );
}

