import fs from 'node:fs';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Faltan SUPABASE_URL o SUPABASE_ANON_KEY.');
}

const csvPath = new URL('./BASE_EDF.csv', import.meta.url);
const csv = fs.readFileSync(csvPath, 'utf8');

function clean(value) {
  return String(value ?? '').trim();
}

function codeKey(value) {
  return clean(value).replace(/^0+/, '') || clean(value);
}

function parseCsv(text) {
  const matrix = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => clean(value))) matrix.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => clean(value))) matrix.push(row);

  const headers = (matrix.shift() || []).map(clean);
  return matrix.map((values) => {
    const item = {};
    headers.forEach((header, index) => {
      item[header] = values[index] || '';
    });
    return item;
  });
}

async function rest(path, options = {}) {
  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || '',
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

const rows = parseCsv(csv).map((row) => ({
  client_code: codeKey(row.clientCode),
  client_name: clean(row.clientName),
  asset_number: clean(row.assetNumber),
  asset_type: clean(row.assetType || 'EDF'),
  model: clean(row.model),
  contract: clean(row.contract),
  status: clean(row.status || 'PDV'),
  source_file: clean(row.sourceFile),
  source_sheet: clean(row.sourceSheet),
  source_row: Number(row.sourceRow || 0) || null
})).filter((row) => row.client_code && row.asset_number);

await rest('edf_assets?asset_number=not.is.null', { method: 'DELETE' });
for (let index = 0; index < rows.length; index += 500) {
  await rest('edf_assets', {
    method: 'POST',
    prefer: 'return=minimal',
    body: JSON.stringify(rows.slice(index, index + 500))
  });
  console.log(`Importadas ${Math.min(index + 500, rows.length)} de ${rows.length}`);
}

const sample = await rest('edf_assets?select=id&limit=5');
console.log(`Base cargada. Filas enviadas: ${rows.length}. Muestra leida: ${sample.length}.`);
