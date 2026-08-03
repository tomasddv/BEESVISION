import { createServer } from "node:http";
import { copyFileSync, createReadStream, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, extname, join, normalize } from "node:path";
import { createGzip } from "node:zlib";

const root = process.cwd();
const sourceRoot = dirname(root);
const sourceRoots = [
  sourceRoot,
  "N:\\Tomas\\DASHBOARDS\\dash bees vision"
].filter((item, index, list) => item && list.indexOf(item) === index);
const port = Number(process.env.PORT || 5173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
};

const fixedSourceFiles = [
  "20260511104225plantillaClientesAR.xlsx"
];
const sourceAliases = [
  {
    source: "DEL VALLE 2026 DISTRIS - Ticket invalidas a validas final.xlsx",
    target: "DEL VALLE 2026 DISTRIS - Ticket invalidas a validas final (1).xlsx"
  }
];
const jsonFile = join(root, "public", "data", "dashboard-data.json");
const auditNotesFile = join(root, "public", "data", "audit-notes.json");
const assetsFile = join(root, "public", "data", "assets-system.json");
const surveysFile = join(root, "public", "data", "active-surveys.json");
const edfSourceRoot = "C:\\Users\\triesgo\\Desktop\\relevamiento edf";
const edfPin = process.env.EDF_PIN || "galaxia2026";

function sourceFileNames() {
  const isDataSource = (name) =>
    /^((Anomaly|Anomalias|Anomalías).*)\.xlsx$/i.test(name) ||
    /^(TAREAS\b.*|data\b.*)\.xlsx$/i.test(name) ||
    /^DEL VALLE 2026 DISTRIS - Ticket invalidas a validas final.*\.xlsx$/i.test(name) ||
    /^Q3\.\s*2026\s+DEL VALLE - Ticket tareas.*\.xlsx$/i.test(name) ||
    /^\d{4}-\d{2}-\d{2}\s+Tareas Distris.*\.csv$/i.test(name);
  const external = sourceRoots.flatMap((source) =>
    existsSync(source) ? readdirSync(source).filter(isDataSource) : []
  );
  const local = readdirSync(join(root, "public", "data")).filter(isDataSource);
  return Array.from(new Set([...fixedSourceFiles, ...external, ...local]));
}

function ensureDataFresh(force = false) {
  const sourceFiles = sourceFileNames();
  for (const name of sourceFiles) {
    const external = sourceRoots.map((source) => join(source, name)).find((file) => existsSync(file));
    const local = join(root, "public", "data", name);
    if (external && (!existsSync(local) || statSync(external).mtimeMs > statSync(local).mtimeMs)) {
      copyFileSync(external, local);
    }
  }
  for (const alias of sourceAliases) {
    const external = sourceRoots.map((source) => join(source, alias.source)).find((file) => existsSync(file));
    const local = join(root, "public", "data", alias.target);
    if (external && (!existsSync(local) || statSync(external).mtimeMs > statSync(local).mtimeMs)) {
      copyFileSync(external, local);
    }
  }
  const jsonTime = existsSync(jsonFile) ? statSync(jsonFile).mtimeMs : 0;
  const publicFiles = [...sourceFiles, ...sourceAliases.map((item) => item.target)].map((name) => join(root, "public", "data", name));
  const needsRefresh = publicFiles.some((file) => existsSync(file) && statSync(file).mtimeMs > jsonTime);
  if (!force && !needsRefresh) return { refreshed: false, reason: "Sin cambios nuevos" };
  const result = spawnSync(process.execPath, ["scripts/extract-xlsx.mjs"], {
    cwd: root,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    const error = result.stderr || result.stdout || "No se pudo regenerar dashboard-data.json";
    console.error(error);
    return { refreshed: false, error };
  }
  const currentResult = spawnSync(process.execPath, ["scripts/build-current-data.mjs"], {
    cwd: root,
    encoding: "utf8"
  });
  if (currentResult.status !== 0) {
    const error = currentResult.stderr || currentResult.stdout || "No se pudo regenerar dashboard-current.json";
    console.error(error);
    return { refreshed: false, error };
  }
  return { refreshed: true, output: result.stdout };
}

function ensureAssetsFresh() {
  if (!existsSync(edfSourceRoot)) return;
  const semaforoFiles = readdirSync(edfSourceRoot).filter((name) => /semaforo.*\.xlsx$/i.test(name) && !name.startsWith("~$"));
  if (!semaforoFiles.length) return;
  const latest = semaforoFiles
    .map((name) => join(edfSourceRoot, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
  const assetsTime = existsSync(assetsFile) ? statSync(assetsFile).mtimeMs : 0;
  if (statSync(latest).mtimeMs <= assetsTime) return;
  const result = spawnSync(process.execPath, ["scripts/extract-edf-assets.mjs"], {
    cwd: root,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout || "No se pudo regenerar assets-system.json");
  }
}

function ensureJsonFile(file, fallback) {
  if (!existsSync(file)) writeFileSync(file, JSON.stringify(fallback, null, 2), "utf8");
}

function readJson(file, fallback) {
  ensureJsonFile(file, fallback);
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function sendJson(response, data, status = 200) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

function bodyJson(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 5_000_000) {
        reject(new Error("Payload demasiado grande"));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("JSON invalido"));
      }
    });
    request.on("error", reject);
  });
}

