import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { createHash } from "node:crypto";

const root = process.cwd();
const dataDir = join(root, "public", "data");

const wanted = {
  clients: "20260511104225plantillaClientesAR.xlsx"
};

function unzip(file) {
  const buffer = readFileSync(file);
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error(`No ZIP footer in ${file}`);
  const entries = buffer.readUInt16LE(eocd + 10);
  const cdOffset = buffer.readUInt32LE(eocd + 16);
  const out = new Map();
  let pos = cdOffset;
  for (let i = 0; i < entries; i += 1) {
    if (buffer.readUInt32LE(pos) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(pos + 10);
    const compressedSize = buffer.readUInt32LE(pos + 20);
    const fileNameLength = buffer.readUInt16LE(pos + 28);
    const extraLength = buffer.readUInt16LE(pos + 30);
    const commentLength = buffer.readUInt16LE(pos + 32);
    const localOffset = buffer.readUInt32LE(pos + 42);
    const name = buffer.toString("utf8", pos + 46, pos + 46 + fileNameLength);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(start, start + compressedSize);
    const content = method === 0 ? compressed : inflateRawSync(compressed);
    out.set(name, content.toString("utf8"));
    pos += 46 + fileNameLength + extraLength + commentLength;
  }
  return out;
}

function attrs(tag) {
  const result = {};
  for (const match of tag.matchAll(/([A-Za-z_:][\w:.-]*)="([^"]*)"/g)) result[match[1]] = match[2];
  return result;
}

function xmlText(value = "") {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function sharedStrings(zip) {
  const xml = zip.get("xl/sharedStrings.xml");
  if (!xml) return [];
  return [...xml.matchAll(/<si\b[\s\S]*?<\/si>/g)].map(([si]) => {
    const texts = [...si.matchAll(/<(?:\w+:)?t[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((m) => xmlText(m[1]));
    return texts.join("");
  });
}

function workbookSheets(zip) {
  const workbook = zip.get("xl/workbook.xml") || "";
  const rels = zip.get("xl/_rels/workbook.xml.rels") || "";
  const relMap = {};
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const a = attrs(m[0]);
    relMap[a.Id] = `xl/${a.Target.replace(/^\/?xl\//, "")}`;
  }
  return [...workbook.matchAll(/<(?:\w+:)?sheet\b[^>]*>/g)].map((m) => {
    const a = attrs(m[0]);
    return { name: a.name, path: relMap[a["r:id"]] };
  }).filter((sheet) => sheet.path);
}

function colLetter(index) {
  let s = "";
  let n = index + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - m) / 26);
  }
  return s;
}

function cellColumn(ref = "") {
  return ref.replace(/[0-9]/g, "");
}

function columnIndex(letter = "") {
  let n = 0;
  for (const ch of letter) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}

function sheetRows(zip, sheet, strings, options = {}) {
  const xml = zip.get(sheet.path);
  if (!xml) return [];
  const matrix = [];
  for (const rowMatch of xml.matchAll(/<(?:\w+:)?row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g)) {
    const row = [];
    let sequentialIndex = 0;
    for (const cellMatch of rowMatch[1].matchAll(/<(?:\w+:)?c\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?c>/g)) {
      const a = attrs(cellMatch[0]);
      const index = a.r ? columnIndex(cellColumn(a.r)) : sequentialIndex;
      sequentialIndex = index + 1;
      let value = "";
      const inline = cellMatch[2].match(/<(?:\w+:)?is>([\s\S]*?)<\/(?:\w+:)?is>/);
      const v = cellMatch[2].match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/);
      if (inline) value = xmlText(inline[1]);
      else if (v) value = a.t === "s" ? strings[Number(v[1])] || "" : xmlText(v[1]);
      row[index] = value;
    }
    matrix.push(row);
  }
  const headerIndex = Math.max(
    0,
    options.headerIncludes
      ? matrix.findIndex((row) =>
          options.headerIncludes.every((header) =>
            row.some((cell) => String(cell || "").trim().toLowerCase() === header.toLowerCase())
          )
        )
      : matrix.findIndex((row) => row.filter((cell) => String(cell || "").trim()).length >= 3)
  );
  const headers = matrix[headerIndex] || [];
  return matrix.slice(headerIndex + 1).map((row, rowIndex) => {
    const item = { __sheet: sheet.name, __row: rowIndex + headerIndex + 2 };
    row.forEach((cell, index) => {
      item[`__${colLetter(index)}`] = cell ?? "";
      const header = String(headers[index] ?? "").trim();
      if (header) item[header] = cell ?? "";
    });
    return item;
  });
}

