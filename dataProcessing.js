import * as XLSX from "xlsx";

export const TARGET_VALIDATION = 0.7;

const MONTHS = {
  enero: "01",
  febrero: "02",
  marzo: "03",
  abril: "04",
  mayo: "05",
  junio: "06",
  julio: "07",
  agosto: "08",
  septiembre: "09",
  octubre: "10",
  noviembre: "11",
  diciembre: "12"
};

export const normalizeKey = (value = "") =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

export const normalizeText = (value = "") =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");

export const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value).replace(",", ".").replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const percent = (part, total) => (total ? part / total : 0);

export const formatPercent = (value) =>
  `${((Number.isFinite(value) ? value : 0) * 100).toFixed(1)}%`;

const columnLetter = (index) => {
  let letter = "";
  let n = index + 1;
  while (n > 0) {
    const mod = (n - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    n = Math.floor((n - mod) / 26);
  }
  return letter;
};

const rowsFromSheet = (sheet, sheetName) => {
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
  if (!matrix.length) return [];
  const headerIndex = matrix.findIndex((row) => row.filter((cell) => normalizeText(cell)).length >= 3);
  const headers = matrix[Math.max(headerIndex, 0)] || [];
  return matrix.slice(Math.max(headerIndex, 0) + 1).map((row, rowIndex) => {
    const item = { __sheet: sheetName, __row: rowIndex + Math.max(headerIndex, 0) + 2 };
    row.forEach((cell, index) => {
      const letter = columnLetter(index);
      item[`__${letter}`] = cell;
      const header = normalizeText(headers[index]);
      if (header) item[header] = cell;
    });
    return item;
  });
};

export const readExcelFile = async (fileOrUrl) => {
  const buffer =
    typeof fileOrUrl === "string"
      ? await fetch(fileOrUrl).then((response) => {
          if (!response.ok) throw new Error(`No se pudo cargar ${fileOrUrl}`);
          return response.arrayBuffer();
        })
      : await fileOrUrl.arrayBuffer();

  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const rows = workbook.SheetNames.flatMap((sheetName) =>
    rowsFromSheet(workbook.Sheets[sheetName], sheetName)
  );
  return { workbook, rows, sheets: workbook.SheetNames };
};

const getField = (row, candidates, fallbackLetter) => {
  const normalized = Object.fromEntries(
    Object.keys(row).map((key) => [normalizeKey(key), key])
  );
  for (const candidate of candidates) {
    const key = normalizeKey(candidate);
    if (normalized[key] && row[normalized[key]] !== "") return row[normalized[key]];
  }
  for (const candidate of candidates) {
    const key = normalizeKey(candidate);
    const found = Object.keys(normalized).find((entry) => entry.includes(key) || key.includes(entry));
    if (found && row[normalized[found]] !== "") return row[normalized[found]];
  }
  return fallbackLetter ? row[`__${fallbackLetter}`] : "";
};

const normalizeImage = (value) => {
  const text = normalizeText(value);
  if (!text) return "";
  return text.toLowerCase().split("?")[0].replace(/^https?:\/\//, "").replace(/\/$/, "");
};

const imageTokens = (value) => {
  const normalized = normalizeImage(value);
  if (!normalized) return [];
  const last = normalized.split(/[\\/]/).pop();
  return Array.from(new Set([normalized, last].filter(Boolean)));
};

const parseDate = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return new Date(parsed.y, parsed.m - 1, parsed.d);
  }
  const text = normalizeText(value);
  const direct = new Date(text);
  if (!Number.isNaN(direct.getTime())) return direct;
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return new Date(Number(year), Number(match[2]) - 1, Number(match[1]));
  }
  return null;
};

export const formatDateKey = (value) => {
  const date = parseDate(value);
  if (!date) return "";
  return date.toISOString().slice(0, 10);
};

const monthKey = (value, sheetName = "") => {
  const dateKey = formatDateKey(value);
  if (dateKey) return dateKey.slice(0, 7);
  const sheet = normalizeKey(sheetName);
  const foundMonth = Object.entries(MONTHS).find(([name]) => sheet.includes(normalizeKey(name)));
  if (foundMonth) return `2026-${foundMonth[1]}`;
  const numeric = sheet.match(/(?:^|[^0-9])(\d{1,2})(?:[^0-9]|$)/);
  if (numeric) return `2026-${String(numeric[1]).padStart(2, "0")}`;
  return "";
};

const buildClientMap = (rows) => {
  const map = new Map();
  rows.forEach((row) => {
    const code = normalizeText(
      getField(row, ["codigo cliente", "cod cliente", "poc id", "cliente", "cod_poc"], "I")
    );
    if (!code) return;
    map.set(code, {
      code,
      fantasyName: normalizeText(
        getField(row, ["nombre fantasia", "fantasia", "razon social", "cliente", "nombre"], "")
      ),
      seller: normalizeText(getField(row, ["vendedor", "seller", "representante"], "")),
      supervisor: normalizeText(getField(row, ["supervisor", "jefe"], "")),
      zone: normalizeText(getField(row, ["zona", "region", "territorio"], ""))
    });
  });
  return map;
};

