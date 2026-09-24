const BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";
function authHeaders(isJson = true) {
  const t = localStorage.getItem("mc_token");
  const h = {};
  if (isJson) h["Content-Type"] = "application/json";
  if (t) h["Authorization"] = `Bearer ${t}`;
  return h;
}
async function handle(res) {
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON response */ }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
async function request(url, opts, timeoutMs = 90000) {
  let res;
  try {
    // Never hang a scan forever at "Text detected": abort hung requests
    // so the UI can report the failure instead of spinning indefinitely.
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      res = await fetch(url, { ...opts, signal: ctrl.signal });
    } finally {
      clearTimeout(t);
    }
  } catch (e) {
    if (e?.name === "AbortError") throw new Error("Request timed out. The image may be too large — try a smaller photo and scan again.");
    throw new Error("Server unreachable. Check your connection and try again.");
  }
  return handle(res);
}
export const api = {
  get: (p) => request(`${BASE}${p}`, { headers: authHeaders() }),
  post: (p, body) => request(`${BASE}${p}`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) }),
  put: (p, body) => request(`${BASE}${p}`, { method: "PUT", headers: authHeaders(), body: JSON.stringify(body) }),
  del: (p) => request(`${BASE}${p}`, { method: "DELETE", headers: authHeaders() }),
  postForm: (p, form) => request(`${BASE}${p}`, { method: "POST", headers: authHeaders(false), body: form }),
};
export const API_BASE = BASE;
