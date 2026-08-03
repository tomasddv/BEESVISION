const CONFIG = {
  supabaseUrl: 'https://svqeeyltrbudafpdralc.supabase.co',
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2cWVleWx0cmJ1ZGFmcGRyYWxjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3NTU5OTksImV4cCI6MjA5NDMzMTk5OX0.90ow7Ws_YNEmtDxo2o_oYBRZigryYmg-NVbjE2twNcA'
};

const state = { cases: [], actions: [], currentCase: null, currentCases: [] };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const clean = (value) => String(value ?? '').trim();
const codeKey = (value) => clean(value).replace(/^0+/, '') || clean(value);

async function supabase(path, options = {}) {
  const response = await fetch(`${CONFIG.supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: CONFIG.supabaseKey,
      Authorization: `Bearer ${CONFIG.supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || '',
      ...(options.headers || {})
    }
  });
  if (!response.ok) throw new Error(await response.text());
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function supabaseAll(path) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const page = await supabase(path, { headers: { Range: `${from}-${from + pageSize - 1}` } });
    rows.push(...(page || []));
    if (!page || page.length < pageSize) break;
  }
  return rows;
}

async function refreshAll() {
  toast('Actualizando...');
  const [cases, actions] = await Promise.all([
    supabaseAll('nps_cases?select=*&order=client_code.asc'),
    supabaseAll('nps_actions?select=*&order=created_at.desc')
  ]);
  state.cases = cases || [];
  state.actions = actions || [];
  renderBase();
  renderReport();
  toast('Listo');
}

function showTab(tab) {
  $$('.view').forEach((view) => view.classList.toggle('hidden', view.id !== tab));
  $$('[data-tab]').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
  if (tab === 'report') renderReport();
  if (tab === 'base') renderBase();
}

function searchClient() {
  const clientCode = codeKey($('#clientCode').value);
  const foundRows = state.cases.filter((item) => codeKey(item.client_code) === clientCode);
  const found = foundRows[0] || null;
  state.currentCases = foundRows;
  state.currentCase = found;
  $('#clientName').value = found?.client_name || $('#clientName').value;
  $('#promoter').value = found?.promoter || $('#promoter').value;
  $('#rootCause').value = found?.reason || '';
  $('#caseSummary').innerHTML = found
    ? `<b>${escapeHtml(found.client_name || 'Cliente ' + clientCode)}</b><br><span class="muted">Promotor: ${escapeHtml(found.promoter || '-')} | Casos NPS: ${foundRows.length}</span>${caseListHtml(foundRows)}`
    : `<b>Cliente ${escapeHtml(clientCode)}</b><br><span class="muted">No esta en la base NPS. Igual podés cargar plan o comentario manual.</span>`;
}

function caseListHtml(rows) {
  return `<ul class="case-list">${rows.map((item) => `<li><b>${escapeHtml(item.nps_score || item.segment || '-')}</b>: ${escapeHtml(item.reason || '-')}</li>`).join('')}</ul>`;
}

async function saveAction() {
  const clientCode = codeKey($('#clientCode').value);
  if (!clientCode) return toast('Falta codigo de cliente.');
  const row = {
    case_id: state.currentCase?.id || null,
    user_name: clean($('#userName').value),
    client_code: clientCode,
    client_name: clean($('#clientName').value),
    promoter: clean($('#promoter').value),
    root_cause: clean($('#rootCause').value),
    action_plan: clean($('#actionPlan').value),
    owner_name: clean($('#ownerName').value),
    due_date: clean($('#dueDate').value) || null,
    status: clean($('#actionStatus').value),
    comment: clean($('#comment').value)
  };
  if (!row.action_plan && !row.comment) return toast('Cargá un plan o comentario.');
  await supabase('nps_actions', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify([row]) });
  $('#actionPlan').value = '';
  $('#comment').value = '';
  toast('Guardado.');
  await refreshAll();
}

function latestByClient() {
  const map = new Map();
  for (const action of state.actions) {
    const key = codeKey(action.client_code);
    if (!map.has(key)) map.set(key, action);
  }
  return map;
}

function reportRows() {
  const latest = latestByClient();
  const clients = Array.from(new Set([
    ...state.cases.map((item) => codeKey(item.client_code)),
    ...state.actions.map((item) => codeKey(item.client_code))
  ].filter(Boolean))).sort((a, b) => Number(a) - Number(b));
  return clients.map((clientCode) => {
    const item = state.cases.find((row) => codeKey(row.client_code) === clientCode);
    const action = latest.get(clientCode);
    return {
      clientCode,
      clientName: action?.client_name || item?.client_name || '',
      promoter: action?.promoter || item?.promoter || '',
      rootCause: action?.root_cause || item?.reason || '',
      actionPlan: action?.action_plan || '',
      ownerName: action?.owner_name || '',
      dueDate: action?.due_date || '',
      status: action?.status || 'Pendiente',
      comment: action?.comment || '',
      updatedAt: action?.created_at || ''
    };
  });
}

