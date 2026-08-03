import fs from 'node:fs';

const sourcePath = new URL('../public/data/assets-system.json', import.meta.url);
const outputPath = new URL('../cloud-google-apps-script/BASE_EDF.csv', import.meta.url);
const raw = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const rows = raw.assets || raw;
const headers = [
  'clientCode',
  'clientName',
  'assetNumber',
  'assetType',
  'model',
  'contract',
  'status',
  'sourceFile',
  'sourceSheet',
  'sourceRow'
];

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

const csv = [
  headers.join(','),
  ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(','))
].join('\r\n');

fs.writeFileSync(outputPath, csv, 'utf8');
console.log(`Exported ${rows.length} rows to ${outputPath.pathname}`);
