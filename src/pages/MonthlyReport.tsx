import { BudgetPocket, Category, Transaction } from "../types";
import { DailyExpenseLineChart, ExpensePieChart } from "../components/Charts";
import { MetricCard } from "../components/MetricCard";
import { TransactionTable } from "../components/TransactionTable";
import { getMonthKey, monthLabel } from "../utils/date";
import {
  calculateMonthlySummary,
  categoryChartData,
  dailyExpenseData,
  formatIDR,
  groupExpensesByCategory,
  groupIncomeByCategory,
} from "../utils/finance";
import { calculatePocketMonthSummary } from "../utils/pockets";
import { motion } from "framer-motion";

type MonthlyReportProps = {
  transactions: Transaction[];
  categories: Category[];
  pockets: BudgetPocket[];
  selectedMonth: string;
  onSelectedMonthChange: (month: string) => void;
  onEditTransaction: (transaction: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
};

export function MonthlyReport({
  transactions,
  categories,
  pockets,
  selectedMonth,
  onSelectedMonthChange,
  onEditTransaction,
  onDeleteTransaction,
}: MonthlyReportProps) {
  const monthlyTransactions = transactions.filter((transaction) => getMonthKey(transaction.date) === selectedMonth);
  const summary = calculateMonthlySummary(transactions, selectedMonth);
  const pocketSummary = calculatePocketMonthSummary(transactions, pockets, selectedMonth);
  const expenseData = categoryChartData(groupExpensesByCategory(monthlyTransactions));
  const incomeData = categoryChartData(groupIncomeByCategory(monthlyTransactions));

  return (
    <div className="grid gap-5">
      <motion.section 
        initial={{ opacity: 0, y: -15 }}
        animate={{ opacity: 1, y: 0 }}
        className="hero-card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h2 className="section-title text-xl font-black text-navy">Laporan Bulanan {monthLabel(selectedMonth)}</h2>
          <p className="text-sm text-slate-500 mt-1">Ringkasan income, expense, dan transaksi bulan ini.</p>
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
      </section>

      <motion.section 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="grid gap-5 lg:grid-cols-3"
      >
        <div className="panel bg-white/95">
          <h2 className="section-title text-base font-extrabold text-navy mb-4">Expense by Category</h2>
          <ExpensePieChart data={expenseData} />
        </div>
        <div className="panel bg-white/95">
          <h2 className="section-title text-base font-extrabold text-navy mb-4">Income by Category</h2>
          <ExpensePieChart data={incomeData} />
        </div>
        <div className="panel bg-white/95">
          <h2 className="section-title text-base font-extrabold text-navy mb-4">Daily Spending Trend</h2>
          <DailyExpenseLineChart data={dailyExpenseData(transactions, selectedMonth)} />
        </div>
      </motion.section>

      <motion.section 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="panel bg-white/95"
      >
        <h2 className="section-title text-base font-extrabold text-navy mb-4">Kantong Anggaran</h2>
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Dialokasikan" value={formatIDR(pocketSummary.totalAllocated)} tone="good" index={0} />
          <MetricCard label="Terpakai dari Kantong" value={formatIDR(pocketSummary.totalPocketExpense)} tone="bad" index={1} />
          <MetricCard label="Income Belum Dialokasikan" value={formatIDR(pocketSummary.totalUnallocatedIncome)} index={2} />
          <MetricCard label="Expense Tanpa Kantong" value={formatIDR(pocketSummary.totalExpenseWithoutPocket)} index={3} />
        </div>
        {pocketSummary.pockets.length === 0 ? (
          <div className="empty-state">Belum ada kantong anggaran.</div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-slate-50/20">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="px-4 font-bold text-xs">Kantong</th>
                  <th className="font-bold text-xs">Saldo Awal</th>
                  <th className="font-bold text-xs">Dialokasikan</th>
                  <th className="font-bold text-xs">Terpakai & Rasio</th>
                  <th className="font-bold text-xs">Saldo Tersedia</th>
                </tr>
              </thead>
              <tbody>
                {pocketSummary.pockets.map((item) => {
                  const spentPercent = item.allocatedThisMonth > 0
                    ? Math.min(100, Math.round((item.spentThisMonth / item.allocatedThisMonth) * 100))
                    : item.spentThisMonth > 0 ? 100 : 0;

                  return (
                    <tr key={item.pocket.id} className="hover:bg-teal/[0.02]">
                      <td className="px-4 font-extrabold text-navy">{item.pocket.name}</td>
                      <td className="font-semibold text-slate-600">{formatIDR(item.openingBalance)}</td>
                      <td className="text-emerald-700 font-extrabold">{formatIDR(item.allocatedThisMonth)}</td>
                      <td className="text-rose-700">
                        <div className="flex flex-col gap-1.5 py-1">
                          <span className="font-extrabold">{formatIDR(item.spentThisMonth)}</span>
                          {item.allocatedThisMonth > 0 && (
                            <div className="flex items-center gap-2">
                              <div className="w-20 bg-slate-200/80 rounded-full h-1.5 overflow-hidden">
                                <div 
                                  className={`h-full rounded-full ${spentPercent > 85 ? "bg-rose-500" : "bg-teal"}`}
                                  style={{ width: `${spentPercent}%` }}
                                />
                              </div>
                              <span className="text-[10px] font-black text-slate-500">{spentPercent}%</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5">
                        <span className={item.availableBalance < 0 ? "pill-bad" : "pill-good"}>
                          {formatIDR(item.availableBalance)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.section>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.25 }}
      >
        <TransactionTable
          categories={categories}
          pockets={pockets}
          filters={{ month: selectedMonth, type: "all", category: "", pocketId: "", search: "" }}
          onDelete={onDeleteTransaction}
          onEdit={onEditTransaction}
          onFilterChange={() => undefined}
          showFilters={false}
          transactions={monthlyTransactions}
        />
      </motion.div>
    </div>
  );
}