const classifyAnomalyType = (value) => {
  const text = normalizeKey(value);
  if (!text) return "Otras";
  if (text.includes("fraude")) return "Fraude";
  if (text.includes("foco") || text.includes("blur")) return "Fuera de foco";
  if (text.includes("pop")) return "POP invalido";
  return normalizeText(value) || "Otras";
};

const buildAnomalyIndex = (rows) => {
  const byImage = new Map();
  const anomalies = rows.map((row) => {
    const image = getField(
      row,
      ["link imagen", "imagen", "image url", "image", "foto", "url", "photo"],
      ""
    );
    const type = classifyAnomalyType(
      getField(row, ["tipo anomaly", "tipo anomalia", "anomaly type", "motivo", "reason"], "")
    );
    const item = {
      image,
      type,
      promoter: normalizeText(getField(row, ["promotor"], "")),
      task: normalizeText(getField(row, ["tarea", "detalle tarea", "task"], "")),
      pillar: normalizeText(getField(row, ["pilar", "pilar de la liga"], "")),
      dateKey: formatDateKey(getField(row, ["fecha", "fecha ejecucion", "date"], ""))
    };
    imageTokens(image).forEach((token) => byImage.set(token, item));
    return item;
  });
  return { rows: anomalies, byImage };
};

const matchAnomaly = (value, anomalyIndex) => {
  for (const token of imageTokens(value)) {
    if (anomalyIndex.byImage.has(token)) return anomalyIndex.byImage.get(token);
  }
  return null;
};

const getImageValue = (row) =>
  getField(row, ["link imagen", "imagen", "image url", "image", "foto", "url", "photo"], "");

const normalizePillar = (value) => {
  const text = normalizeText(value);
  const key = normalizeKey(text);
  if (key.includes("frio") || key.includes("cold")) return "Frio";
  if (key.includes("precio") || key.includes("price")) return "Precio";
  if (key.includes("dispon")) return "Disponibilidad";
  return text || "Sin pilar";
};

export const processDatasets = ({ mainRows = [], clientRows = [], reviewRows = [], anomalyRows = [] }) => {
  const clients = buildClientMap(clientRows);
  const anomalyIndex = buildAnomalyIndex(anomalyRows);

  const tasks = mainRows
    .map((row) => {
      const clientCode = normalizeText(getField(row, ["codigo cliente", "cod cliente", "poc id"], "I"));
      const client = clients.get(clientCode) || {};
      const image = getImageValue(row);
      const anomaly = matchAnomaly(image, anomalyIndex);
      const valid = toNumber(row.Validada ?? row.__P) >= 1 ? 1 : 0;
      const task = normalizeText(getField(row, ["nombre tarea", "tarea", "detalle tarea", "task"], "N")) || "Sin tarea";
      const pillar = normalizePillar(getField(row, ["Pilar de la Liga", "pilar", "pillar"], ""));
      const dateValue = getField(row, ["fecha", "fecha ejecucion", "fecha visita", "created at", "date"], "");
      return {
        ...row,
        clientCode,
        clientName: client.fantasyName || normalizeText(getField(row, ["cliente", "nombre fantasia"], "")),
        seller: client.seller || normalizeText(getField(row, ["vendedor"], "")),
        supervisor: client.supervisor || normalizeText(getField(row, ["supervisor"], "")),
        zone: client.zone,
        task,
        pillar,
        valid,
        invalid: valid ? 0 : 1,
        promoter: normalizeText(getField(row, ["promotor", "promoter"], "")) || "Sin promotor",
        dateKey: formatDateKey(dateValue),
        monthKey: monthKey(dateValue, row.__sheet),
        image,
        anomaly: Boolean(anomaly),
        anomalyType: anomaly?.type || "Sin anomaly"
      };
    })
    .filter((row) => row.clientCode || row.task !== "Sin tarea" || row.__P !== "");

  const reviews = reviewRows
    .map((row) => {
      const comment = normalizeText(getField(row, ["Comentario", "comment"], ""));
      const commentKey = normalizeKey(comment);
      const image = getImageValue(row);
      const anomaly = matchAnomaly(image, anomalyIndex);
      let reviewed = "No";
      let result = "Pendiente revision";
      if (commentKey) {
        reviewed = "Si";
        if (commentKey.includes("valida") && commentKey.includes("falla") && commentKey.includes("algoritmo")) {
          result = "Valida por falla algoritmo";
        } else if (commentKey.includes("invalida")) {
          result = "Invalida confirmada";
        } else {
          result = comment;
        }
      }
      const dateValue = getField(row, ["FECHA EJECUCION", "fecha", "fecha ejecucion"], "");
      return {
        ...row,
        codDistri: normalizeText(getField(row, ["COD DISTRI", "cod distri"], "")),
        distri: normalizeText(getField(row, ["DISTRI", "distribuidor"], "")),
        promoter: normalizeText(getField(row, ["PROMOTOR", "promotor"], "")) || "Sin promotor",
        client: normalizeText(getField(row, ["Cliente", "POC ID", "poc id"], "")),
        pocId: normalizeText(getField(row, ["POC ID", "poc id"], "")),
        task: normalizeText(getField(row, ["DETALLE TAREA", "detalle tarea", "tarea"], "")) || "Sin tarea",
        dateKey: formatDateKey(dateValue),
        monthKey: monthKey(dateValue, row.__sheet),
        image,
        comment,
        reviewed,
        result,
        anomaly: Boolean(anomaly),
        anomalyType: anomaly?.type || "Sin anomaly"
      };
    })
    .filter((row) => row.task !== "Sin tarea" || row.comment || row.image);

  return {
    tasks,
    reviews,
    anomalies: anomalyIndex.rows,
    clients: Array.from(clients.values())
  };
};

