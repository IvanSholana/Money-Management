import { format } from "date-fns";

export function todayJakarta(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
}

export function getMonthKey(dateInput: Date | string): string {
  const date = typeof dateInput === "string" ? new Date(`${dateInput}T00:00:00+07:00`) : dateInput;
  return format(date, "yyyy-MM");
}

export function getTodayInputValue(): string {
  return format(todayJakarta(), "yyyy-MM-dd");
}

export function monthLabel(monthKey: string): string {
  const date = new Date(`${monthKey}-01T00:00:00+07:00`);
  return new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(date);
}
