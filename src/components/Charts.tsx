import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatIDR } from "../utils/finance";
import { motion } from "framer-motion";

const colors = ["#0f9f9a", "#2f6fed", "#f59e0b", "#16a34a", "#e11d48", "#8b5cf6", "#12324a", "#64748b"];

function compactMoney(value: number) {
  const abs = Math.abs(Number(value));
  const formatter = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });
  if (abs >= 1_000_000) return `${formatter.format(Number(value) / 1_000_000)}jt`;
  if (abs >= 1_000) return `${formatter.format(Number(value) / 1_000)}rb`;
  return formatter.format(Number(value));
}

function shortLabel(value: string) {
  return value.length > 16 ? `${value.slice(0, 14)}...` : value;
}

function MoneyTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl border border-slate-100 bg-white/95 p-3 text-xs shadow-xl backdrop-blur-md flex flex-col gap-1">
      {label ? <p className="font-extrabold text-navy border-b border-slate-100 pb-1 mb-1">{label}</p> : null}
      {payload.map((item: any) => (
        <div key={item.dataKey || item.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 font-bold text-slate-500">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color || item.fill }} />
            {item.name}:
          </span>
          <span className="font-black text-navy">{formatIDR(item.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function ExpensePieChart({ data }: { data: Array<{ name: string; value: number }> }) {
  if (data.length === 0) return <div className="empty-chart">Belum ada expense.</div>;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
    >
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={58}
            outerRadius={96}
            paddingAngle={3}
            label={({ percent }) => `${Math.round(percent * 100)}%`}
            labelLine={false}
            isAnimationActive
          >
            {data.map((entry, index) => (
              <Cell key={entry.name} fill={colors[index % colors.length]} />
            ))}
          </Pie>
          <Tooltip content={<MoneyTooltip />} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

export function MonthlyIncomeExpenseChart({
  data,
}: {
  data: Array<{ month: string; income: number; expense: number }>;
}) {
  if (data.length === 0) return <div className="empty-chart">Belum ada data bulanan.</div>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data}>
          <defs>
            <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#0f9f9a" stopOpacity={0.95}/>
              <stop offset="95%" stopColor="#0f9f9a" stopOpacity={0.35}/>
            </linearGradient>
            <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#e11d48" stopOpacity={0.95}/>
              <stop offset="95%" stopColor="#e11d48" stopOpacity={0.35}/>
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#dbe5ee" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} />
          <YAxis tickFormatter={(value) => compactMoney(Number(value))} tickLine={false} axisLine={false} />
          <Tooltip content={<MoneyTooltip />} />
          <Legend iconType="circle" />
          <Bar dataKey="income" name="Income" fill="url(#colorIncome)" radius={[8, 8, 0, 0]} isAnimationActive />
          <Bar dataKey="expense" name="Expense" fill="url(#colorExpense)" radius={[8, 8, 0, 0]} isAnimationActive />
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

export function DailyExpenseLineChart({ data }: { data: Array<{ day: string; value: number }> }) {
  if (data.length === 0) return <div className="empty-chart">Belum ada expense harian.</div>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data}>
          <defs>
            <linearGradient id="colorLineVal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#e11d48" stopOpacity={0.2}/>
              <stop offset="95%" stopColor="#e11d48" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#dbe5ee" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="day" tickLine={false} axisLine={false} />
          <YAxis tickFormatter={(value) => compactMoney(Number(value))} tickLine={false} axisLine={false} />
          <Tooltip content={<MoneyTooltip />} />
          <Line type="monotone" dataKey="value" name="Expense" stroke="#e11d48" strokeWidth={3.5} dot={{ r: 4, fill: "#e11d48", strokeWidth: 1 }} activeDot={{ r: 6, strokeWidth: 2 }} isAnimationActive />
        </LineChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

export function AllocationSpendingChart({
  data,
}: {
  data: Array<{ name: string; allocated: number; spent: number }>;
}) {
  if (data.length === 0) return <div className="empty-chart">Belum ada data kantong.</div>;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
    >
      <ResponsiveContainer width="100%" height={Math.max(260, data.length * 58)}>
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 24, bottom: 8 }}>
          <defs>
            <linearGradient id="colorAllocatedHoriz" x1="0" y1="0" x2="1" y2="0">
              <stop offset="5%" stopColor="#0f9f9a" stopOpacity={0.45}/>
              <stop offset="95%" stopColor="#0f9f9a" stopOpacity={0.95}/>
            </linearGradient>
            <linearGradient id="colorSpentHoriz" x1="0" y1="0" x2="1" y2="0">
              <stop offset="5%" stopColor="#e11d48" stopOpacity={0.45}/>
              <stop offset="95%" stopColor="#e11d48" stopOpacity={0.95}/>
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#dbe5ee" strokeDasharray="3 3" vertical={false} />
          <XAxis type="number" tickFormatter={(value) => compactMoney(Number(value))} tickLine={false} axisLine={false} />
          <YAxis dataKey="name" type="category" width={120} tickFormatter={(value) => shortLabel(String(value))} tickLine={false} axisLine={false} />
          <Tooltip content={<MoneyTooltip />} />
          <Legend iconType="circle" />
          <Bar dataKey="allocated" name="Dialokasikan" fill="url(#colorAllocatedHoriz)" radius={[0, 8, 8, 0]} isAnimationActive />
          <Bar dataKey="spent" name="Terpakai" fill="url(#colorSpentHoriz)" radius={[0, 8, 8, 0]} isAnimationActive />
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

export function PocketTrendChart({
  data,
}: {
  data: Array<{ month: string; allocated: number; spent: number }>;
}) {
  if (data.length === 0) return <div className="empty-chart">Belum ada trend kantong.</div>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
          <CartesianGrid stroke="#dbe5ee" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} />
          <YAxis width={48} tickFormatter={(value) => compactMoney(Number(value))} tickLine={false} axisLine={false} />
          <Tooltip content={<MoneyTooltip />} />
          <Legend iconType="circle" />
          <Line type="monotone" dataKey="allocated" name="Dialokasikan" stroke="#0f9f9a" strokeWidth={3.5} dot={{ r: 4 }} activeDot={{ r: 6 }} isAnimationActive />
          <Line type="monotone" dataKey="spent" name="Terpakai" stroke="#e11d48" strokeWidth={3.5} dot={{ r: 4 }} activeDot={{ r: 6 }} isAnimationActive />
        </LineChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