function readXlsx(name, options = {}) {
  const file = join(dataDir, name);
  const zip = unzip(file);
  const strings = sharedStrings(zip);
  const sheetMatches = (sheet) => {
    if (!options.sheet) return true;
    if (Array.isArray(options.sheet)) return options.sheet.some((name) => sheet.name.toLowerCase() === name.toLowerCase());
    if (options.sheet instanceof RegExp) return options.sheet.test(sheet.name);
    return sheet.name.toLowerCase() === options.sheet.toLowerCase();
  };
  return workbookSheets(zip)
    .filter(sheetMatches)
    .flatMap((sheet) => sheetRows(zip, sheet, strings, options));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  const headers = rows.shift()?.map((header) => header.trim()) || [];
  return rows
    .filter((values) => values.some((value) => String(value || "").trim()))
    .map((values, index) => {
      const item = { __row: index + 2 };
      headers.forEach((header, column) => {
        item[header] = values[column] ?? "";
      });
      return item;
    });
}

function readCsv(name) {
  return parseCsv(readFileSync(join(dataDir, name), "utf8")).map((row) => ({ ...row, __sourceFile: name }));
}

const found = readdirSync(dataDir);
const latestReviewFile = found
  .filter((name) =>
    /^DEL VALLE 2026 DISTRIS - Ticket invalidas a validas final.*\.xlsx$/i.test(name) ||
    /^Q3\.\s*2026\s+DEL VALLE - Ticket tareas.*\.xlsx$/i.test(name)
  )
  .sort((a, b) => statSync(join(dataDir, b)).mtimeMs - statSync(join(dataDir, a)).mtimeMs)[0];
wanted.review = latestReviewFile || "DEL VALLE 2026 DISTRIS - Ticket invalidas a validas final (1).xlsx";
const fixedFiles = new Set([...Object.values(wanted)]);
const taskCandidates = found
  .filter((name) => /^(TAREAS\b.*|data\b.*)\.xlsx$/i.test(name))
  .filter((name) => !fixedFiles.has(name) && !/^Anomaly.*\.xlsx$/i.test(name))
  .sort((a, b) => {
    const taskA = /^TAREAS\b/i.test(a);
    const taskB = /^TAREAS\b/i.test(b);
    if (taskA !== taskB) return taskA ? -1 : 1;
    return a.localeCompare(b, "es");
  });
const seenTaskHashes = new Set();
const taskFiles = taskCandidates.filter((name) => {
  const hash = createHash("sha1").update(readFileSync(join(dataDir, name))).digest("hex");
  if (seenTaskHashes.has(hash)) return false;
  seenTaskHashes.add(hash);
  return true;
});

function dateKey(value) {
  if (!value) return "";
  const raw = String(value).trim();
  const ymd = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  const serial = Number(raw);
  const numericDate = Number.isFinite(serial) ? String(Math.round(serial)) : "";
  const numericYmd = numericDate.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (numericYmd) return `${numericYmd[1]}-${numericYmd[2]}-${numericYmd[3]}`;
  if (Number.isFinite(serial) && serial > 30000 && serial < 70000) {
    return new Date((serial - 25569) * 86400 * 1000).toISOString().slice(0, 10);
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.valueOf())) return parsed.toISOString().slice(0, 10);
  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  return dmy ? `${dmy[3].length === 2 ? "20" + dmy[3] : dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}` : "";
}

