import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const root = process.cwd();
const outputDir = path.join(root, "outputs", "bees-vision");
await fs.mkdir(outputDir, { recursive: true });

const workbook = Workbook.create();
const setupSheet = (name, headers, widths = []) => {
  const sheet = workbook.worksheets.add(name);
  sheet.showGridLines = false;
  sheet.getRangeByIndexes(0, 0, 1, headers.length).values = [headers];
  const header = sheet.getRangeByIndexes(0, 0, 1, headers.length);
  header.format = {
    fill: "#12385F",
    font: { bold: true, color: "#FFFFFF" },
    borders: { preset: "outside", style: "thin", color: "#0B2440" }
  };
  sheet.freezePanes.freezeRows(1);
  widths.forEach((width, index) => {
    sheet.getRangeByIndexes(0, index, 300, 1).format.columnWidthPx = width;
  });
  sheet.getRangeByIndexes(0, 0, 100, headers.length).format.wrapText = true;
  return sheet;
};

const anomalyHeaders = [
  "id",
  "fecha_carga",
  "mes",
  "promotor",
  "pilar",
  "tarea",
  "cliente",
  "foto_url",
  "accion",
  "comentario",
  "usuario",
  "estado"
];
const planHeaders = [
  "id",
  "fecha_carga",
  "mes",
  "pilar",
  "motivo",
  "plan_accion",
  "responsable",
  "fecha_compromiso",
  "estado",
  "comentario_cierre"
];
const listsHeaders = ["tipo_lista", "valor"];

const anomalySheet = setupSheet("Anomaly relevamientos", anomalyHeaders, [150, 120, 90, 150, 120, 300, 140, 260, 150, 320, 130, 120]);
const planSheet = setupSheet("Planes de accion", planHeaders, [150, 120, 90, 120, 180, 360, 150, 140, 120, 320]);
const listsSheet = setupSheet("Listas", listsHeaders, [160, 220]);

listsSheet.getRange("A2:B15").values = [
  ["accion_anomaly", "ERROR DE ALGORITMO"],
  ["accion_anomaly", "POP INVALIDO"],
  ["accion_anomaly", "FUERA DE FOCO"],
  ["accion_anomaly", "FRAUDE"],
  ["accion_anomaly", "OTRA"],
  ["estado", "ABIERTO"],
  ["estado", "EN PROCESO"],
  ["estado", "CERRADO"],
  ["pilar", "Precio"],
  ["pilar", "Disponibilidad"],
  ["pilar", "Frio"],
  ["pilar", "Sin pilar"],
  ["", ""],
  ["", ""]
];

anomalySheet.getRange("I2:I100").dataValidation = { rule: { type: "list", values: ["ERROR DE ALGORITMO", "POP INVALIDO", "FUERA DE FOCO", "FRAUDE", "OTRA"] } };
anomalySheet.getRange("L2:L100").dataValidation = { rule: { type: "list", values: ["ABIERTO", "EN PROCESO", "CERRADO"] } };
planSheet.getRange("D2:D100").dataValidation = { rule: { type: "list", values: ["Precio", "Disponibilidad", "Frio", "Sin pilar"] } };
planSheet.getRange("I2:I100").dataValidation = { rule: { type: "list", values: ["ABIERTO", "EN PROCESO", "CERRADO"] } };

anomalySheet.getRange("B2:B100").format.numberFormat = "yyyy-mm-dd hh:mm";
planSheet.getRange("B2:B100").format.numberFormat = "yyyy-mm-dd hh:mm";
planSheet.getRange("H2:H100").format.numberFormat = "yyyy-mm-dd";

const anomalyTable = anomalySheet.tables.add("A1:L100", true, "AnomalyRelevamientos");
anomalyTable.style = "TableStyleMedium2";
const planTable = planSheet.tables.add("A1:J100", true, "PlanesAccion");
planTable.style = "TableStyleMedium2";
const listTable = listsSheet.tables.add("A1:B15", true, "ListasBase");
listTable.style = "TableStyleMedium2";

const preview = await workbook.render({ sheetName: "Anomaly relevamientos", autoCrop: "all", scale: 1, format: "png" });
await fs.writeFile(path.join(outputDir, "relevamientos-template-preview.png"), new Uint8Array(await preview.arrayBuffer()));

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
const outputPath = path.join(outputDir, "BEES Vision - Relevamientos y PDA.xlsx");
await xlsx.save(outputPath);
console.log(outputPath);
