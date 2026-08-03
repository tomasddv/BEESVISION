import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  Bar,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

export default function TrendChart({ data }) {
  return (
    <section className="glass-panel rounded-lg p-5">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-950">Evolucion temporal</h2>
        <p className="text-sm text-slate-500">Validacion, anomalies y revisiones con linea objetivo 70%</p>
      </div>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="left" tickFormatter={(value) => `${Math.round(value * 100)}%`} />
            <YAxis yAxisId="right" orientation="right" allowDecimals={false} />
            <Tooltip formatter={(value, name) => name === "validation" || name === "objective" ? `${(value * 100).toFixed(1)}%` : value} />
            <Legend />
            <Bar yAxisId="right" dataKey="anomalies" name="Anomalies" fill="#f97316" radius={[6, 6, 0, 0]} />
            <Bar yAxisId="right" dataKey="reviews" name="Revisiones" fill="#38bdf8" radius={[6, 6, 0, 0]} />
            <Line yAxisId="left" type="monotone" dataKey="validation" name="% validacion" stroke="#059669" strokeWidth={3} dot={false} />
            <Line yAxisId="left" type="monotone" dataKey="objective" name="Objetivo 70%" stroke="#0f172a" strokeDasharray="5 5" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