function dominantMonth(rows, name) {
  const counts = {};
  for (const row of rows) {
    const key = dateKey(row.Fecha || row.fecha || row.__A || row["FECHA EJECUCION"]);
    if (key) counts[key.slice(0, 7)] = (counts[key.slice(0, 7)] || 0) + 1;
  }
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (dominant) return dominant;
  const months = {
    marzo: "2026-03",
    abril: "2026-04",
    mayo: "2026-05",
    junio: "2026-06",
    julio: "2026-07",
    agosto: "2026-08",
    septiembre: "2026-09",
    octubre: "2026-10",
    noviembre: "2026-11",
    diciembre: "2026-12"
  };
  const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return Object.entries(months).find(([month]) => normalized.includes(month))?.[1] || name;
}

function fileMonth(name) {
  const months = {
    marzo: "2026-03",
    abril: "2026-04",
    mayo: "2026-05",
    junio: "2026-06",
    julio: "2026-07",
    agosto: "2026-08",
    septiembre: "2026-09",
    octubre: "2026-10",
    noviembre: "2026-11",
    diciembre: "2026-12"
  };
  const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return Object.entries(months).find(([month]) => normalized.includes(month))?.[1] || "";
}

const taskFileRows = taskFiles.map((name) => ({
  name,
  rows: readXlsx(name).map((row) => ({ ...row, __sourceFile: name })),
  month: null,
  mtime: statSync(join(dataDir, name)).mtimeMs
}));

for (const file of taskFileRows) file.month = dominantMonth(file.rows, file.name);

const selectedTaskFiles = Object.values(
  taskFileRows.reduce((acc, file) => {
    if (!acc[file.month] || file.mtime > acc[file.month].mtime) acc[file.month] = file;
    return acc;
  }, {})
).sort((a, b) => a.name.localeCompare(b.name, "es"));

const previousMainRows = (() => {
  try {
    return JSON.parse(readFileSync(join(dataDir, "dashboard-data.json"), "utf8")).main || [];
  } catch {
    return [];
  }
})();

const payload = {
  main: selectedTaskFiles
    .flatMap((file) => file.rows)
    .filter((row) => String(row["Pilar de la Liga"] || row.__K || "").trim())
};

for (const file of selectedTaskFiles) {
  const currentRows = payload.main.filter((row) => row.__sourceFile === file.name);
  if (currentRows.length) continue;
  const preservedRows = previousMainRows.filter((row) => row.__sourceFile === file.name);
  if (preservedRows.length) payload.main.push(...preservedRows);
}

for (const [key, name] of Object.entries(wanted)) {
  if (!found.includes(name)) {
    payload[key] = [];
    continue;
  }
  payload[key] = readXlsx(
    name,
    key === "clients"
      ? { sheet: "Clientes", headerIncludes: ["Cliente", "Nombre de fantasia"] }
      : key === "review"
        ? { sheet: /^(?:(?:DEL\s+)?VALLE\s+(0[3-9]|1[0-2])|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)$/i }
        : {}
  );
}
payload.review = payload.review.filter((row) =>
  [
    "PROMOTOR",
    "Promotor",
    "FECHA EJECUCION",
    "Fecha",
    "POC ID",
    "DETALLE TAREA",
    "Detalle Tarea",
    "IMAGEN",
    "Imagen",
    "Foto",
    "Status"
  ].some((key) => String(row[key] || "").trim())
);

const anomalyFileRows = found
  .filter((name) => /^(Anomaly|Anomalias|Anomalías).*\.xlsx$/i.test(name))
  .map((name) => ({
    name,
    rows: readXlsx(name, { sheet: "base" }).map((row) => ({ ...row, __sourceFile: name })),
    month: null,
    mtime: statSync(join(dataDir, name)).mtimeMs
  }));
for (const file of anomalyFileRows) file.month = fileMonth(file.name) || dominantMonth(file.rows, file.name);
const selectedAnomalyFiles = Object.values(
  anomalyFileRows.reduce((acc, file) => {
    if (!acc[file.month] || file.mtime > acc[file.month].mtime) acc[file.month] = file;
    return acc;
  }, {})
);
payload.anomalies = selectedAnomalyFiles.flatMap((file) => file.rows);

payload.anomalies = payload.anomalies.filter((row) =>
  String(row.distribuidor || "").toLowerCase().includes("del valle")
);

