import {
  resolveApiBaseUrls,
  shouldFallbackToNextBaseUrl,
} from "./apiBaseUrls.js";

const API_BASE_URLS = resolveApiBaseUrls({
  configuredBaseUrl: import.meta.env.VITE_API_BASE_URL,
  dev: import.meta.env.DEV,
});
const API_ACCESS_TOKEN = import.meta.env.VITE_API_ACCESS_TOKEN || "";

const ENDPOINT_DEFAULTS = {
  plan: { fromDays: 90, rows: 100, maxPages: 2 },
  spec: { fromDays: 14, rows: 100, maxPages: 2 },
  bids: { fromDays: 30, rows: 100, maxPages: 2 },
  awards: { fromDays: 30, rows: 100, maxPages: 5 },
  contract: { fromDays: 30, rows: 100, maxPages: 2 },
  price: { fromDays: 30, rows: 100, maxPages: 2 },
  stats: { fromDays: 30, rows: 100, maxPages: 1 },
  lofin: { fromDays: 0, rows: 100, maxPages: 3 },
};

export async function fetchEndpoint(endpoint, { keyword = "", from, rows, pageNo = 1 } = {}) {
  const params = new URLSearchParams({
    endpoint,
    keyword,
    rows: String(rows || ENDPOINT_DEFAULTS[endpoint]?.rows || 100),
    pageNo: String(pageNo),
    from: from || dateBefore(ENDPOINT_DEFAULTS[endpoint]?.fromDays || 90),
  });

  return fetchJsonWithFallback(endpoint, params);
}

// 한 번 연결된 Worker 주소를 기억해 죽어있는 포트(예: dev의 8787)를 매 요청마다 재시도하지 않는다
let preferredBaseUrl = null;

export async function fetchPipelineKeywordConfig() {
  return fetchWorkerPath("/api/pipeline-keywords");
}

export async function savePipelineKeywordConfig(companies) {
  return fetchWorkerPath("/api/pipeline-keywords", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companies }),
  });
}

export async function fetchSalesNotes() {
  return fetchWorkerPath("/api/sales-notes");
}

// 바뀐 메모만 보낸다 — 통째로 보내면 다른 사람이 방금 저장한 메모를 덮어쓴다
export async function saveSalesNotes(notes) {
  return fetchWorkerPath("/api/sales-notes", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes }),
  });
}

async function fetchWorkerPath(path, init = {}) {
  let lastError;
  const baseUrls = preferredBaseUrl
    ? [preferredBaseUrl, ...API_BASE_URLS.filter((baseUrl) => baseUrl !== preferredBaseUrl)]
    : API_BASE_URLS;
  for (const baseUrl of baseUrls) {
    try {
      const headers = {
        ...(init.headers || {}),
        ...(API_ACCESS_TOKEN ? { "x-api-token": API_ACCESS_TOKEN } : {}),
      };
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, { ...init, headers });
      if (!res.ok) throw await toApiError(path, res);
      preferredBaseUrl = baseUrl;
      return res.json();
    } catch (error) {
      if (error instanceof ApiResponseError) {
        if (shouldFallbackToNextBaseUrl(baseUrl, error.status)) {
          lastError = error;
          continue;
        }
        preferredBaseUrl = baseUrl;
        throw error;
      }
      lastError = error;
    }
  }
  throw lastError || new Error(`${path} API failed`);
}

async function fetchJsonWithFallback(endpoint, params) {
  let lastError;
  const baseUrls = preferredBaseUrl
    ? [preferredBaseUrl, ...API_BASE_URLS.filter((baseUrl) => baseUrl !== preferredBaseUrl)]
    : API_BASE_URLS;

  for (const baseUrl of baseUrls) {
    try {
      const res = await fetch(`${baseUrl}?${params.toString()}`, {
        headers: API_ACCESS_TOKEN ? { "x-api-token": API_ACCESS_TOKEN } : undefined,
      });

      if (!res.ok) {
        throw await toApiError(endpoint, res);
      }

      preferredBaseUrl = baseUrl;
      return res.json();
    } catch (error) {
      if (error instanceof ApiResponseError) {
        if (shouldFallbackToNextBaseUrl(baseUrl, error.status)) {
          lastError = error;
          continue;
        }
        // 서버가 응답한 것이므로 연결 자체는 유효한 주소다
        preferredBaseUrl = baseUrl;
        throw error;
      }
      lastError = error;
    }
  }

  throw lastError || new Error(`${endpoint} API failed`);
}

async function toApiError(endpoint, res) {
  let detail = "";
  try {
    const payload = await res.json();
    detail = payload?.error || payload?.message || "";
  } catch {
    try {
      detail = await res.text();
    } catch {
      detail = "";
    }
  }
  return new ApiResponseError(endpoint, res.status, detail);
}