function renderReport() {
  const rows = reportRows();
  const stats = [
    ['Clientes', rows.length],
    ['Pendientes', rows.filter((row) => row.status === 'Pendiente').length],
    ['En progreso', rows.filter((row) => row.status === 'En progreso').length],
    ['Cerrados', rows.filter((row) => row.status === 'Cerrado').length],
    ['Acciones', state.actions.length]
  ];
  $('#stats').innerHTML = stats.map(([label, value]) => `<div class="stat"><strong>${value}</strong><span class="muted">${label}</span></div>`).join('');
  const filter = $('#statusFilter').value;
  const search = clean($('#searchReport').value).toLowerCase();
  const visible = rows.filter((row) => (!filter || row.status === filter) && (!search || JSON.stringify(row).toLowerCase().includes(search)));
  $('#reportRows').innerHTML = visible.map((row) => `
    <tr>
      <td><b>${escapeHtml(row.clientCode)}</b><br>${escapeHtml(row.clientName)}</td>
      <td>${escapeHtml(row.promoter)}</td>
      <td>${escapeHtml(row.rootCause)}</td>
      <td>${escapeHtml(row.actionPlan)}</td>
      <td>${escapeHtml(row.ownerName)}</td>
      <td>${escapeHtml(row.dueDate)}</td>
      <td class="${statusClass(row.status)}">${escapeHtml(row.status)}</td>
      <td>${escapeHtml(row.comment)}</td>
      <td>${row.updatedAt ? new Date(row.updatedAt).toLocaleString('es-AR') : ''}</td>
    </tr>
  `).join('') || '<tr><td colspan="9">Sin datos</td></tr>';
}

function renderBase() {
  $('#baseRows').innerHTML = state.cases.slice(0, 800).map((item) => `
    <tr>
      <td><b>${escapeHtml(item.client_code)}</b></td>
      <td>${escapeHtml(item.client_name)}</td>
      <td>${escapeHtml(item.promoter)}</td>
      <td>${escapeHtml(item.nps_score)}</td>
      <td>${escapeHtml(item.reason)}</td>
      <td>${escapeHtml(item.status)}</td>
    </tr>
  `).join('') || '<tr><td colspan="6">Sin base importada. Igual se pueden cargar planes manuales.</td></tr>';
}

async function importCases() {
  const rows = parseCsv($('#baseCsv').value).map((row) => ({
    client_code: codeKey(row.clientCode || row.cliente || row.Cliente),
    client_name: clean(row.clientName || row.nombre || row.Nombre),
    promoter: clean(row.promoter || row.promotor || row.Promotor),
    zone: clean(row.zone || row.zona || row.Zona),
    nps_score: clean(row.npsScore || row.nps || row.NPS),
    reason: clean(row.reason || row.motivo || row.Motivo),
    segment: clean(row.segment || row.segmento || row.Segmento),
    status: clean(row.status || row.estado || row.Estado || 'Pendiente')
  })).filter((row) => row.client_code);
  if (!rows.length) return toast('No hay casos para importar.');
  await supabase('nps_cases?client_code=not.is.null', { method: 'DELETE' });
  for (let index = 0; index < rows.length; index += 500) {
    await supabase('nps_cases', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify(rows.slice(index, index + 500)) });
  }
  $('#baseCsv').value = '';
  await refreshAll();
  toast(`Base importada: ${rows.length} casos.`);
}

function exportCsv() {
  const rows = reportRows();
  const headers = ['clientCode','clientName','promoter','rootCause','actionPlan','ownerName','dueDate','status','comment','updatedAt'];
  const csv = [headers.join(','), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(','))].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `nps-planes-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function parseCsv(text) {
  const matrix = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i], next = text[i + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if ((char === ',' || char === ';') && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
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

function statusClass(status) {
  return `status-${clean(status).toLowerCase().replace(/\s+/g, '-')}`;
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
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

$$('[data-tab]').forEach((button) => button.addEventListener('click', () => showTab(button.dataset.tab)));
$('#refreshButton').addEventListener('click', refreshAll);
$('#searchClient').addEventListener('click', searchClient);
$('#saveAction').addEventListener('click', saveAction);
$('#statusFilter').addEventListener('change', renderReport);
$('#searchReport').addEventListener('input', renderReport);
$('#importCases').addEventListener('click', importCases);
$('#exportCsv').addEventListener('click', exportCsv);

refreshAll().catch((error) => {
  console.error(error);
  toast('No se pudo conectar a Supabase. Revisar tablas NPS.');
});
