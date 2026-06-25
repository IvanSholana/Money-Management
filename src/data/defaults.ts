import { AppData, BudgetPocket, Category, Transaction } from "../types";
import { getMonthKey, todayJakarta } from "../utils/date";
import { createId } from "../utils/id";

export const incomeCategories = [
  "Salary",
  "Bonus/THR",
  "Freelance",
  "Gift",
  "Dividend/Yield",
  "Reimbursement",
  "Other Income",
];

export const expenseCategories = [
  "Food",
  "Rent/Kost",
  "Family Support",
  "Transport",
  "Internet/Pulsa",
  "Utilities",
  "Personal Care",
  "Health",
  "Education",
  "Social/Charity",
  "Entertainment",
  "Admin/Fee",
  "Debt/Cicilan",
  "Investment",
  "Other Expense",
];

export const defaultCategories: Category[] = [
  ...incomeCategories.map((name) => ({
    id: `default-income-${name}`,
    name,
    type: "income" as const,
    isDefault: true,
  })),
  ...expenseCategories.map((name) => ({
    id: `default-expense-${name}`,
    name,
    type: "expense" as const,
    isDefault: true,
  })),
];

export const defaultData: AppData = {
  transactions: [],
  categories: defaultCategories,
  budgetPockets: [],
  assets: [],
  targets: [],
  theses: [],
  settings: {
    monthlyIncomeTarget: 7_700_000,
    monthlyExpenseTarget: 3_000_000,
    currency: "IDR",
    autoSyncInterval: 30,
  },
  assetStrategy: {
    mode: "Free",
    customLimits: {},
  },
};

export function createSamplePockets(): BudgetPocket[] {
  const now = new Date().toISOString();
  return [
    { id: "sample-pocket-needs", name: "Needs", initialBalance: 0, monthlyTarget: 3_000_000, targetId: "", targetAllocations: [], color: "#0f9f9a", isArchived: false, createdAt: now, updatedAt: now },
    { id: "sample-pocket-family", name: "Family", initialBalance: 0, monthlyTarget: 700_000, targetId: "", targetAllocations: [], color: "#12324a", isArchived: false, createdAt: now, updatedAt: now },
    { id: "sample-pocket-fun", name: "Fun", initialBalance: 0, monthlyTarget: 500_000, targetId: "", targetAllocations: [], color: "#f59e0b", isArchived: false, createdAt: now, updatedAt: now },
  ];
}

export function createSampleTransactions(): Transaction[] {
  const month = getMonthKey(todayJakarta());
  return [
    {
      id: createId(),
      date: `${month}-01`,
      type: "income",
      category: "Salary",
      amount: 7_700_000,
      account: "BCA",
      notes: "Gaji bulanan",
      allocations: [
        { id: createId(), pocketId: "sample-pocket-needs", amount: 3_000_000 },
        { id: createId(), pocketId: "sample-pocket-family", amount: 700_000 },
        { id: createId(), pocketId: "sample-pocket-fun", amount: 500_000 },
      ],
    },
    {
      id: createId(),
      date: `${month}-02`,
      type: "expense",
      category: "Rent/Kost",
      amount: 1_200_000,
      account: "BCA",
      notes: "Kost",
      pocketId: "sample-pocket-needs",
    },
    {
      id: createId(),
      date: `${month}-03`,
      type: "expense",
      category: "Food",
      amount: 85_000,
      account: "Cash",
      notes: "Makan harian",
      pocketId: "sample-pocket-needs",
    },
    {
      id: createId(),
      date: `${month}-05`,
      type: "expense",
      category: "Family Support",
      amount: 500_000,
      account: "BCA",
      notes: "Kirim keluarga",
      pocketId: "sample-pocket-family",
    },
    {
      id: createId(),
      date: `${month}-07`,
      type: "expense",
      category: "Transport",
      amount: 120_000,
      account: "E-wallet",
      notes: "Transport mingguan",
      pocketId: "sample-pocket-needs",
    },
    {
      id: createId(),
      date: `${month}-10`,
      type: "expense",
      category: "Internet/Pulsa",
      amount: 150_000,
      account: "BCA",
      notes: "Internet rumah",
      pocketId: "sample-pocket-needs",
    },
    {
      id: createId(),
      date: `${month}-12`,
      type: "expense",
      category: "Utilities",
      amount: 210_000,
      account: "BCA",
      notes: "Listrik dan air",
      pocketId: "sample-pocket-needs",
    },
  ];
}
