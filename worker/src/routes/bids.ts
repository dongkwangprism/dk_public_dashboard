import { DATA_GO_KR_ENDPOINTS } from "../config/apiEndpoints";
import { fetchDataGoKrJson } from "../services/dataGoKrClient";
import type { Env } from "../types/api";

const DEFAULT_ROWS = 100;
const DEFAULT_LOOKBACK_DAYS = 30;

export async function getBids(env: Env, searchParams = new URLSearchParams()) {
  const apiKey = env.DATA_GO_KR_API_KEY || env.API_KEY;

  if (!apiKey) {
    throw new Error("DATA_GO_KR_API_KEY is not configured");
  }

  const keyword = searchParams.get("keyword") || searchParams.get("bidNtceNm") || "";
  const rows = searchParams.get("rows") || searchParams.get("numOfRows") || String(DEFAULT_ROWS);
  const pageNo = searchParams.get("pageNo") || "1";
  const from = searchParams.get("from") || dateBefore(DEFAULT_LOOKBACK_DAYS);
  const to = searchParams.get("to") || today();

  const payload = await fetchDataGoKrJson(
    `${DATA_GO_KR_ENDPOINTS.bids}/getBidPblancListInfoThngPPSSrch`,
    {
      inqryDiv: searchParams.get("inqryDiv") || "1",
      inqryBgnDt: toDateTime(from, "0000"),
      inqryEndDt: toDateTime(to, "2359"),
      bidNtceNm: keyword,
      pageNo,
      numOfRows: rows,
    },
    apiKey
  );

  return {
    ok: true,
    mode: "live",
    endpoint: "bids",
    operation: "getBidPblancListInfoThngPPSSrch",
    keyword,
    response: (payload as { response?: unknown }).response ?? payload,
  };
}

function toDateTime(value: string, suffix: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 12) return digits.slice(0, 12);
  if (digits.length >= 8) return `${digits.slice(0, 8)}${suffix}`;
  return `${dateBefore(DEFAULT_LOOKBACK_DAYS)}${suffix}`;
}

function today() {
  return formatKstDate(new Date());
}

function dateBefore(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return formatKstDate(date);
}

function formatKstDate(date: Date) {
  return formatDate(new Date(date.getTime() + 9 * 60 * 60 * 1000));
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}
