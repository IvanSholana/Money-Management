import {
  BarChart3,
  BookOpenCheck,
  Boxes,
  Coins,
  LayoutDashboard,
  PiggyBank,
  ReceiptText,
  Settings,
  Sparkles,
  Target,
  Sun,
  Moon,
  TrendingUp,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type Page = "ai-landing" | "dashboard" | "transactions" | "monthly" | "pockets" | "assets" | "targets" | "thesis" | "scanner" | "settings";

type LayoutProps = {
  page: Page;
  storageStatus: "loading" | "database" | "browser";
  theme: "light" | "dark";
  onThemeToggle: () => void;
  onPageChange: (page: Page) => void;
  children: React.ReactNode;
};

const navItems: Array<{ id: Page; label: string; icon: React.ElementType }> = [
  { id: "ai-landing", label: "Asisten AI", icon: Sparkles },
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "transactions", label: "Transaksi", icon: ReceiptText },
  { id: "monthly", label: "Laporan Bulanan", icon: BarChart3 },
  { id: "pockets", label: "Kantong", icon: PiggyBank },
  { id: "assets", label: "Aset", icon: Boxes },
  { id: "targets", label: "Target", icon: Target },
  { id: "thesis", label: "Tesis", icon: BookOpenCheck },
  { id: "scanner", label: "Algo & AI Trading", icon: TrendingUp },
  { id: "settings", label: "Pengaturan", icon: Settings },
];

export function Layout({ page, storageStatus, theme, onThemeToggle, onPageChange, children }: LayoutProps) {
  const storageLabel =
    storageStatus === "database"
      ? "SQLite lokal aktif"
      : storageStatus === "loading"
        ? "Mengecek database lokal"
        : "Fallback browser storage";

  const storageColor =
    storageStatus === "database"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
      : storageStatus === "loading"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
        : "border-rose-500/30 bg-rose-500/10 text-rose-300";

  return (
    <div className="app-shell min-h-screen pb-12">
      <header className="app-header">
        <div className="app-header-inner mx-auto flex max-w-[1680px] flex-col gap-3 px-4 py-3 sm:px-6 lg:px-10">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="brand-mark cursor-pointer hover:rotate-12 transition-transform duration-300">
                <Coins size={24} className="text-teal animate-float" />
              </div>
              <div className="flex flex-col gap-0.5">
                <p className="header-eyebrow flex items-center gap-1.5">
                  <Sparkles size={12} className="text-cyan-300 animate-sparkle" /> 
                  <span>Local-first finance workspace</span>
                </p>
                <h1 className="text-2xl font-black tracking-tight text-white bg-clip-text bg-gradient-to-r from-white via-white to-teal-200">
                  Monthly Cashflow Tracker
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={onThemeToggle}
                type="button"
                className="inline-flex min-h-0 h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-white shadow-sm hover:bg-white/20 transition-all outline-none"
                title={theme === "dark" ? "Aktifkan Mode Terang" : "Aktifkan Mode Gelap"}
              >
                {theme === "dark" ? <Sun size={16} className="text-amber-300" /> : <Moon size={16} className="text-slate-300" />}
              </button>
              <div className={`storage-badge text-xs font-bold border rounded-xl px-3 py-1.5 shadow-sm backdrop-blur md:block ${storageColor}`}>
                {storageLabel}
              </div>
            </div>
          </div>
          <nav className="nav-tray mt-1">
            {navItems.map((item) => {
              const isActive = page === item.id;
              return (
                <button
                  key={item.id}
                  className={`relative inline-flex min-h-9 items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-300 outline-none ${
                    isActive
                      ? "text-white z-10"
                      : "text-slate-300 hover:text-white hover:bg-white/5"
                  }`}
                  onClick={() => onPageChange(item.id)}
                  type="button"
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeNav"
                      className="absolute inset-0 rounded-xl bg-gradient-to-r from-teal to-emerald-500 shadow-md shadow-teal/25 border border-white/10 z-[-1]"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                  <item.icon size={16} className={`${isActive ? "animate-sparkle" : "opacity-75"}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-[1680px] px-4 py-6 sm:px-6 lg:px-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={page}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.28, ease: "easeInOut" }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

