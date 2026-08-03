import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { join } from "node:path";

function unzip(file) {
  const buffer = readFileSync(file);
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  const entries = buffer.readUInt16LE(eocd + 10);
  const cdOffset = buffer.readUInt32LE(eocd + 16);
  const out = new Map();
  let pos = cdOffset;
  for (let i = 0; i < entries; i += 1) {
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
    const content = buffer.subarray(start, start + compressedSize);
    out.set(name, (method === 0 ? content : inflateRawSync(content)).toString("utf8"));
    pos += 46 + fileNameLength + extraLength + commentLength;
  }
  return out;
}
const attrs = (tag) => Object.fromEntries([...tag.matchAll(/([A-Za-z_:][\w:.-]*)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
const text = (v = "") => v.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const colIndex = (l = "") => [...l].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
const col = (r = "") => r.replace(/[0-9]/g, "");

function shared(zip) {
  const xml = zip.get("xl/sharedStrings.xml") || "";
  return [...xml.matchAll(/<si\b[\s\S]*?<\/si>/g)].map((m) => [...m[0].matchAll(/<(?:\w+:)?t[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((t) => text(t[1])).join(""));
}
function sheetPath(zip, name) {
  const wb = zip.get("xl/workbook.xml");
  const rels = zip.get("xl/_rels/workbook.xml.rels");
  const relMap = {};
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const a = attrs(m[0]);
    relMap[a.Id] = `xl/${a.Target.replace(/^\/?xl\//, "")}`;
  }
  for (const m of wb.matchAll(/<(?:\w+:)?sheet\b[^>]*>/g)) {
    const a = attrs(m[0]);
    if (String(a.name).toLowerCase() === name) return relMap[a["r:id"]];
  }
}
function rows(zip, path, strings) {
  const xml = zip.get(path);
  const out = [];
  for (const rm of xml.matchAll(/<(?:\w+:)?row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g)) {
    const row = [];
    let seq = 0;
    for (const cm of rm[1].matchAll(/<(?:\w+:)?c\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?c>/g)) {
      const a = attrs(cm[0]);
      const idx = a.r ? colIndex(col(a.r)) : seq;
      seq = idx + 1;
      const inline = cm[2].match(/<(?:\w+:)?is>([\s\S]*?)<\/(?:\w+:)?is>/);
      const v = cm[2].match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/);
      row[idx] = inline ? text(inline[1]) : v ? (a.t === "s" ? strings[Number(v[1])] : text(v[1])) : "";
    }
    out.push(row);
  }
  return out;
}
const zip = unzip(join(process.cwd(), "public", "data", "Anomaly cierre Abril.xlsx"));
const data = rows(zip, sheetPath(zip, "base"), shared(zip));
console.log(JSON.stringify({ headers: data[0], sample: data.slice(1, 8) }, null, 2));
