import { formatPercent } from "../utils/dataProcessing";

export default function CriticalClients({ data }) {
  return (
    <section className="glass-panel rounded-lg p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-slate-950">Clientes criticos</h2>
        <span className="text-xs font-semibold text-slate-500">{data.length} clientes</span>
      </div>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="min-w-[980px] w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <th className="py-3">Codigo</th>
              <th>Nombre fantasia</th>
              <th>Total</th>
              <th>Validas</th>
              <th>Invalidas</th>
              <th>Anomalies</th>
              <th>% validacion</th>
              <th>Pilar critico</th>
              <th>Tarea invalida</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={`${row.client}-${row.name}`} className="border-b border-slate-100">
                <td className="py-3 font-semibold text-slate-700">{row.client}</td>
                <td className="max-w-[210px] truncate text-slate-700">{row.name}</td>
                <td>{row.total}</td>
                <td className="text-emerald-700">{row.valid}</td>
                <td className="text-rose-700">{row.invalid}</td>
                <td>{row.anomalies}</td>
                <td>
                  <span className={`rounded-full px-2 py-1 text-xs font-bold ${row.validation >= 0.7 ? "bg-emerald-100 text-emerald-700" : row.validation >= 0.6 ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"}`}>
                    {formatPercent(row.validation)}
                  </span>
                </td>
                <td>{row.criticalPillar}</td>
                <td className="max-w-[220px] truncate">{row.criticalTask}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
