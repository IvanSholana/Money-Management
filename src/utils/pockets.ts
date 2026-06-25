import { BudgetPocket, IncomeAllocation, Transaction } from "../types";
import { getMonthKey } from "./date";

export const UNASSIGNED_POCKET_LABEL = "Belum Ada Kantong";
export const UNALLOCATED_INCOME_LABEL = "Income Belum Dialokasikan";

export type PocketSummary = {
  pocket: BudgetPocket;
  openingBalance: number;
  allocatedThisMonth: number;
  spentThisMonth: number;
  availableBalance: number;
};

export type PocketMonthSummary = {
  month: string;
  pockets: PocketSummary[];
  totalAllocated: number;
  totalPocketExpense: number;
  totalUnallocatedIncome: number;
  totalExpenseWithoutPocket: number;
};

export function getPocketName(pockets: BudgetPocket[], pocketId?: string): string {
  if (!pocketId) return UNASSIGNED_POCKET_LABEL;
  return pockets.find((pocket) => pocket.id === pocketId)?.name || "Kantong Tidak Ditemukan";
}

export function getActivePockets(pockets: BudgetPocket[]): BudgetPocket[] {
  return pockets.filter((pocket) => !pocket.isArchived);
}

export function getAllocations(transaction: Transaction): IncomeAllocation[] {
  return Array.isArray(transaction.allocations) ? transaction.allocations : [];
}

export function getAllocatedAmount(transaction: Transaction): number {
  return getAllocations(transaction).reduce((sum, allocation) => sum + allocation.amount, 0);
}

export function getUnallocatedIncome(transactions: Transaction[], month?: string): number {
  return transactions
    .filter((transaction) => transaction.type === "income")
    .filter((transaction) => !month || getMonthKey(transaction.date) === month)
    .reduce((sum, transaction) => sum + Math.max(0, transaction.amount - getAllocatedAmount(transaction)), 0);
}

export function calculatePocketMonthSummary(
  transactions: Transaction[],
  pockets: BudgetPocket[],
  month: string,
): PocketMonthSummary {
  const summaries = pockets.map((pocket) => {
    const beforeMonth = transactions.filter((transaction) => getMonthKey(transaction.date) < month);
    const monthly = transactions.filter((transaction) => getMonthKey(transaction.date) === month);
    const openingAllocation = sumAllocationsForPocket(beforeMonth, pocket.id);
    const openingSpending = sumSpendingForPocket(beforeMonth, pocket.id);
    const allocatedThisMonth = sumAllocationsForPocket(monthly, pocket.id);
    const spentThisMonth = sumSpendingForPocket(monthly, pocket.id);
    const manualBalance = Number(pocket.initialBalance || 0);
    const openingBalance = manualBalance + openingAllocation - openingSpending;

    return {
      pocket,
      openingBalance,
      allocatedThisMonth,
      spentThisMonth,
      availableBalance: openingBalance + allocatedThisMonth - spentThisMonth,
    };
  });

  const monthlyTransactions = transactions.filter((transaction) => getMonthKey(transaction.date) === month);

  return {
    month,
    pockets: summaries,
    totalAllocated: summaries.reduce((sum, item) => sum + item.allocatedThisMonth, 0),
    totalPocketExpense: summaries.reduce((sum, item) => sum + item.spentThisMonth, 0),
    totalUnallocatedIncome: getUnallocatedIncome(transactions, month),
    totalExpenseWithoutPocket: monthlyTransactions
      .filter((transaction) => transaction.type === "expense" && !transaction.pocketId)
      .reduce((sum, transaction) => sum + transaction.amount, 0),
  };
}

export function pocketExpenseChartData(summary: PocketMonthSummary) {
  const data = summary.pockets
    .filter((item) => item.spentThisMonth > 0)
    .map((item) => ({ name: item.pocket.name, value: item.spentThisMonth }));

  if (summary.totalExpenseWithoutPocket > 0) {
    data.push({ name: UNASSIGNED_POCKET_LABEL, value: summary.totalExpenseWithoutPocket });
  }

  return data.sort((a, b) => b.value - a.value);
}

export function pocketAllocationSpendingData(summary: PocketMonthSummary) {
  return summary.pockets.map((item) => ({
    name: item.pocket.name,
    allocated: item.allocatedThisMonth,
    spent: item.spentThisMonth,
  }));
}

export function pocketMonthlyTrendData(transactions: Transaction[], pockets: BudgetPocket[]) {
  const months = Array.from(new Set(transactions.map((transaction) => getMonthKey(transaction.date)))).sort();
  return months.map((month) => {
    const summary = calculatePocketMonthSummary(transactions, pockets, month);
    return {
      month,
      spent: summary.totalPocketExpense + summary.totalExpenseWithoutPocket,
      allocated: summary.totalAllocated,
    };
  });
}

function sumAllocationsForPocket(transactions: Transaction[], pocketId: string): number {
  return transactions
    .filter((transaction) => transaction.type === "income")
    .flatMap(getAllocations)
    .filter((allocation) => allocation.pocketId === pocketId)
    .reduce((sum, allocation) => sum + allocation.amount, 0);
}

function sumSpendingForPocket(transactions: Transaction[], pocketId: string): number {
  return transactions
    .filter((transaction) => transaction.type === "expense" && transaction.pocketId === pocketId)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}
