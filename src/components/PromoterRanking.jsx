import { Award } from "lucide-react";
import { formatPercent } from "../utils/dataProcessing";

export default function PromoterRanking({ data }) {
  return (
    <section className="glass-panel rounded-lg p-5">
      <div className="mb-4 flex items-center gap-2">
        <Award size={18} className="text-amber-500" />
        <h2 className="text-lg font-bold text-slate-950">Ranking promotores</h2>
      </div>
      <div className="space-y-3">
        {data.slice(0, 10).map((row, index) => (
          <div key={row.promoter} className="rounded-lg border border-slate-200 bg-white/75 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-bold text-slate-800">#{index + 1} {row.promoter}</p>
                <p className="text-xs text-slate-500">{row.total} tareas · {row.anomalies} anomalies</p>
              </div>
              <span className="font-bold text-slate-950">{formatPercent(row.validation)}</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-slate-200">
              <div className="h-2 rounded-full bg-sky-600" style={{ width: `${Math.min(100, row.validation * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
