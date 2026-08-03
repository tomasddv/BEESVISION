import { ArrowDownRight, ArrowUpRight } from "lucide-react";

const toneMap = {
  green: "border-emerald-200 bg-emerald-50 text-emerald-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  red: "border-rose-200 bg-rose-50 text-rose-700",
  blue: "border-sky-200 bg-sky-50 text-sky-700",
  slate: "border-slate-200 bg-slate-50 text-slate-700"
};

export default function KpiCard({ title, value, subtitle, tone = "slate", delta, icon: Icon }) {
  const DeltaIcon = Number(delta) >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <article className="glass-panel rounded-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
        </div>
        {Icon ? (
          <div className={`rounded-lg border p-2 ${toneMap[tone] || toneMap.slate}`}>
            <Icon size={18} />
          </div>
        ) : null}
      </div>
      <div className="mt-3 flex min-h-5 items-center justify-between gap-2 text-xs text-slate-500">
        <span>{subtitle}</span>
        {delta !== undefined ? (
          <span className={`inline-flex items-center gap-1 font-semibold ${Number(delta) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            <DeltaIcon size={14} />
            {Math.abs(Number(delta) * 100).toFixed(1)} pp
          </span>
        ) : null}
      </div>
    </article>
  );
}
