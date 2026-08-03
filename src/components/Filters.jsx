export default function Filters({ filters, setFilters, options }) {
  const update = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const clear = () =>
    setFilters({
      dateFrom: "",
      dateTo: "",
      month: "",
      pillar: "",
      promoter: "",
      supervisor: "",
      client: "",
      task: "",
      reviewed: "",
      result: "",
      anomaly: "",
      anomalyType: ""
    });

  return (
    <section className="glass-panel rounded-lg p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-slate-950">Filtros globales</h2>
        <button onClick={clear} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100">
          Limpiar
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Input label="Desde" type="date" value={filters.dateFrom} onChange={(value) => update("dateFrom", value)} />
        <Input label="Hasta" type="date" value={filters.dateTo} onChange={(value) => update("dateTo", value)} />
        <Select label="Mes" value={filters.month} onChange={(value) => update("month", value)} options={options.months} />
        <Select label="Pilar" value={filters.pillar} onChange={(value) => update("pillar", value)} options={options.pillars} />
        <Select label="Promotor" value={filters.promoter} onChange={(value) => update("promoter", value)} options={options.promoters} />
        <Select label="Supervisor" value={filters.supervisor} onChange={(value) => update("supervisor", value)} options={options.supervisors} />
        <Select label="Cliente" value={filters.client} onChange={(value) => update("client", value)} options={options.clients} />
        <Select label="Tarea" value={filters.task} onChange={(value) => update("task", value)} options={options.tasks} />
        <Select label="Revisada" value={filters.reviewed} onChange={(value) => update("reviewed", value)} options={["Si", "No"]} />
        <Select label="Resultado revision" value={filters.result} onChange={(value) => update("result", value)} options={options.results} />
        <Select label="Anomaly" value={filters.anomaly} onChange={(value) => update("anomaly", value)} options={["Si", "No"]} />
        <Select label="Tipo anomaly" value={filters.anomalyType} onChange={(value) => update("anomalyType", value)} options={options.anomalyTypes} />
      </div>
    </section>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="grid gap-1 text-sm font-semibold text-slate-600">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100">
        <option value="">Todos</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function Input({ label, value, onChange, type }) {
  return (
    <label className="grid gap-1 text-sm font-semibold text-slate-600">
      {label}
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" />
    </label>
  );
}
