import { BudgetPocket, Category, Transaction } from "../types";
import { DailyExpenseLineChart, ExpensePieChart, MonthlyIncomeExpenseChart } from "../components/Charts";
import { MetricCard } from "../components/MetricCard";
import { TransactionForm } from "../components/TransactionForm";
import { getMonthKey, monthLabel, todayJakarta } from "../utils/date";
import {
  calculateMonthlySummary,
  categoryChartData,
  dailyExpenseData,
  formatIDR,
  groupExpensesByCategory,
  monthlyBarData,
} from "../utils/finance";
import { calculatePocketMonthSummary } from "../utils/pockets";
import { motion } from "framer-motion";

type DashboardProps = {
  transactions: Transaction[];
  categories: Category[];
  pockets: BudgetPocket[];
  selectedMonth: string;
  onSelectedMonthChange: (month: string) => void;
  onSaveTransaction: (transaction: Transaction) => void;
};

export function Dashboard({
  transactions,
  categories,
  pockets,
  selectedMonth,
  onSelectedMonthChange,
  onSaveTransaction,
}: DashboardProps) {
  const summary = calculateMonthlySummary(transactions, selectedMonth);
  const monthlyTransactions = transactions.filter((transaction) => getMonthKey(transaction.date) === selectedMonth);
  const expenseChart = categoryChartData(groupExpensesByCategory(monthlyTransactions));
  const pocketBalances = Object.fromEntries(
    calculatePocketMonthSummary(transactions, pockets, selectedMonth).pockets.map((item) => [
      item.pocket.id,
      item.availableBalance,
    ]),
  );

  return (
    <div className="grid gap-5">
      <motion.section 
        initial={{ opacity: 0, y: -15 }}
        animate={{ opacity: 1, y: 0 }}
        className="hero-card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h2 className="section-title text-xl font-black text-navy">Dashboard {monthLabel(selectedMonth)}</h2>
          <p className="text-sm text-slate-500 mt-1">Ringkasan cashflow, kebiasaan belanja, dan kondisi bulan yang sedang dipilih.</p>
        </div>
        <label className="field max-w-xs">
          <span className="text-xs text-slate-500 font-bold">Bulan</span>
          <input type="month" className="bg-white/80" value={selectedMonth} onChange={(event) => onSelectedMonthChange(event.target.value)} />
        </label>
      </motion.section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Income" value={formatIDR(summary.totalIncome)} tone="good" index={0} />
        <MetricCard label="Total Expense" value={formatIDR(summary.totalExpense)} tone="bad" index={1} />
        <MetricCard
          label="Net Cashflow"
          value={formatIDR(summary.netCashflow)}
          tone={summary.netCashflow >= 0 ? "good" : "bad"}
          index={2}
        />
        <MetricCard label="Expense Ratio" value={`${Math.round(summary.expenseRatio * 100)}%`} index={3} />
        <MetricCard label="Remaining Money" value={formatIDR(summary.remainingMoney)} index={4} />
        <MetricCard label="Kategori Expense Terbesar" value={summary.biggestExpenseCategory} index={5} />
        <MetricCard label="Jumlah Transaksi" value={String(summary.transactionCount)} index={6} />
        <MetricCard label="Hari Ini" value={todayJakarta().toLocaleDateString("id-ID")} helper="Asia/Jakarta" index={7} />
      </section>

      <motion.section 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
        className="grid min-w-0 items-start gap-5 xl:grid-cols-[380px_1fr]"
      >
        <div className="self-start">
          <TransactionForm categories={categories} pockets={pockets} pocketBalances={pocketBalances} onSubmit={onSaveTransaction} />
        </div>
        <div className="grid gap-5">
          <div className="panel bg-white/95">
            <h2 className="section-title text-base font-extrabold text-navy mb-4">Expense by Category</h2>
            <ExpensePieChart data={expenseChart} />
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            <div className="panel bg-white/95">
              <h2 className="section-title text-base font-extrabold text-navy mb-4">Income vs Expense per Bulan</h2>
              <MonthlyIncomeExpenseChart data={monthlyBarData(transactions)} />
            </div>
            <div className="panel bg-white/95">
              <h2 className="section-title text-base font-extrabold text-navy mb-4">Daily Expense</h2>
              <DailyExpenseLineChart data={dailyExpenseData(transactions, selectedMonth)} />
            </div>
          </div>
        </div>
      </motion.section>
    </div>
  );
}