payload.planned = found
  .filter((name) => /^\d{4}-\d{2}-\d{2}\s+Tareas Distris.*\.csv$/i.test(name))
  .flatMap((name) => readCsv(name))
  .filter((row) => /del\s*valle/i.test(String(row.desc_ddc_wh || "")))
  .filter((row) => String(row.PILAR || "").trim().toUpperCase() === "EXECUTION")
  .map((row) => {
    const plannedDate = dateKey(row.dia);
    return { ...row, __dateKey: plannedDate, __monthKey: plannedDate.slice(0, 7) };
  });

const pick = (row, keys) => {
  const item = {};
  for (const key of keys) if (row[key] !== undefined) item[key] = row[key];
  return item;
};

const imageKey = (value = "") => {
  const text = String(value || "");
  return text.match(/photo_[A-Za-z0-9-]+/)?.[0] || text;
};

const compact = {
  main: payload.main.map((row) => {
    const item = pick(row, [
      "__A",
      "__G",
      "Promotor",
      "__I",
      "__D",
      "idcliente",
      "fantacli",
      "Pilar de la Liga",
      "__N",
      "__P",
      "__Q",
      "Imagen",
      "__sourceFile"
    ]);
    if (item.Imagen) item.Imagen = imageKey(item.Imagen);
    return item;
  }),
  clients: payload.clients.map((row) =>
    pick(row, [
      "__I",
      "POC ID",
      "Codigo Cliente",
      "codigo cliente",
      "cod cliente",
      "Nombre Fantasia",
      "Nombre de fantasia",
      "nombre fantasia",
      "Fantasia",
      "fantasia",
      "Razon Social",
      "razon social",
      "Cliente",
      "cliente",
      "Vendedor",
      "vendedor",
      "Supervisor",
      "supervisor",
      "Zona",
      "zona"
    ])
  ),
  review: payload.review.map((row) =>
    pick(row, [
      "__sheet",
      "__row",
      "COD DISTRI",
      "DISTRI",
      "Distri/Directa ID",
      "Distri/Directa",
      "PROMOTOR",
      "Promotor",
      "FECHA EJECUCION",
      "Fecha",
      "POC ID",
      "DETALLE TAREA",
      "Detalle Tarea",
      "IMAGEN",
      "Imagen",
      "FOTO",
      "Foto",
      "Status",
      "STATUS",
      "Comentario",
      "Cliente"
    ])
  ),
  anomalies: payload.anomalies.map((row) =>
    pick(row, [
      "vendor_account_id",
      "bdr_id",
      "task_executed_datetime",
      "task_name",
      "photo_image_url",
      "anomaly_detected",
      "distribuidor",
      "region",
      "__sourceFile",
      "link imagen",
      "Link Imagen",
      "imagen",
      "Imagen",
      "image url",
      "Image URL",
      "image",
      "Image",
      "foto",
      "Foto",
      "url",
      "URL",
      "tipo anomaly",
      "Tipo anomaly",
      "tipo anomalia",
      "Tipo Anomalia",
      "anomaly type",
      "motivo",
      "Motivo",
      "reason",
      "promotor",
      "Promotor",
      "tarea",
      "Tarea",
      "detalle tarea",
      "Detalle Tarea",
      "pilar",
      "Pilar",
      "Pilar de la Liga",
      "fecha",
      "Fecha",
      "fecha ejecucion",
      "Fecha Ejecucion"
    ])
  ),
  planned: payload.planned.map((row) =>
    pick(row, [
      "__sourceFile",
      "__dateKey",
      "__monthKey",
      "dia",
      "PROMOTOR",
      "desc_ddc_wh",
      "PILAR",
      "TAREA",
      "supervisor",
      "cliente_id",
      "CANTIDAD_TAREAS",
      "TAREAS_VALIDADAS",
      "justificacion",
      "tarea_id"
    ])
  )
};

writeFileSync(join(dataDir, "dashboard-data.json"), JSON.stringify(compact), "utf8");
console.log(JSON.stringify(Object.fromEntries(Object.entries(compact).map(([key, rows]) => [key, rows.length])), null, 2));
