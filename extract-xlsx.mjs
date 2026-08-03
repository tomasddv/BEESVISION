import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";

const root = process.cwd();
const dataDir = join(root, "public", "data");

const wanted = {
  main: "data - 2026-05-11T104007.975.xlsx",
  clients: "20260511104225plantillaClientesAR.xlsx",
  review: "DEL VALLE 2026 DISTRIS - Ticket invalidas a validas final (1).xlsx",
  anomalies: "Anomaly cierre Abril.xlsx"
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

function sheetRows(zip, sheet, strings) {
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
  const headerIndex = Math.max(0, matrix.findIndex((row) => row.filter((cell) => String(cell || "").trim()).length >= 3));
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
  return workbookSheets(zip)
    .filter((sheet) => !options.sheet || sheet.name.toLowerCase() === options.sheet.toLowerCase())
    .flatMap((sheet) => sheetRows(zip, sheet, strings));
}

const found = readdirSync(dataDir);
const payload = {};
for (const [key, name] of Object.entries(wanted)) {
  if (!found.includes(name)) {
    payload[key] = [];
    continue;
  }
  payload[key] = readXlsx(name, key === "anomalies" ? { sheet: "base" } : {});
}

payload.anomalies = payload.anomalies.filter((row) =>
  String(row.distribuidor || "").toLowerCase().includes("del valle")
);

const pick = (row, keys) => {
  const item = {};
  for (const key of keys) if (row[key] !== undefined) item[key] = row[key];
  return item;
};

const compact = {
  main: payload.main.map((row) =>
    pick(row, [
      "__A",
      "Fecha",
      "__G",
      "Promotor",
      "__I",
      "POC ID",
      "__K",
      "Pilar de la Liga",
      "__N",
      "Detalle Tarea",
      "__P",
      "Validada",
      "__R",
      "Imagen",
      "__S",
      "textoUrl",
      "__T",
      "Visita Valida"
    ])
  ),
  clients: payload.clients.map((row) =>
    pick(row, [
      "__I",
      "POC ID",
      "Codigo Cliente",
      "codigo cliente",
      "cod cliente",
      "Nombre Fantasia",
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
      "PROMOTOR",
      "FECHA EJECUCION",
      "POC ID",
      "DETALLE TAREA",
      "IMAGEN",
      "Foto",
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
  )
};

writeFileSync(join(dataDir, "dashboard-data.json"), JSON.stringify(compact), "utf8");
console.log(JSON.stringify(Object.fromEntries(Object.entries(compact).map(([key, rows]) => [key, rows.length])), null, 2));
