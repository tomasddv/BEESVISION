import { AlertTriangle } from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

const COLORS = ["#ef4444", "#f97316", "#0ea5e9", "#8b5cf6", "#64748b", "#10b981"];

export default function AnomalyAnalytics({ data }) {
  return (
    <section className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Mini label="Total anomaly" value={data.total} />
        <Mini label="Fraude" value={data.fraud} />
        <Mini label="Fuera de foco" value={data.blur} />
        <Mini label="POP invalido" value={data.pop} />
        <Mini label="Otras" value={data.other} />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Distribucion por tipo">
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={data.byType} dataKey="count" nameKey="type" innerRadius={72} outerRadius={112} paddingAngle={3}>
                {data.byType.map((entry, index) => <Cell key={entry.type} fill={COLORS[index % COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Promotores con mas anomalies">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.promoters}>
              <XAxis dataKey="promoter" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#ef4444" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Heatmap operativo">
          <div className="grid gap-2">
            {data.heatmap.map((row) => (
              <div key={`${row.promoter}-${row.task}-${row.pillar}`} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg border border-slate-200 bg-white/75 p-3">
                <div className="min-w-0">
                  <p className="truncate font-bold text-slate-800">{row.promoter}</p>
                  <p className="truncate text-xs text-slate-500">{row.task} · {row.pillar}</p>
                </div>
                <span className="rounded-full bg-rose-100 px-3 py-1 text-sm font-bold text-rose-700">{row.count}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Tendencia anomalies">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data.trend}>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="anomalies" stroke="#f97316" strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
      </div>
    </section>
  );
}

function Mini({ label, value }) {
  return (
    <div className="glass-panel rounded-lg p-4">
      <div className="mb-3 inline-flex rounded-lg bg-rose-50 p-2 text-rose-600">
        <AlertTriangle size={16} />
      </div>
      <p className="text-2xl font-bold text-slate-950">{value}</p>
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div className="glass-panel rounded-lg p-5">
      <h3 className="mb-4 text-lg font-bold text-slate-950">{title}</h3>
      {children}
    </div>
  );
}
