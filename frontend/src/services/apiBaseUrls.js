const LOCAL_WORKER_URLS = [
  "http://localhost:8787",
  "http://localhost:8788",
];

export function resolveApiBaseUrls({ configuredBaseUrl = "", dev = false } = {}) {
  const configured = String(configuredBaseUrl || "").trim().replace(/\/+$/, "");

  if (dev) {
    return configured ? [configured] : LOCAL_WORKER_URLS;
  }

  return ["/api/proxy", ...(configured ? [configured] : [])];
}

export function shouldFallbackToNextBaseUrl(baseUrl, status) {
  return baseUrl === "/api/proxy" && Number(status) >= 500;
}