export const groupBy = (rows, keyGetter) =>
  rows.reduce((map, row) => {
    const key = keyGetter(row) || "Sin dato";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
    return map;
  }, new Map());

const mode = (items) => {
  const counts = new Map();
  items.filter(Boolean).forEach((item) => counts.set(item, (counts.get(item) || 0) + 1));
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "Sin dato";
};

export const calculateMetrics = (tasks, reviews, anomalies) => {
  const total = tasks.length;
  const valid = tasks.reduce((sum, item) => sum + item.valid, 0);
  const invalid = total - valid;
  const anomalyTasks = tasks.filter((item) => item.anomaly).length;
  const reviewed = reviews.filter((item) => item.reviewed === "Si").length;
  const algorithmFixes = reviews.filter((item) => item.result === "Valida por falla algoritmo").length;

  const byPillar = Array.from(groupBy(tasks, (row) => row.pillar)).map(([pillar, rows]) => {
    const rowValid = rows.reduce((sum, item) => sum + item.valid, 0);
    return {
      pillar,
      total: rows.length,
      valid: rowValid,
      invalid: rows.length - rowValid,
      validation: percent(rowValid, rows.length),
      anomalies: rows.filter((item) => item.anomaly).length,
      gap: percent(rowValid, rows.length) - TARGET_VALIDATION
    };
  });

  const topInvalidTasks = Array.from(groupBy(tasks.filter((row) => row.invalid), (row) => row.task))
    .map(([task, rows]) => ({
      task,
      pillar: mode(rows.map((row) => row.pillar)),
      count: rows.length,
      rate: percent(rows.length, tasks.filter((row) => row.task === task).length),
      anomalies: rows.filter((row) => row.anomaly).length
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const topValidTasks = Array.from(groupBy(tasks.filter((row) => row.valid), (row) => row.task))
    .map(([task, rows]) => ({
      task,
      pillar: mode(rows.map((row) => row.pillar)),
      count: rows.length,
      rate: percent(rows.length, tasks.filter((row) => row.task === task).length)
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const criticalClients = Array.from(groupBy(tasks, (row) => row.clientCode || row.clientName))
    .map(([client, rows]) => {
      const rowValid = rows.reduce((sum, item) => sum + item.valid, 0);
      const invalidRows = rows.filter((row) => row.invalid);
      return {
        client,
        name: mode(rows.map((row) => row.clientName)) || client,
        total: rows.length,
        valid: rowValid,
        invalid: rows.length - rowValid,
        anomalies: rows.filter((row) => row.anomaly).length,
        validation: percent(rowValid, rows.length),
        criticalPillar: mode(invalidRows.map((row) => row.pillar)),
        criticalTask: mode(invalidRows.map((row) => row.task))
      };
    })
    .sort((a, b) => a.validation - b.validation || b.total - a.total)
    .slice(0, 25);

  const promoterRanking = Array.from(groupBy(tasks, (row) => row.promoter))
    .map(([promoter, rows]) => {
      const rowValid = rows.reduce((sum, item) => sum + item.valid, 0);
      return {
        promoter,
        total: rows.length,
        valid: rowValid,
        invalid: rows.length - rowValid,
        anomalies: rows.filter((row) => row.anomaly).length,
        validation: percent(rowValid, rows.length)
      };
    })
    .sort((a, b) => b.validation - a.validation || b.total - a.total);

  const trendMap = groupBy(
    [...tasks.map((row) => ({ ...row, source: "task" })), ...reviews.map((row) => ({ ...row, source: "review" }))],
    (row) => row.dateKey || row.monthKey
  );
  const trend = Array.from(trendMap)
    .map(([date, rows]) => {
      const taskRows = rows.filter((row) => row.source === "task");
      const validRows = taskRows.reduce((sum, item) => sum + item.valid, 0);
      return {
        date,
        validation: percent(validRows, taskRows.length),
        anomalies: rows.filter((row) => row.anomaly).length,
        reviews: rows.filter((row) => row.source === "review").length,
        objective: TARGET_VALIDATION
      };
    })
    .filter((row) => row.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  const reviewKpis = {
    total: reviews.length,
    reviewed,
    pending: reviews.length - reviewed,
    algorithmFixes,
    invalidConfirmed: reviews.filter((item) => item.result === "Invalida confirmada").length,
    reviewedRate: percent(reviewed, reviews.length),
    correctionRate: percent(algorithmFixes, reviewed),
    anomalyReviewed: reviews.filter((item) => item.reviewed === "Si" && item.anomaly).length
  };

  const matchedAnomalies = [...tasks.filter((row) => row.anomaly), ...reviews.filter((row) => row.anomaly)];
  const anomalyUniverse = anomalies.length ? anomalies : matchedAnomalies;
  const anomalyType = Array.from(groupBy(anomalyUniverse, (row) => row.anomalyType || row.type || "Otras"))
    .map(([type, rows]) => ({ type, count: rows.length }))
    .sort((a, b) => b.count - a.count);

  const anomalyPromoters = Array.from(groupBy(matchedAnomalies, (row) => row.promoter))
    .map(([promoter, rows]) => ({ promoter, count: rows.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const anomalyHeatmap = Array.from(groupBy(matchedAnomalies, (row) => `${row.promoter || "Sin promotor"}|${row.task || "Sin tarea"}|${row.pillar || "Sin pilar"}`))
    .map(([key, rows]) => {
      const [promoter, task, pillar] = key.split("|");
      return { promoter, task, pillar, count: rows.length };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const anomalyTrend = Array.from(groupBy(matchedAnomalies.length ? matchedAnomalies : anomalyUniverse, (row) => row.dateKey || row.monthKey))
    .map(([date, rows]) => ({ date, anomalies: rows.length }))
    .filter((row) => row.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    executive: {
      validation: percent(valid, total),
      objective: TARGET_VALIDATION,
      gap: percent(valid, total) - TARGET_VALIDATION,
      total,
      valid,
      invalid,
      anomalies: anomalyUniverse.length,
      anomalyRate: percent(anomalyTasks, total),
      reviewed,
      algorithmFixes
    },
    byPillar,
    topInvalidTasks,
    topValidTasks,
    criticalClients,
    promoterRanking,
    trend,
    reviewKpis,
    anomaly: {
      total: anomalyUniverse.length,
      fraud: anomalyType.find((item) => normalizeKey(item.type).includes("fraude"))?.count || 0,
      blur: anomalyType.find((item) => normalizeKey(item.type).includes("fueradefoco"))?.count || 0,
      pop: anomalyType.find((item) => normalizeKey(item.type).includes("pop"))?.count || 0,
      other:
        anomalyUniverse.length -
        (anomalyType.find((item) => normalizeKey(item.type).includes("fraude"))?.count || 0) -
        (anomalyType.find((item) => normalizeKey(item.type).includes("fueradefoco"))?.count || 0) -
        (anomalyType.find((item) => normalizeKey(item.type).includes("pop"))?.count || 0),
      byType: anomalyType,
      promoters: anomalyPromoters,
      heatmap: anomalyHeatmap,
      trend: anomalyTrend
    }
  };
};

export const uniqueOptions = (rows, key) =>
  Array.from(new Set(rows.map((row) => row[key]).filter(Boolean))).sort((a, b) =>
    String(a).localeCompare(String(b))
  );

export const applyFilters = (rows, filters) =>
  rows.filter((row) => {
    if (filters.month && row.monthKey !== filters.month) return false;
    if (filters.dateFrom && row.dateKey && row.dateKey < filters.dateFrom) return false;
    if (filters.dateTo && row.dateKey && row.dateKey > filters.dateTo) return false;
    if (filters.pillar && row.pillar !== filters.pillar) return false;
    if (filters.promoter && row.promoter !== filters.promoter) return false;
    if (filters.supervisor && row.supervisor !== filters.supervisor) return false;
    if (filters.client && row.clientCode !== filters.client && row.client !== filters.client) return false;
    if (filters.task && row.task !== filters.task) return false;
    if (filters.reviewed && row.reviewed !== filters.reviewed) return false;
    if (filters.result && row.result !== filters.result) return false;
    if (filters.anomaly && (row.anomaly ? "Si" : "No") !== filters.anomaly) return false;
    if (filters.anomalyType && row.anomalyType !== filters.anomalyType) return false;
    return true;
  });
