const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

export function apiUrl(path) {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

async function jsonRequest(path, options) {
  const response = await fetch(apiUrl(path), options);
  if (!response.ok) throw new Error(`API request failed (${response.status}).`);
  return response.json();
}

export function getHealth() {
  return jsonRequest("/health");
}

async function readLocalMetrics() {
  const response = await fetch("/evaluation/model_comparison.json");
  if (!response.ok) throw new Error("Local model comparison file unavailable.");
  const data = await response.json();
  if (Array.isArray(data)) return data;
  return Object.entries(data).map(([model, values]) => ({ model, ...values }));
}

export async function getMetrics() {
  try {
    const data = await jsonRequest("/metrics");
    if (Array.isArray(data) && data.length) return data;
  } catch { /* Saved evaluation artifact is the local fallback. */ }
  return readLocalMetrics();
}

export async function predictImage(file, modelName) {
  const body = new FormData();
  body.append("file", file);
  body.append("model_name", modelName);
  const response = await fetch(apiUrl("/predict"), { method: "POST", body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || `Prediction failed (${response.status}).`);
  return data;
}
