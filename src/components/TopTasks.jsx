import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatPercent } from "../utils/dataProcessing";

export default function TopTasks({ title, data, variant = "invalid" }) {
  const color = variant === "invalid" ? "#e11d48" : "#059669";
  return (
    <section className="glass-panel rounded-lg p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-950">{title}</h2>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">Top 5</span>
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 20, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
            <XAxis type="number" allowDecimals={false} />
            <YAxis type="category" dataKey="task" width={150} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(value, name) => [value, name === "count" ? "Cantidad" : name]} />
            <Bar dataKey="count" radius={[0, 8, 8, 0]}>
              {data.map((entry) => (
                <Cell key={entry.task} fill={color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 space-y-2">
        {data.map((row, index) => (
          <div key={row.task} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm">
            <span className="font-semibold text-slate-500">#{index + 1}</span>
            <span className="flex-1 truncate font-medium text-slate-800">{row.task}</span>
            <span className="hidden text-slate-500 sm:inline">{row.pillar}</span>
            <span className="font-bold text-slate-950">{formatPercent(row.rate)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