function normalizeText(value = "") {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function assetReport() {
  const assets = readJson(assetsFile, []);
  const surveys = readJson(surveysFile, []);
  const latestByClient = new Map();
  for (const item of surveys) {
    const client = normalizeText(item.clientCode);
    if (!client) continue;
    const prev = latestByClient.get(client);
    if (!prev || String(item.createdAt || "") > String(prev.createdAt || "")) latestByClient.set(client, item);
  }
  const clients = Array.from(new Set([...assets.map((a) => normalizeText(a.clientCode)), ...surveys.map((s) => normalizeText(s.clientCode))].filter(Boolean)));
  const rows = clients.map((clientCode) => {
    const expected = assets.filter((a) => normalizeText(a.clientCode) === clientCode);
    const survey = latestByClient.get(clientCode);
    const checks = survey?.checks || [];
    const foundNumbers = new Set(checks.map((c) => normalizeText(c.foundNumber || c.systemNumber)).filter(Boolean));
    const missing = expected.filter((a) => !foundNumbers.has(normalizeText(a.assetNumber)));
    const extra = checks.filter((c) => c.status === "extra" || !expected.some((a) => normalizeText(a.assetNumber) === normalizeText(c.foundNumber || c.systemNumber)));
    const mismatches = checks.filter((c) => c.status === "no_ok");
    const ok = checks.filter((c) => c.status === "ok");
    const status = !survey
      ? "pendiente"
      : missing.length || extra.length || mismatches.length
        ? "dispersión"
        : "ok";
    return {
      clientCode,
      clientName: survey?.clientName || expected[0]?.clientName || "",
      expected: expected.length,
      checked: checks.length,
      ok: ok.length,
      missing: missing.length,
      extra: extra.length,
      mismatches: mismatches.length,
      status,
      lastSurveyAt: survey?.createdAt || "",
      lastSurveyBy: survey?.user || "",
      note: survey?.note || ""
    };
  });
  const summary = {
    clients: rows.length,
    surveyed: rows.filter((r) => r.lastSurveyAt).length,
    ok: rows.filter((r) => r.status === "ok").length,
    dispersion: rows.filter((r) => r.status === "dispersión").length,
    pending: rows.filter((r) => r.status === "pendiente").length,
    systemAssets: assets.length,
    checkedAssets: surveys.reduce((sum, item) => sum + (item.checks?.length || 0), 0)
  };
  return { summary, rows, assets, surveys };
}

function hasEdfAccess(request, url) {
  return request.headers["x-edf-pin"] === edfPin || url.searchParams.get("pin") === edfPin;
}

createServer(async (request, response) => {
  const url = new URL(request.url, `http://localhost:${port}`);
  if (url.pathname === "/audit-notes" && request.method === "GET") return sendJson(response, readJson(auditNotesFile, {}));
  if (url.pathname === "/audit-notes" && request.method === "POST") {
    try {
      const body = await bodyJson(request);
      const current = readJson(auditNotesFile, {});
      const incoming = body.notes && typeof body.notes === "object" ? body.notes : {};
      writeFileSync(auditNotesFile, JSON.stringify({ ...current, ...incoming }, null, 2), "utf8");
      return sendJson(response, { ok: true, count: Object.keys({ ...current, ...incoming }).length });
    } catch (error) {
      return sendJson(response, { ok: false, error: error.message }, 400);
    }
  }
  if (url.pathname === "/refresh-data" && (request.method === "POST" || request.method === "GET")) {
    const result = ensureDataFresh(true);
    const data = readJson(jsonFile, {});
    return sendJson(response, {
      ok: !result.error,
      ...result,
      counts: {
        main: data.main?.length || 0,
        clients: data.clients?.length || 0,
        review: data.review?.length || 0,
        anomalies: data.anomalies?.length || 0,
        planned: data.planned?.length || 0
      }
    }, result.error ? 500 : 200);
  }
  if (url.pathname.startsWith("/api/") && !hasEdfAccess(request, url)) {
    return sendJson(response, { ok: false, error: "Clave de acceso requerida" }, 401);
  }
  if (url.pathname === "/api/assets" && request.method === "GET") {
    ensureAssetsFresh();
    return sendJson(response, readJson(assetsFile, []));
  }
  if (url.pathname === "/api/assets" && request.method === "POST") {
    try {
      const body = await bodyJson(request);
      const rows = Array.isArray(body.assets) ? body.assets : [];
      const cleaned = rows.map((row) => ({
        clientCode: normalizeText(row.clientCode),
        clientName: normalizeText(row.clientName),
        assetNumber: normalizeText(row.assetNumber),
        assetType: normalizeText(row.assetType),
        model: normalizeText(row.model),
        contract: normalizeText(row.contract),
        status: normalizeText(row.status || "Sistema")
      })).filter((row) => row.clientCode && row.assetNumber);
      writeFileSync(assetsFile, JSON.stringify(cleaned, null, 2), "utf8");
      return sendJson(response, { ok: true, count: cleaned.length });
    } catch (error) {
      return sendJson(response, { ok: false, error: error.message }, 400);
    }
  }
  if (url.pathname === "/api/surveys" && request.method === "GET") return sendJson(response, readJson(surveysFile, []));
  if (url.pathname === "/api/surveys" && request.method === "POST") {
    try {
      const body = await bodyJson(request);
      const surveys = readJson(surveysFile, []);
      const item = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        createdAt: new Date().toISOString(),
        user: normalizeText(body.user),
        clientCode: normalizeText(body.clientCode),
        clientName: normalizeText(body.clientName),
        location: normalizeText(body.location),
        note: normalizeText(body.note),
        checks: Array.isArray(body.checks)
          ? body.checks.map((check) => ({
              systemNumber: normalizeText(check.systemNumber),
              foundNumber: normalizeText(check.foundNumber),
              status: normalizeText(check.status),
              comment: normalizeText(check.comment)
            }))
          : []
      };
      if (!item.clientCode) return sendJson(response, { ok: false, error: "Falta numero de cliente" }, 400);
      surveys.push(item);
      writeFileSync(surveysFile, JSON.stringify(surveys, null, 2), "utf8");
      return sendJson(response, { ok: true, item });
    } catch (error) {
      return sendJson(response, { ok: false, error: error.message }, 400);
    }
  }
  if (url.pathname === "/api/report" && request.method === "GET") {
    ensureAssetsFresh();
    return sendJson(response, assetReport());
  }
  if (url.pathname === "/activos-comodatos.html") ensureAssetsFresh();
  if (url.pathname === "/data/dashboard-data.json") {
    ensureDataFresh();
  }
  const requested =
    url.pathname === "/"
      ? "/dashboard-local.html"
      : url.pathname.startsWith("/data/")
        ? `/public${decodeURIComponent(url.pathname)}`
        : decodeURIComponent(url.pathname);
  const filePath = normalize(join(root, requested));
  if (!filePath.startsWith(root) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  const ext = extname(filePath);
  const headers = { "Content-Type": types[ext] || "application/octet-stream" };
  if (ext === ".json" && /\bgzip\b/i.test(request.headers["accept-encoding"] || "")) {
    response.writeHead(200, { ...headers, "Content-Encoding": "gzip" });
    createReadStream(filePath).pipe(createGzip()).pipe(response);
    return;
  }
  response.writeHead(200, headers);
  createReadStream(filePath).pipe(response);
}).listen(port, () => {
  console.log(`Dashboard BEES Vision: http://localhost:${port}`);
});
