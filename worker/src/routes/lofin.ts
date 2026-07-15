import { LOFIN_BASE_URL } from "../config/apiEndpoints";
import { DataGoKrError } from "../services/dataGoKrClient";
import type { Env } from "../types/api";

type JsonRecord = Record<string, unknown>;

// 지방재정365 세부사업별 세출현황 (v6 명세 4~5장)
// 파라미터 스타일: ?Key=...&Type=json&pIndex=1&pSize=100&fyr=2026&sbiz_nm=키워드
// 데이터셋 경로는 포털별로 다르므로 인증키 발급 후 LOFIN_API_PATH로 확정한다.
export async function getLofinBudgets(env: Env, searchParams = new URLSearchParams()) {
  const apiKey = env.LOFIN_KEY;
  if (!apiKey) {
    throw new DataGoKrError("LOFIN_KEY가 설정되지 않았습니다. lofin365.go.kr에서 인증키를 발급해 등록하세요.", 502);
  }

  const apiPath = env.LOFIN_API_PATH;
  if (!apiPath) {
    throw new DataGoKrError("LOFIN_API_PATH가 설정되지 않았습니다. 인증키 발급 후 세부사업별 세출현황 API 경로를 등록하세요.", 502);
  }

  const keyword = searchParams.get("keyword") || searchParams.get("dbiz_nm") || "";
  const pSize = searchParams.get("rows") || searchParams.get("pSize") || "100";
  const pIndex = searchParams.get("pageNo") || searchParams.get("pIndex") || "1";
  const fyr = searchParams.get("fyr") || String(currentKstYear());
  const requestedExeYmd = searchParams.get("exe_ymd") || "";

  // exe_ymd(집행일자)는 필수 — 일 단위 스냅샷이라 주말·공휴일엔 데이터가 없을 수 있어 최근 날짜부터 며칠 거슬러 탐색
  const exeYmdCandidates = requestedExeYmd
    ? [requestedExeYmd]
    : [1, 2, 3, 4, 5, 6, 7].map((daysAgo) => kstDateBefore(daysAgo));

  let items: ReturnType<typeof mapLofinItem>[] = [];
  let usedExeYmd = exeYmdCandidates[0];
  let totalCount = 0;

  for (const exeYmd of exeYmdCandidates) {
    const url = new URL(apiPath.startsWith("http") ? apiPath : `${LOFIN_BASE_URL}${apiPath}`);
    url.searchParams.set("Key", apiKey);
    url.searchParams.set("Type", "json");
    url.searchParams.set("pIndex", pIndex);
    url.searchParams.set("pSize", pSize);
    url.searchParams.set("fyr", fyr);
    url.searchParams.set("exe_ymd", exeYmd);
    if (keyword) url.searchParams.set("dbiz_nm", keyword);

    const res = await fetch(url.toString());
    const text = await res.text();

    if (!res.ok) {
      throw new DataGoKrError(`지방재정365 요청 실패: ${res.status}`, 502);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      const snippet = text.replace(/\s+/g, " ").slice(0, 180);
      throw new DataGoKrError(`지방재정365 응답이 JSON이 아닙니다: ${snippet}`, 502);
    }

    assertLofinResult(payload);
    const rows = extractLofinRows(payload);
    items = rows.map(mapLofinItem).filter((item) => item.lofinOrgNm || item.lofinBizNm);
    usedExeYmd = exeYmd;
    totalCount = extractLofinTotalCount(payload) || items.length;
    if (items.length) break; // INFO-200(데이터 없음)이면 하루 더 과거로
  }

  return {
    ok: true,
    mode: "live",
    endpoint: "lofin",
    operation: "sbizBudgetExpenditure",
    keyword,
    exeYmd: usedExeYmd,
    response: {
      body: {
        pageNo: Number(pIndex),
        numOfRows: Number(pSize),
        totalCount,
        items,
      },
    },
  };
}

