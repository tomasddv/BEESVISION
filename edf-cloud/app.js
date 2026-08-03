const STORAGE_KEY = 'edf-cloud-config';
const APP_PIN = 'galaxia2026';

const state = {
  config: loadConfig(),
  assets: [],
  surveys: [],
  surveyItems: [],
  currentClient: '',
  checks: []
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const clean = (value) => String(value ?? '').trim();
const codeKey = (value) => clean(value).replace(/^0+/, '') || clean(value);
const serialKey = (value) => clean(value).toUpperCase().replace(/\s+/g, '');

function loadConfig() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveConfig() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.config));
}

function boot() {
  $('#supabaseUrl').value = state.config.url || '';
  $('#supabaseKey').value = state.config.key || '';
  $('#appPin').value = state.config.pin || '';
  const ready = Boolean(state.config.url && state.config.key && state.config.pin === APP_PIN);
  $('#setupView').classList.toggle('hidden', ready);
  $('#appView').classList.toggle('hidden', !ready);
  if (ready) refreshAll().catch((error) => {
    console.error(error);
    $('#setupView').classList.remove('hidden');
    $('#appView').classList.add('hidden');
    toast('No se pudo conectar. Revisá URL y anon key.');
  });
}

function supabase(path, options = {}) {
  const url = `${state.config.url.replace(/\/$/, '')}/rest/v1/${path}`;
  return fetch(url, {
    ...options,
    headers: {
      apikey: state.config.key,
      Authorization: `Bearer ${state.config.key}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || '',
      ...(options.headers || {})
    }
  }).then(async (response) => {
    if (!response.ok) throw new Error(await response.text());
    if (response.status === 204) return null;
    return response.json();
  });
}

async function refreshAll() {
  toast('Actualizando...');
  const [assets, surveys, surveyItems] = await Promise.all([
    supabaseAll('edf_assets?select=*&order=client_code.asc'),
    supabaseAll('edf_surveys?select=*&order=created_at.desc'),
    supabaseAll('edf_survey_items?select=*&order=created_at.desc')
  ]);
  state.assets = assets || [];
  state.surveys = surveys || [];
  state.surveyItems = surveyItems || [];
  renderBase();
  renderReport();
  toast('Listo');
}

async function supabaseAll(path) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const page = await supabase(path, {
      headers: { Range: `${from}-${from + pageSize - 1}` }
    });
    rows.push(...(page || []));
    if (!page || page.length < pageSize) break;
  }
  return rows;
}

function showTab(tab) {
  $$('.view').forEach((view) => view.classList.toggle('hidden', view.id !== tab));
  $$('[data-tab]').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
  if (tab === 'report') renderReport();
  if (tab === 'base') renderBase();
}

function searchClient() {
  state.currentClient = codeKey($('#clientCode').value);
  const assets = state.assets.filter((asset) => codeKey(asset.client_code) === state.currentClient);
  state.checks = assets.map((asset) => ({
    assetId: asset.id,
    systemNumber: asset.asset_number,
    foundNumber: asset.asset_number,
    status: 'ok',
    comment: '',
    model: asset.model || 'EDF'
  }));
  $('#clientSummary').innerHTML = assets.length
    ? `<b>Cliente ${state.currentClient}</b><br><span class="muted">${assets.length} EDF en sistema</span>`
    : `<b>Cliente ${state.currentClient}</b><br><span class="muted">No hay EDF en sistema para este cliente. Podés cargar un adicional si encontraste una heladera.</span>`;
  renderChecks();
}

function renderChecks() {
  $('#assetList').innerHTML = state.checks.map((check, index) => `
    <article class="asset">
      <div class="asset-title">${escapeHtml(check.model || 'EDF')}</div>
      <div class="serial">Serie sistema: ${escapeHtml(check.systemNumber || 'Adicional')}</div>
      <div class="segmented">
        <button class="ok ${check.status === 'ok' ? 'active' : ''}" onclick="setStatus(${index}, 'ok')">OK</button>
        <button class="no_ok ${check.status === 'no_ok' ? 'active' : ''}" onclick="setStatus(${index}, 'no_ok')">No OK</button>
        <button class="pending ${check.status === 'pending' ? 'active' : ''}" onclick="setStatus(${index}, 'pending')">No relevado</button>
      </div>
      <div class="grid two">
        <label>Serie fisica<input value="${escapeAttr(check.foundNumber)}" oninput="state.checks[${index}].foundNumber=this.value" /></label>
        <label>Comentario<input value="${escapeAttr(check.comment)}" oninput="state.checks[${index}].comment=this.value" /></label>
      </div>
    </article>
  `).join('');
}

window.setStatus = (index, status) => {
  state.checks[index].status = status;
  renderChecks();
};

function addExtra() {
  const foundNumber = clean($('#extraSerial').value);
  if (!foundNumber) return toast('Cargá la serie adicional.');
  state.checks.push({
    assetId: null,
    systemNumber: '',
    foundNumber,
    status: 'extra',
    comment: clean($('#extraComment').value),
    model: 'EDF adicional'
  });
  $('#extraSerial').value = '';
  $('#extraComment').value = '';
  renderChecks();
}

async function saveSurvey() {
  const clientCode = codeKey($('#clientCode').value);
  if (!clientCode) return toast('Falta codigo de cliente.');
  if (!state.checks.length) return toast('No hay EDF para guardar.');

  const surveyRows = await supabase('edf_surveys', {
    method: 'POST',
    prefer: 'return=representation',
    body: JSON.stringify([{
      user_name: clean($('#userName').value),
      client_code: clientCode,
      client_name: '',
      location_text: clean($('#locationText').value),
      note: clean($('#generalNote').value)
    }])
  });
  const survey = surveyRows[0];
  const items = state.checks.map((check) => ({
    survey_id: survey.id,
    asset_id: check.assetId,
    client_code: clientCode,
    system_number: clean(check.systemNumber),
    found_number: clean(check.foundNumber),
    status: check.status,
    comment: clean(check.comment)
  }));
  await supabase('edf_survey_items', {
    method: 'POST',
    prefer: 'return=representation',
    body: JSON.stringify(items)
  });
  $('#generalNote').value = '';
  toast('Relevamiento guardado.');
  await refreshAll();
}

function buildReportRows() {
  const latestSurveyByClient = new Map();
  for (const survey of state.surveys) {
    const key = codeKey(survey.client_code);
    if (!latestSurveyByClient.has(key)) latestSurveyByClient.set(key, survey);
  }
  const clients = Array.from(new Set([
    ...state.assets.map((asset) => codeKey(asset.client_code)),
    ...state.surveys.map((survey) => codeKey(survey.client_code))
  ].filter(Boolean))).sort((a, b) => Number(a) - Number(b));

  return clients.map((clientCode) => {
    const expected = state.assets.filter((asset) => codeKey(asset.client_code) === clientCode);
    const survey = latestSurveyByClient.get(clientCode);
    const items = survey ? state.surveyItems.filter((item) => item.survey_id === survey.id) : [];
    const found = new Set(items.map((item) => serialKey(item.found_number || item.system_number)).filter(Boolean));
    const missing = expected.filter((asset) => !found.has(serialKey(asset.asset_number)));
    const extra = items.filter((item) => item.status === 'extra' || !expected.some((asset) => serialKey(asset.asset_number) === serialKey(item.found_number || item.system_number)));
    const noOk = items.filter((item) => item.status === 'no_ok');
    const ok = items.filter((item) => item.status === 'ok');
    const status = !survey ? 'pendiente' : (missing.length || extra.length || noOk.length ? 'dispersion' : 'ok');
    return {
      clientCode,
      expected: expected.length,
      checked: items.length,
      ok: ok.length,
      missing: missing.length,
      extra: extra.length,
      noOk: noOk.length,
      status,
      lastSurveyAt: survey?.created_at || '',
      lastSurveyBy: survey?.user_name || ''
    };
  });
}

function renderReport() {
  const rows = buildReportRows();
  const stats = [
    ['Clientes', rows.length],
    ['Relevados', rows.filter((row) => row.lastSurveyAt).length],
    ['OK', rows.filter((row) => row.status === 'ok').length],
    ['Dispersión', rows.filter((row) => row.status === 'dispersion').length],
    ['Pendientes', rows.filter((row) => row.status === 'pendiente').length]
  ];
  $('#stats').innerHTML = stats.map(([label, value]) => `<div class="stat"><strong>${value}</strong><span class="muted">${label}</span></div>`).join('');

  const filter = $('#statusFilter').value;
  const search = clean($('#reportSearch').value).toLowerCase();
  const visible = rows.filter((row) => (!filter || row.status === filter) && (!search || JSON.stringify(row).toLowerCase().includes(search)));
  $('#reportRows').innerHTML = visible.map((row) => `
    <tr>
      <td><b>${escapeHtml(row.clientCode)}</b></td>
      <td>${row.expected}</td>
      <td>${row.checked}</td>
      <td>${row.ok}</td>
      <td>${row.missing}</td>
      <td>${row.extra}</td>
      <td>${row.noOk}</td>
      <td class="status-${row.status}">${statusText(row.status)}</td>
      <td>${row.lastSurveyAt ? new Date(row.lastSurveyAt).toLocaleString('es-AR') : ''}<br>${escapeHtml(row.lastSurveyBy)}</td>
    </tr>
  `).join('') || '<tr><td colspan="9">Sin datos</td></tr>';
}

function renderBase() {
  $('#baseRows').innerHTML = state.assets.slice(0, 700).map((asset) => `
    <tr>
      <td>${escapeHtml(asset.client_code)}</td>
      <td><b>${escapeHtml(asset.asset_number)}</b></td>
      <td>${escapeHtml(asset.model)}</td>
      <td>${escapeHtml(asset.status)}</td>
    </tr>
  `).join('') || '<tr><td colspan="4">Base vacia</td></tr>';
}

async function importBase() {
  const rows = parseCsv($('#baseCsv').value);
  if (!rows.length) return toast('No hay filas para importar.');
  const assets = rows.map((row) => ({
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

  toast('Importando base...');
  await supabase('edf_assets?asset_number=not.is.null', { method: 'DELETE' });
  for (let i = 0; i < assets.length; i += 500) {
    await supabase('edf_assets', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify(assets.slice(i, i + 500))
    });
  }
  $('#baseCsv').value = '';
  await refreshAll();
  toast(`Base importada: ${assets.length} EDF.`);
}

function parseCsv(text) {
  const matrix = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i], next = text[i + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i++;
      row.push(cell);
      if (row.some((value) => clean(value))) matrix.push(row);
      row = []; cell = '';
    } else cell += char;
  }
  row.push(cell);
  if (row.some((value) => clean(value))) matrix.push(row);
  const headers = (matrix.shift() || []).map(clean);
  return matrix.map((values) => {
    const item = {};
    headers.forEach((header, index) => { item[header] = values[index] || ''; });
    return item;
  });
}

function statusText(status) {
  return { ok: 'OK', dispersion: 'Dispersión', pendiente: 'Pendiente' }[status] || status;
}

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.remove('hidden');
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => $('#toast').classList.add('hidden'), 2800);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

$('#saveSetup').addEventListener('click', () => {
  state.config = {
    url: clean($('#supabaseUrl').value),
    key: clean($('#supabaseKey').value),
    pin: clean($('#appPin').value)
  };
  if (state.config.pin !== APP_PIN) return toast('PIN incorrecto.');
  saveConfig();
  boot();
});
$$('[data-tab]').forEach((button) => button.addEventListener('click', () => showTab(button.dataset.tab)));
$('#searchClient').addEventListener('click', searchClient);
$('#addExtra').addEventListener('click', addExtra);
$('#saveSurvey').addEventListener('click', saveSurvey);
$('#syncButton').addEventListener('click', refreshAll);
$('#statusFilter').addEventListener('change', renderReport);
$('#reportSearch').addEventListener('input', renderReport);
$('#importBase').addEventListener('click', importBase);

boot();
