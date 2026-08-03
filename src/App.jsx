import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileSpreadsheet,
  Target,
  TrendingUp,
  XCircle
} from "lucide-react";
import AnomalyAnalytics from "./components/AnomalyAnalytics";
import CriticalClients from "./components/CriticalClients";
import Filters from "./components/Filters";
import KpiCard from "./components/KpiCard";
import PillarCards from "./components/PillarCards";
import PromoterRanking from "./components/PromoterRanking";
import TicketReview from "./components/TicketReview";
import TopTasks from "./components/TopTasks";
import TrendChart from "./components/TrendChart";
import {
  applyFilters,
  calculateMetrics,
  formatPercent,
  processDatasets,
  readExcelFile,
  uniqueOptions
} from "./utils/dataProcessing";

const DEFAULT_FILES = {
  main: "data - 2026-05-11T104007.975.xlsx",
  clients: "20260511104225plantillaClientesAR.xlsx",
  review: "DEL VALLE 2026 DISTRIS - Ticket invalidas a validas final (1).xlsx",
  anomalies: "Anomaly cierre Abril.xlsx"
};

const emptyFilters = {
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
};

export default function App() {
  const [files, setFiles] = useState({ mainRows: [], clientRows: [], reviewRows: [], anomalyRows: [] });
  const [loaded, setLoaded] = useState({});
  const [filters, setFilters] = useState(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadDefaults() {
      setLoading(true);
      const entries = await Promise.all(
        Object.entries(DEFAULT_FILES).map(async ([key, name]) => {
          try {
            const result = await readExcelFile(`/data/${encodeURIComponent(name)}`);
            return [key, result.rows, { name, rows: result.rows.length, sheets: result.sheets }];
          } catch {
            return [key, [], { name, rows: 0, sheets: [], missing: true }];
          }
        })
      );
      if (cancelled) return;
      setFiles({
        mainRows: entries.find(([key]) => key === "main")?.[1] || [],
        clientRows: entries.find(([key]) => key === "clients")?.[1] || [],
        reviewRows: entries.find(([key]) => key === "review")?.[1] || [],
        anomalyRows: entries.find(([key]) => key === "anomalies")?.[1] || []
      });
      setLoaded(Object.fromEntries(entries.map(([key, , meta]) => [key, meta])));
      setLoading(false);
    }
    loadDefaults();
    return () => {
      cancelled = true;
    };
  }, []);

  const processed = useMemo(() => processDatasets(files), [files]);
  const filteredTasks = useMemo(() => applyFilters(processed.tasks, filters), [processed.tasks, filters]);
  const filteredReviews = useMemo(() => applyFilters(processed.reviews, filters), [processed.reviews, filters]);
  const filteredAnomalies = useMemo(() => applyFilters(processed.anomalies, filters), [processed.anomalies, filters]);
  const metrics = useMemo(
    () => calculateMetrics(filteredTasks, filteredReviews, filteredAnomalies),
    [filteredTasks, filteredReviews, filteredAnomalies]
  );

  const options = useMemo(() => {
    const allRows = [...processed.tasks, ...processed.reviews];
    return {
      months: uniqueOptions(allRows, "monthKey"),
      pillars: uniqueOptions(processed.tasks, "pillar"),
      promoters: uniqueOptions(allRows, "promoter"),
      supervisors: uniqueOptions(processed.tasks, "supervisor"),
      clients: uniqueOptions([...processed.tasks.map((row) => ({ client: row.clientCode })), ...processed.reviews], "client"),
      tasks: uniqueOptions(allRows, "task"),
      results: uniqueOptions(processed.reviews, "result"),
      anomalyTypes: uniqueOptions(allRows, "anomalyType")
    };
  }, [processed]);

  const loadManual = async (key, file) => {
    if (!file) return;
    try {
      setError("");
      const result = await readExcelFile(file);
      const rowKey = key === "main" ? "mainRows" : key === "clients" ? "clientRows" : key === "review" ? "reviewRows" : "anomalyRows";
      setFiles((current) => ({ ...current, [rowKey]: result.rows }));
      setLoaded((current) => ({ ...current, [key]: { name: file.name, rows: result.rows.length, sheets: result.sheets } }));
    } catch (event) {
      setError(event.message || "No se pudo leer el archivo");
    }
  };

  const semaphore =
    metrics.executive.validation >= 0.7 ? "green" : metrics.executive.validation >= 0.6 ? "amber" : "red";
  const statusLabel = semaphore === "green" ? "En objetivo" : semaphore === "amber" ? "Cerca del objetivo" : "Bajo objetivo";

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dbeafe,transparent_32%),linear-gradient(180deg,#f8fafc,#e8eef5)] px-4 py-6 text-slate-800 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="overflow-hidden rounded-lg bg-slate-950 text-white shadow-premium">
          <div className="grid gap-6 p-6 lg:grid-cols-[1fr_auto] lg:p-8">
            <div>
              <p className="mb-3 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase text-sky-100">
                Auditoria Galaxia · BEES Vision
              </p>
              <h1 className="text-3xl font-black leading-tight lg:text-5xl">Dashboard BEES Vision — Auditoría Galaxia</h1>
              <p className="mt-3 max-w-3xl text-base text-slate-300 lg:text-lg">
                Puntos 3 y 4 — Validación, Oportunidades y Revisión de Anomalías
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/10 p-5">
              <p className="text-sm font-semibold text-slate-300">Semaforo ejecutivo</p>
              <div className="mt-3 flex items-center gap-3">
                <span className={`h-4 w-4 rounded-full ${semaphore === "green" ? "bg-emerald-400" : semaphore === "amber" ? "bg-amber-400" : "bg-rose-400"}`} />
                <span className="text-2xl font-black">{statusLabel}</span>
              </div>
              <p className="mt-2 text-sm text-slate-300">Objetivo general: 70%</p>
            </div>
          </div>
        </header>

        <section className="glass-panel rounded-lg p-5">
          <div className="mb-4 flex items-center gap-2">
            <FileSpreadsheet size={18} className="text-sky-600" />
            <h2 className="text-lg font-bold text-slate-950">Carga de archivos Excel</h2>
          </div>
          <div className="grid gap-3 lg:grid-cols-4">
            <Uploader label="Archivo principal" meta={loaded.main} onChange={(file) => loadManual("main", file)} />
            <Uploader label="Maestro clientes" meta={loaded.clients} onChange={(file) => loadManual("clients", file)} />
            <Uploader label="Revision invalidas" meta={loaded.review} onChange={(file) => loadManual("review", file)} />
            <Uploader label="Anomalies" meta={loaded.anomalies} onChange={(file) => loadManual("anomalies", file)} />
          </div>
          {loading ? <p className="mt-3 text-sm text-slate-500">Cargando archivos desde public/data...</p> : null}
          {error ? <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p> : null}
        </section>

        <Filters filters={filters} setFilters={setFilters} options={options} />

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard title="% Validacion General" value={formatPercent(metrics.executive.validation)} subtitle={statusLabel} tone={semaphore} icon={TrendingUp} />
          <KpiCard title="Objetivo" value="70.0%" subtitle="Meta general" tone="blue" icon={Target} />
          <KpiCard title="Gap vs objetivo" value={`${(metrics.executive.gap * 100).toFixed(1)} pp`} subtitle="Diferencia contra meta" tone={metrics.executive.gap >= 0 ? "green" : "red"} delta={metrics.executive.gap} />
          <KpiCard title="Total tareas" value={metrics.executive.total} subtitle="Registros analizados" icon={Database} />
          <KpiCard title="Tareas validas" value={metrics.executive.valid} subtitle="Columna P = 1" tone="green" icon={CheckCircle2} />
          <KpiCard title="Tareas invalidas" value={metrics.executive.invalid} subtitle="Columna P = 0" tone="red" icon={XCircle} />
          <KpiCard title="Total anomalies" value={metrics.executive.anomalies} subtitle="Cruce por imagen/link" tone="red" icon={AlertTriangle} />
          <KpiCard title="% anomaly" value={formatPercent(metrics.executive.anomalyRate)} subtitle="Sobre tareas" tone="amber" />
          <KpiCard title="Tickets revisados" value={metrics.executive.reviewed} subtitle="Comentario informado" icon={ClipboardCheck} />
          <KpiCard title="Fallas algoritmo corregidas" value={metrics.executive.algorithmFixes} subtitle="Valida, falla algoritmo" tone="green" />
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-black text-slate-950">Punto 3 · Oportunidades por pilar</h2>
            <p className="text-sm text-slate-500">Validacion, gaps, tareas criticas, clientes y promotores.</p>
          </div>
          <PillarCards data={metrics.byPillar} />
          <div className="grid gap-5 xl:grid-cols-2">
            <TopTasks title="Top 5 tareas invalidas" data={metrics.topInvalidTasks} variant="invalid" />
            <TopTasks title="Top 5 tareas validadas" data={metrics.topValidTasks} variant="valid" />
          </div>
          <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
            <CriticalClients data={metrics.criticalClients} />
            <PromoterRanking data={metrics.promoterRanking} />
          </div>
          <TrendChart data={metrics.trend} />
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-black text-slate-950">Punto 4 · Revisión invalidas a validas</h2>
            <p className="text-sm text-slate-500">Clasificacion por comentario: falla de algoritmo, invalida confirmada o pendiente.</p>
          </div>
          <TicketReview rows={filteredReviews} kpis={metrics.reviewKpis} />
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-black text-slate-950">Control y analisis de anomalies</h2>
            <p className="text-sm text-slate-500">Distribucion, heatmap operativo, ranking y tendencia.</p>
          </div>
          <AnomalyAnalytics data={metrics.anomaly} />
        </section>
      </div>
    </main>
  );
}

function Uploader({ label, meta, onChange }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white/75 p-3">
      <p className="font-bold text-slate-800">{label}</p>
      <p className="mt-1 min-h-10 text-xs text-slate-500">
        {meta?.missing ? "No encontrado en public/data" : meta?.name ? `${meta.name} · ${meta.rows} filas` : "Sin cargar"}
      </p>
      <label className="mt-3 inline-flex cursor-pointer rounded-md bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700">
        Cargar Excel
        <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(event) => onChange(event.target.files?.[0])} />
      </label>
    </div>
  );
}
