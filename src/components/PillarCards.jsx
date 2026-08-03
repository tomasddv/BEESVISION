import { formatPercent, TARGET_VALIDATION } from "../utils/dataProcessing";

const colors = {
  Frio: "from-cyan-500 to-blue-600",
  Precio: "from-emerald-500 to-teal-600",
  Disponibilidad: "from-amber-500 to-orange-600",
  "Sin pilar": "from-slate-500 to-slate-700"
};

export default function PillarCards({ data }) {
  return (
    <section className="grid gap-4 lg:grid-cols-3">
      {data.map((pillar) => (
        <article key={pillar.pillar} className="glass-panel rounded-lg p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-500">Pilar</p>
              <h3 className="text-xl font-bold text-slate-950">{pillar.pillar}</h3>
            </div>
            <div className={`rounded-full bg-gradient-to-br ${colors[pillar.pillar] || colors["Sin pilar"]} px-3 py-1 text-sm font-bold text-white`}>
              {formatPercent(pillar.validation)}
            </div>
          </div>
          <div className="mt-5 h-3 rounded-full bg-slate-200">
            <div
              className={`h-3 rounded-full bg-gradient-to-r ${colors[pillar.pillar] || colors["Sin pilar"]}`}
              style={{ width: `${Math.min(100, pillar.validation * 100)}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs text-slate-500">
            <span>0%</span>
            <span>Objetivo {formatPercent(TARGET_VALIDATION)}</span>
            <span>100%</span>
          </div>
          <div className="mt-5 grid grid-cols-4 gap-2 text-center">
            <Metric label="Validas" value={pillar.valid} />
            <Metric label="Invalidas" value={pillar.invalid} />
            <Metric label="Anomalies" value={pillar.anomalies} />
            <Metric label="Gap" value={`${(pillar.gap * 100).toFixed(1)} pp`} danger={pillar.gap < 0} />
          </div>
        </article>
      ))}
    </section>
  );
}

function Metric({ label, value, danger }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white/70 p-2">
      <p className={`text-sm font-bold ${danger ? "text-rose-600" : "text-slate-950"}`}>{value}</p>
      <p className="mt-1 text-[11px] font-semibold uppercase text-slate-500">{label}</p>
    </div>
  );
}