// lofin365는 오류를 HTTP 200 + RESULT.CODE(ERROR-xxx)로 반환한다. INFO-200(데이터 없음)은 정상 처리.
function assertLofinResult(payload: unknown) {
  const results: JsonRecord[] = [];
  const collect = (value: unknown, depth: number) => {
    if (depth > 3) return;
    if (Array.isArray(value)) {
      value.forEach((entry) => collect(entry, depth + 1));
      return;
    }
    if (!isRecord(value)) return;
    if (value.RESULT !== undefined) collect(value.RESULT, depth + 1);
    if (typeof value.CODE === "string") results.push(value);
    for (const child of Object.values(value)) {
      if (isRecord(child) || Array.isArray(child)) collect(child, depth + 1);
    }
  };
  collect(payload, 0);

  for (const result of results) {
    const code = String(result.CODE ?? "");
    if (code.startsWith("ERROR")) {
      throw new DataGoKrError(`지방재정365 오류 ${code}: ${String(result.MESSAGE ?? "").replace(/\\n/g, " ")}`, 502);
    }
  }
}

// 지방재정365/열린데이터 계열 응답 구조가 포털마다 달라 { head/row }, { response.body.items }, 배열 전부 흡수한다.
function extractLofinRows(payload: unknown): JsonRecord[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];

  const body = (isRecord(payload.response) ? (payload.response as JsonRecord).body : undefined) ?? payload.body;
  if (isRecord(body)) {
    const items = (body as JsonRecord).items;
    if (Array.isArray(items)) return items.filter(isRecord);
    if (isRecord(items) && Array.isArray(items.item)) return (items.item as unknown[]).filter(isRecord);
  }

  for (const value of Object.values(payload)) {
    if (Array.isArray(value)) {
      const rows = value.filter(isRecord).filter((row) => !("head" in row));
      const rowArrays = value.filter(isRecord).flatMap((entry) => (Array.isArray(entry.row) ? entry.row : []));
      if (rowArrays.length) return rowArrays.filter(isRecord);
      if (rows.length) return rows;
    }
    if (isRecord(value) && Array.isArray(value.row)) return (value.row as unknown[]).filter(isRecord);
  }

  return [];
}

function extractLofinTotalCount(payload: unknown): number {
  if (!isRecord(payload)) return 0;
  const candidates: unknown[] = [];
  const walk = (value: unknown, depth: number) => {
    if (depth > 3 || !isRecord(value)) return;
    if (value.list_total_count !== undefined) candidates.push(value.list_total_count);
    if (value.totalCount !== undefined) candidates.push(value.totalCount);
    for (const child of Object.values(value)) {
      if (isRecord(child)) walk(child, depth + 1);
      if (Array.isArray(child)) child.forEach((entry) => walk(entry, depth + 1));
    }
  };
  walk(payload, 0);
  const parsed = Number(String(candidates[0] ?? "").replace(/[^\d]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

// 세부사업별 세출현황(QWGJK) 명세 기준 필드 매핑
function mapLofinItem(item: JsonRecord) {
  return {
    ...item,
    lofinOrgNm: str(item.laf_hg_nm, item.wa_laf_hg_nm),          // 자치단체명 → 지역명 폴백
    lofinBizNm: str(item.dbiz_nm),                                // 세부사업명
    lofinBudgetAmt: str(item.bdg_cash_amt),                       // 예산현액
    lofinSpentAmt: str(item.ep_amt),                              // 지출액
    lofinYear: str(item.fyr),                                     // 회계연도
    lofinRegionNm: str(item.wa_laf_hg_nm),                        // 지역명 (시도)
    lofinExeYmd: str(item.exe_ymd),                               // 집행일자 (스냅샷 기준일)
    lofinFieldNm: str(item.fld_nm),                               // 분야명
  };
}

function str(...values: unknown[]) {
  return String(values.find((value) => String(value ?? "").trim()) ?? "").trim();
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function currentKstYear() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCFullYear();
}

function kstDateBefore(daysAgo: number) {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  kst.setUTCDate(kst.getUTCDate() - daysAgo);
  return kst.toISOString().slice(0, 10).replace(/-/g, "");
}
