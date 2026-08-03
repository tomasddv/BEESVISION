const APP_PIN = 'galaxia2026';

const SHEETS = {
  BASE: 'BASE_EDF',
  SURVEYS: 'RELEVAMIENTOS'
};

const BASE_HEADERS = [
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

const SURVEY_HEADERS = [
  'id',
  'createdAt',
  'user',
  'clientCode',
  'clientName',
  'location',
  'systemNumber',
  'foundNumber',
  'status',
  'comment',
  'note'
];

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Relevamiento EDF')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss, SHEETS.BASE, BASE_HEADERS);
  ensureSheet_(ss, SHEETS.SURVEYS, SURVEY_HEADERS);
  return { ok: true, spreadsheetUrl: ss.getUrl() };
}

function loadApp(pin) {
  assertPin_(pin);
  const assets = readObjects_(SHEETS.BASE).filter(function(row) {
    return String(row.status || '').toUpperCase().indexOf('PDV') !== -1;
  });
  return {
    ok: true,
    assets: assets,
    report: buildReport_(assets, readObjects_(SHEETS.SURVEYS))
  };
}

function getReport(pin) {
  assertPin_(pin);
  const assets = readObjects_(SHEETS.BASE).filter(function(row) {
    return String(row.status || '').toUpperCase().indexOf('PDV') !== -1;
  });
  return { ok: true, report: buildReport_(assets, readObjects_(SHEETS.SURVEYS)) };
}

function saveSurvey(pin, payload) {
  assertPin_(pin);
  if (!payload || !payload.clientCode) throw new Error('Falta el codigo de cliente.');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ensureSheet_(ss, SHEETS.SURVEYS, SURVEY_HEADERS);
  const createdAt = new Date().toISOString();
  const id = Utilities.getUuid();
  const checks = Array.isArray(payload.checks) ? payload.checks : [];

  if (!checks.length) throw new Error('No hay EDF para guardar.');

  const values = checks.map(function(check) {
    return [
      id,
      createdAt,
      clean_(payload.user),
      normalizeCode_(payload.clientCode),
      clean_(payload.clientName),
      clean_(payload.location),
      clean_(check.systemNumber),
      clean_(check.foundNumber),
      clean_(check.status || 'pending'),
      clean_(check.comment),
      clean_(payload.note)
    ];
  });

  sheet.getRange(sheet.getLastRow() + 1, 1, values.length, SURVEY_HEADERS.length).setValues(values);
  return { ok: true, id: id, createdAt: createdAt };
}

function importBase(pin, rows) {
  assertPin_(pin);
  if (!Array.isArray(rows) || !rows.length) throw new Error('No llegaron filas para importar.');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ensureSheet_(ss, SHEETS.BASE, BASE_HEADERS);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, BASE_HEADERS.length).setValues([BASE_HEADERS]);

  const values = rows.map(function(row) {
    return BASE_HEADERS.map(function(header) {
      return clean_(row[header]);
    });
  });
  sheet.getRange(2, 1, values.length, BASE_HEADERS.length).setValues(values);

  return { ok: true, imported: values.length };
}

function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const missingHeaders = headers.some(function(header, index) {
    return current[index] !== header;
  });
  if (missingHeaders) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  return sheet;
}

function readObjects_(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const values = sheet.getDataRange().getValues();
  const headers = values.shift().map(String);
  return values
    .filter(function(row) {
      return row.some(function(cell) { return String(cell || '').trim(); });
    })
    .map(function(row) {
      const obj = {};
      headers.forEach(function(header, index) {
        obj[header] = row[index];
      });
      if (obj.clientCode) obj.clientCode = normalizeCode_(obj.clientCode);
      return obj;
    });
}

function buildReport_(assets, rows) {
  const assetsByClient = groupBy_(assets, function(row) { return normalizeCode_(row.clientCode); });
  const surveyGroups = groupBy_(rows, function(row) { return String(row.id || ''); });
  const surveys = Object.keys(surveyGroups)
    .filter(Boolean)
    .map(function(id) {
      const items = surveyGroups[id];
      const first = items[0] || {};
      return {
        id: id,
        createdAt: first.createdAt,
        user: first.user,
        clientCode: normalizeCode_(first.clientCode),
        clientName: first.clientName,
        location: first.location,
        note: first.note,
        checks: items.map(function(item) {
          return {
            systemNumber: clean_(item.systemNumber),
            foundNumber: clean_(item.foundNumber),
            status: clean_(item.status),
            comment: clean_(item.comment)
          };
        })
      };
    })
    .sort(function(a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });

  const latestByClient = {};
  surveys.forEach(function(survey) {
    if (!latestByClient[survey.clientCode]) latestByClient[survey.clientCode] = survey;
  });

  const clients = Object.keys(assetsByClient).sort(function(a, b) {
    return Number(a) - Number(b);
  });

  const rowsReport = [];
  clients.forEach(function(clientCode) {
    const survey = latestByClient[clientCode];
    const expected = assetsByClient[clientCode] || [];
    expected.forEach(function(asset) {
      const match = survey && survey.checks.find(function(check) {
        return normalizeSerial_(check.systemNumber) === normalizeSerial_(asset.assetNumber);
      });
      rowsReport.push({
        clientCode: clientCode,
        clientName: asset.clientName || '',
        model: asset.model || '',
        systemNumber: asset.assetNumber || '',
        foundNumber: match ? match.foundNumber : '',
        status: match ? match.status : 'sin_relevar',
        comment: match ? match.comment : '',
        lastSurveyAt: survey ? survey.createdAt : '',
        user: survey ? survey.user : ''
      });
    });
  });

  surveys.forEach(function(survey) {
    survey.checks.forEach(function(check) {
      if (check.systemNumber) return;
      rowsReport.push({
        clientCode: survey.clientCode,
        clientName: survey.clientName || '',
        model: 'EDF adicional',
        systemNumber: '',
        foundNumber: check.foundNumber,
        status: check.status || 'extra',
        comment: check.comment,
        lastSurveyAt: survey.createdAt,
        user: survey.user
      });
    });
  });

  const totalAssets = assets.length;
  const ok = rowsReport.filter(function(row) { return row.status === 'ok'; }).length;
  const noOk = rowsReport.filter(function(row) { return row.status === 'no_ok' || row.status === 'extra'; }).length;
  const pending = rowsReport.filter(function(row) { return row.status === 'sin_relevar' || row.status === 'pending'; }).length;
  const surveyedClients = Object.keys(latestByClient).length;

  return {
    totalAssets: totalAssets,
    totalClients: clients.length,
    surveyedClients: surveyedClients,
    ok: ok,
    noOk: noOk,
    pending: pending,
    surveys: surveys,
    rows: rowsReport
  };
}

function groupBy_(items, getKey) {
  return items.reduce(function(acc, item) {
    const key = getKey(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

function assertPin_(pin) {
  if (String(pin || '').trim() !== APP_PIN) throw new Error('PIN incorrecto.');
}

function normalizeCode_(value) {
  return String(value || '').trim().replace(/^0+/, '') || String(value || '').trim();
}

function normalizeSerial_(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function clean_(value) {
  return String(value == null ? '' : value).trim();
}
