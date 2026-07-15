export async function fetchDataGoKrJson(
  baseUrl: string,
  params: Record<string, string | number | undefined>,
  apiKey: string
): Promise<unknown> {
  const url = new URL(baseUrl);

  url.searchParams.set("ServiceKey", normalizeServiceKey(apiKey));
  url.searchParams.set("type", "json");

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const res = await fetch(url.toString());
  const text = await res.text();

  if (!res.ok) {
    const snippet = text.replace(/\s+/g, " ").trim().slice(0, 160);
    throw new DataGoKrError(`data.go.kr request failed: ${res.status}${snippet ? ` · ${snippet}` : ""}`, res.status);
  }

  const payload = parseJsonResponse(text);
  validateDataGoKrPayload(payload);
  return payload;
}

function normalizeServiceKey(apiKey: string) {
  try {
    return decodeURIComponent(apiKey);
  } catch {
    return apiKey;
  }
}

function parseJsonResponse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const snippet = text.replace(/\s+/g, " ").slice(0, 180);
    throw new DataGoKrError(`data.go.kr returned non-JSON response: ${snippet}`, 502);
  }
}

function validateDataGoKrPayload(payload: unknown) {
  const header = findHeader(payload);
  const resultCode = String(header?.resultCode ?? header?.resultCd ?? "").trim();
  const resultMessage = String(header?.resultMsg ?? header?.resultMessage ?? "").trim();

  if (resultCode && resultCode !== "00" && resultCode !== "0") {
    throw new DataGoKrError(`data.go.kr error ${resultCode}${resultMessage ? `: ${resultMessage}` : ""}`, 502);
  }
}

function findHeader(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;

  if (isRecord(record.header)) return record.header;

  if (isRecord(record["nkoneps.com.response.ResponseError"])) {
    const responseError = record["nkoneps.com.response.ResponseError"] as Record<string, unknown>;
    if (isRecord(responseError.header)) return responseError.header;
  }

  if (isRecord(record.response)) {
    const response = record.response as Record<string, unknown>;
    if (isRecord(response.header)) return response.header;
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class DataGoKrError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "DataGoKrError";
    this.status = status;
  }
}