export class ApiResponseError extends Error {
  constructor(endpoint, status, detail = "") {
    super(`${endpoint} API failed: ${status}${detail ? ` · ${detail}` : ""}`);
    this.name = "ApiResponseError";
    this.endpoint = endpoint;
    this.status = status;
    this.detail = detail;
  }
}

export async function fetchEndpointPages(endpoint, { keyword = "" } = {}) {
  const defaults = ENDPOINT_DEFAULTS[endpoint] || {};
  const rows = defaults.rows || 100;
  const maxPages = defaults.maxPages || 1;
  const items = [];

  for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
    const payload = await fetchEndpoint(endpoint, { keyword, rows, pageNo });
    const pageItems = extractItems(payload);
    items.push(...pageItems);

    const totalCount = extractTotalCount(payload);
    if (!pageItems.length || pageItems.length < rows || (totalCount && items.length >= totalCount)) {
      break;
    }
  }

  return items;
}

export async function fetchProcurementBundle(keywords, { endpoints: requestedEndpoints, endpointKeywords = {}, onEndpointComplete } = {}) {
  const uniqueKeywords = [...new Set(keywords.filter(Boolean))];
  const endpoints = requestedEndpoints || ["bids", "plan", "spec", "awards", "contract", "price", "stats"];
  const bundle = Object.fromEntries(endpoints.map((endpoint) => [endpoint, []]));

  const endpointResults = [];

  for (const endpoint of endpoints) {
    const endpointRows = [];
    // lofin처럼 endpoint별 전용 키워드(예산 사업명)가 있으면 그것을 사용
    const targetKeywords = Array.isArray(endpointKeywords[endpoint]) && endpointKeywords[endpoint].length
      ? [...new Set(endpointKeywords[endpoint].filter(Boolean))]
      : uniqueKeywords;
    const results = await Promise.allSettled(
      targetKeywords.map(async (keyword) => {
        endpointRows.push(...await fetchEndpointPages(endpoint, { keyword }));
      })
    );
    const rows = dedupeRows(endpoint, endpointRows);
    const endpointResult = {
      endpoint,
      successCount: results.filter((result) => result.status === "fulfilled").length,
      failureCount: results.filter((result) => result.status === "rejected").length,
      firstError: results.find((result) => result.status === "rejected")?.reason,
    };

    bundle[endpoint] = rows;
    endpointResults.push(endpointResult);
    onEndpointComplete?.(endpoint, rows, endpointResult);
  }

  const hasAnySuccess = endpointResults.some((result) => result.successCount > 0);
  const failedEndpoints = endpointResults
    .filter((result) => result.successCount === 0 && result.failureCount > 0)
    .map((result) => result.endpoint);

  if (!hasAnySuccess) {
    const error = endpointResults.find((result) => result.firstError)?.firstError;
    throw error || new Error("All procurement API requests failed");
  }

  return {
    bundle: Object.fromEntries(
      Object.entries(bundle).map(([endpoint, rows]) => [endpoint, dedupeRows(endpoint, rows)])
    ),
    failedEndpoints,
  };
}

export function extractItems(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;

  const body = payload.response?.body || payload.body || payload.data || payload;
  const items = body.items?.item || body.items || body.item || body.list || payload.items;

  if (Array.isArray(items)) return items;
  if (items && typeof items === "object") return [items];
  return [];
}

export function extractTotalCount(payload) {
  const body = payload?.response?.body || payload?.body || payload?.data || payload;
  const value = body?.totalCount ?? body?.totalCnt ?? body?.total_count;
  const parsed = Number(String(value || "").replace(/[^\d]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dedupeRows(endpoint, rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = rowIdentity(endpoint, row);
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function rowIdentity(endpoint, row) {
  const candidates = {
    bids: [row.bidNtceNo, row.bidNtceOrd, row.bidNtceNm, row.ntceInsttNm, row.opengDt],
    awards: [row.bidNtceNo, row.bidNtceOrd, row.sucsfbidCorpNm, row.sucsfbidAmt, row.opengDt],
    contract: [row.cntrctNo, row.cntrctNm, row.cntrctDt, row.cntrctrNm, row.cntrctAmt],
    plan: [row.orderPlanNo, row.bizNm, row.prdctIdntfcNoNm, row.orderDt, row.dminsttNm],
    spec: [row.prdctClsfcNo, row.prdctIdntfcNoNm, row.opninRcptDt, row.ntceInsttNm],
    price: [row.prdctClsfcNo, row.prdctIdntfcNoNm, row.krnPrdctNm, row.unitPrice, row.region],
    stats: [row.prdctIdntfcNoNm, row.prdctClsfcNm, row.srchBssYm, row.cntrctAmt],
    lofin: [row.lofinOrgNm, row.lofinBizNm, row.lofinYear, row.lofinBudgetAmt],
  }[endpoint] || Object.values(row);

  const key = candidates.filter(Boolean).join("|");
  return key || "";
}

export function dateBefore(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return formatKstDate(d);
}

function formatKstDate(date) {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, "");
}
