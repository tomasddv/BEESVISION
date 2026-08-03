import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceDir = "C:\\Users\\triesgo\\Desktop\\relevamiento edf";
const dataDir = join(root, "public", "data");
const outputFile = join(dataDir, "assets-system.json");

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
  return [...xml.matchAll(/<si\b[\s\S]*?<\/si>/g)].map(([si]) =>
    [...si.matchAll(/<(?:\w+:)?t[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((m) => xmlText(m[1])).join("")
  );
}

function workbookSheets(zip) {
  const workbook = zip.get("xl/workbook.xml") || "";
  const rels = zip.get("xl/_rels/workbook.xml.rels") || "";
  const relMap = {};
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const a = attrs(m[0]);
    relMap[a.Id] = `xl/${a.Target.replace(/^\/?xl\//, "")}`;
  }
  return [...workbook.matchAll(/<(?:\w+:)?sheet\b[^>]*>/g)]
    .map((m) => {
      const a = attrs(m[0]);
      return { name: a.name, path: relMap[a["r:id"]] };
    })
    .filter((sheet) => sheet.path);
}

function columnIndex(letter = "") {
  let n = 0;
  for (const ch of letter) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}

function cellColumn(ref = "") {
  return ref.replace(/[0-9]/g, "");
}

function rows(zip, sheet, strings) {
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
      const inline = cellMatch[2].match(/<(?:\w+:)?is>([\s\S]*?)<\/(?:\w+:)?is>/);
      const v = cellMatch[2].match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/);
      row[index] = inline ? xmlText(inline[1]) : v ? (a.t === "s" ? strings[Number(v[1])] || "" : xmlText(v[1])) : "";
    }
    matrix.push(row);
  }
  return matrix;
}

function clean(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function latestSemaforoFile() {
  const files = readdirSync(sourceDir)
    .filter((name) => /semaforo.*\.xlsx$/i.test(name) && !name.startsWith("~$"))
    .map((name) => ({ name, path: join(sourceDir, name), mtime: statSync(join(sourceDir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (!files[0]) throw new Error(`No encontre archivo semaforo .xlsx en ${sourceDir}`);
  return files[0];
}

const source = latestSemaforoFile();
const localCopy = join(dataDir, source.name);
if (!existsSync(localCopy) || statSync(source.path).mtimeMs > statSync(localCopy).mtimeMs) copyFileSync(source.path, localCopy);

const zip = unzip(source.path);
const strings = sharedStrings(zip);
const allRows = workbookSheets(zip).flatMap((sheet) => rows(zip, sheet, strings).map((row) => ({ sheet: sheet.name, row })));

const assets = allRows
  .map(({ sheet, row }, index) => ({
    clientCode: clean(row[columnIndex("I")]),
    clientName: "",
    assetNumber: clean(row[columnIndex("Y")]),
    assetType: "EDF",
    model: clean(row[columnIndex("Q")]),
    contract: "",
    status: clean(row[columnIndex("E")]),
    sourceFile: source.name,
    sourceSheet: sheet,
    sourceRow: index + 1
  }))
  .filter((item) => item.clientCode && item.assetNumber && !/^cliente$/i.test(item.clientCode) && !/^serie$/i.test(item.assetNumber))
  .filter((item) => /pdv/i.test(item.status));

writeFileSync(outputFile, JSON.stringify(assets, null, 2), "utf8");
console.log(JSON.stringify({ source: source.name, assets: assets.length, output: outputFile }, null, 2));
