import { BudgetPocket, MonthlySummary, Transaction, TransactionType } from "../types";
import { getMonthKey } from "./date";
import { getAllocations, getPocketName } from "./pockets";

export function formatIDR(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function calculateExpenseRatio(totalExpense: number, totalIncome: number): number {
  if (totalIncome <= 0) return totalExpense > 0 ? 1 : 0;
  return totalExpense / totalIncome;
}

export function getTransactionsByMonth(transactions: Transaction[], month: string): Transaction[] {
  return transactions.filter((transaction) => getMonthKey(transaction.date) === month);
}

export function sumByType(transactions: Transaction[], type: TransactionType): number {
  return transactions
    .filter((transaction) => transaction.type === type)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

export function groupByCategory(transactions: Transaction[], type: TransactionType): Record<string, number> {
  return transactions
    .filter((transaction) => transaction.type === type)
    .reduce<Record<string, number>>((groups, transaction) => {
      groups[transaction.category] = (groups[transaction.category] || 0) + transaction.amount;
      return groups;
    }, {});
}

export function groupExpensesByCategory(transactions: Transaction[]): Record<string, number> {
  return groupByCategory(transactions, "expense");
}

export function groupIncomeByCategory(transactions: Transaction[]): Record<string, number> {
  return groupByCategory(transactions, "income");
}

export function calculateMonthlySummary(transactions: Transaction[], month: string): MonthlySummary {
  const monthlyTransactions = getTransactionsByMonth(transactions, month);
  const totalIncome = sumByType(monthlyTransactions, "income");
  const totalExpense = sumByType(monthlyTransactions, "expense");
  const expenseGroups = groupExpensesByCategory(monthlyTransactions);
  const biggestExpenseCategory =
    Object.entries(expenseGroups).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";

  return {
    month,
    totalIncome,
    totalExpense,
    netCashflow: totalIncome - totalExpense,
    expenseRatio: calculateExpenseRatio(totalExpense, totalIncome),
    remainingMoney: totalIncome - totalExpense,
    biggestExpenseCategory,
    transactionCount: monthlyTransactions.length,
  };
}

export function categoryChartData(groups: Record<string, number>) {
  return Object.entries(groups)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export function monthlyBarData(transactions: Transaction[]) {
  const months = Array.from(new Set(transactions.map((transaction) => getMonthKey(transaction.date)))).sort();
  return months.map((month) => {
    const monthlyTransactions = getTransactionsByMonth(transactions, month);
    return {
      month,
      income: sumByType(monthlyTransactions, "income"),
      expense: sumByType(monthlyTransactions, "expense"),
    };
  });
}

export function dailyExpenseData(transactions: Transaction[], month: string) {
  const days: Record<string, number> = {};
  getTransactionsByMonth(transactions, month)
    .filter((transaction) => transaction.type === "expense")
    .forEach((transaction) => {
      const day = transaction.date.slice(-2);
      days[day] = (days[day] || 0) + transaction.amount;
    });

  return Object.entries(days)
    .map(([day, value]) => ({ day, value }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

export function exportToCSV(transactions: Transaction[], pockets: BudgetPocket[] = []): string {
  const headers = ["Date", "Type", "Category", "Amount", "Pocket", "Income Allocations", "Account", "Notes"];
  const rows = transactions.map((transaction) =>
    [
      transaction.date,
      transaction.type,
      transaction.category,
      transaction.amount,
      transaction.type === "expense" ? getPocketName(pockets, transaction.pocketId) : "",
      transaction.type === "income"
        ? getAllocations(transaction)
            .map((allocation) => `${getPocketName(pockets, allocation.pocketId)}: ${allocation.amount}`)
            .join("; ")
        : "",
      transaction.account || "",
      transaction.notes || "",
    ]
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(","),
  );
  return [headers.join(","), ...rows].join("\n");
}
