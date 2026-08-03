import { ExternalLink } from "lucide-react";
import { formatPercent } from "../utils/dataProcessing";

export default function TicketReview({ rows, kpis }) {
  return (
    <section className="glass-panel rounded-lg p-5">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-950">Revision invalidas a validas</h2>
        <p className="text-sm text-slate-500">Tickets mensuales, resultado de revision y fallas de algoritmo</p>
      </div>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Mini label="Total revision" value={kpis.total} />
        <Mini label="Revisados" value={kpis.reviewed} accent="text-emerald-700" />
        <Mini label="Pendientes" value={kpis.pending} accent="text-amber-700" />
        <Mini label="% revisado" value={formatPercent(kpis.reviewedRate)} />
        <Mini label="Fallas algoritmo" value={kpis.algorithmFixes} accent="text-sky-700" />
        <Mini label="Invalidas confirmadas" value={kpis.invalidConfirmed} accent="text-rose-700" />
        <Mini label="% correccion algoritmo" value={formatPercent(kpis.correctionRate)} />
        <Mini label="Anomaly revisadas" value={kpis.anomalyReviewed} />
      </div>
      <div className="max-h-[520px] overflow-auto scrollbar-thin">
        <table className="min-w-[1180px] w-full text-left text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <th className="py-3">Fecha</th>
              <th>Promotor</th>
              <th>Cliente</th>
              <th>POC ID</th>
              <th>Detalle tarea</th>
              <th>Revisada</th>
              <th>Resultado</th>
              <th>Anomaly</th>
              <th>Tipo anomaly</th>
              <th>Comentario</th>
              <th>Foto</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 300).map((row, index) => (
              <tr key={`${row.__sheet}-${row.__row}-${index}`} className="border-b border-slate-100 align-top">
                <td className="py-3">{row.dateKey || row.monthKey}</td>
                <td>{row.promoter}</td>
                <td className="max-w-[160px] truncate">{row.client}</td>
                <td>{row.pocId}</td>
                <td className="max-w-[260px] truncate">{row.task}</td>
                <td><Badge ok={row.reviewed === "Si"}>{row.reviewed}</Badge></td>
                <td>{row.result}</td>
                <td><Badge ok={row.anomaly}>{row.anomaly ? "Si" : "No"}</Badge></td>
                <td>{row.anomalyType}</td>
                <td className="max-w-[240px] truncate">{row.comment}</td>
                <td>
                  {row.image ? (
                    <a className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2 py-1 text-xs font-bold text-white" href={row.image} target="_blank" rel="noreferrer">
                      Ver <ExternalLink size={12} />
                    </a>
                  ) : (
                    <span className="text-slate-400">Sin foto</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Mini({ label, value, accent = "text-slate-950" }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white/75 p-3">
      <p className={`text-xl font-bold ${accent}`}>{value}</p>
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
    </div>
  );
}

function Badge({ ok, children }) {
  return (
    <span className={`rounded-full px-2 py-1 text-xs font-bold ${ok ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
      {children}
    </span>
  );
}
