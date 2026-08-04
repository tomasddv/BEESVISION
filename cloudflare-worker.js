import dashboardHtml from "./dashboard-local.html";

const DRIVE_FILE_ID = "1HNkkJTlsrxwJe3b11u7pXA_yw6PjDhA_";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function base64Url(input) {
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : new TextEncoder().encode(input);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemToArrayBuffer(pem) {
  const clean = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function serviceAccountToken(env) {
  const serviceAccountJson =
    env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    Array.from({ length: 20 }, (_, index) => env[`GOOGLE_SERVICE_ACCOUNT_JSON_${index + 1}`] || "").join("");
  if (!serviceAccountJson) {
    throw new Error("Falta GOOGLE_SERVICE_ACCOUNT_JSON o GOOGLE_SERVICE_ACCOUNT_JSON_1..N en Cloudflare secrets.");
  }
  const info = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: info.client_email,
    scope: DRIVE_SCOPE,
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now
  };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claim))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(info.private_key.replace(/\\n/g, "\n")),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const assertion = `${unsigned}.${base64Url(signature)}`;
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error_description || payload.error || "No se pudo autenticar con Google.");
  return payload.access_token;
}

async function dashboardData(env) {
  const cache = caches.default;
  const cacheKey = new Request(`https://beesvision.local/cache/${DRIVE_FILE_ID}`);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const token = await serviceAccountToken(env);
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${DRIVE_FILE_ID}?alt=media`, {
    headers: { authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Drive ${response.status}: ${text.slice(0, 300)}`);
  }
  const data = await response.text();
  const out = new Response(data, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300"
    }
  });
  await cache.put(cacheKey, out.clone());
  return out;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/favicon.ico") {
      return new Response(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#0f172a"/><text x="32" y="40" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" font-weight="700" fill="white">BV</text></svg>`,
        {
          headers: {
            "content-type": "image/svg+xml",
            "cache-control": "public, max-age=86400"
          }
        }
      );
    }
    if (url.pathname === "/audit-notes" && request.method === "GET") return jsonResponse({});
    if (url.pathname === "/audit-notes" && request.method === "POST") return jsonResponse({ ok: true });
    if (url.pathname === "/refresh-data") return jsonResponse({ ok: true, refreshed: false, reason: "Cloudflare lee datos desde Drive cada 5 minutos." });
    if (url.pathname === "/data/dashboard-data.json" || url.pathname === "/public/data/dashboard-data.json") {
      try {
        return await dashboardData(env);
      } catch (error) {
        return jsonResponse({ ok: false, error: error.message }, 500);
      }
    }
    return new Response(dashboardHtml, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store"
      }
    });
  }
};
