import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const dataDir = join(root, "public", "data");
const source = JSON.parse(readFileSync(join(dataDir, "dashboard-data.json"), "utf8"));

function dateKey(value) {
  if (!value) return "";
  const raw = String(value).trim();
  const ymd = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  if (!Number.isNaN(Number(value)) && Number(value) > 30000 && Number(value) < 70000) {
    const d = new Date((Number(value) - 25569) * 86400 * 1000);
    return d.toISOString().slice(0, 10);
  }
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  const m = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  return m ? `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
}

function monthKey(value, sheet = "") {
  const date = dateKey(value);
  if (date) return date.slice(0, 7);
  const sheetMonth = String(sheet || "").match(/(\d{1,2})/);
  return sheetMonth ? `2026-${sheetMonth[1].padStart(2, "0")}` : "";
}

const months = [...new Set(source.main.map((row) => monthKey(row.Fecha || row.__A, row.__sheet)).filter(Boolean))].sort();
const currentMonth = months.at(-1) || "";
const current = {
  ...source,
  main: source.main.filter((row) => monthKey(row.Fecha || row.__A, row.__sheet) === currentMonth),
  review: source.review.filter((row) => monthKey(row["FECHA EJECUCION"] || row.Fecha || row.__A, row.__sheet) === currentMonth),
  anomalies: source.anomalies.filter((row) => monthKey(row.task_executed_datetime || row.fecha || row.Fecha, row.__sheet || row.__sourceFile) === currentMonth),
  __months: months,
  __currentMonth: currentMonth
};

writeFileSync(join(dataDir, "dashboard-current.json"), JSON.stringify(current), "utf8");
console.log(JSON.stringify({
  currentMonth,
  main: current.main.length,
  review: current.review.length,
  anomalies: current.anomalies.length
}, null, 2));
