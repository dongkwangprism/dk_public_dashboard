import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const CONFIG = {
  reportUrl: "https://data.g2b.go.kr/link/AISC001_01/?reptNm=UI-ADOXAA-038R",

  // 요청명(납품요구명) 서버사이드 필터에 넣을 키워드 — 대시보드 회사 키워드와 동일하게 유지
  keywords: (process.env.G2B_KEYWORDS || "흡연부스,이동식초소,흡연실,분리수거함,클린하우스,제설함,음식물쓰레기통,쓰레기수거함,자전거거치대")
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean),

  // 프론트엔드와 공유하는 Worker KV 키워드 설정. URL이 없거나 요청이 실패하면 위 기본값으로 폴백.
  keywordConfigUrl: process.env.PIPELINE_CONFIG_URL || "",
  keywordConfigToken: process.env.PIPELINE_API_TOKEN || "",

  // 납품요구일자 조회 창 — 데이터 반영이 2~3주 지연되므로 넉넉히 잡고 upsert로 중복 흡수
  windowDays: Number(process.env.G2B_WINDOW_DAYS || 45),

  // 키워드당 최대 수집 페이지(페이지당 50행) — 폭주 방지
  maxPagesPerKeyword: Number(process.env.G2B_MAX_PAGES || 40),

  dbPath: process.env.G2B_DB_PATH || path.join(ROOT, "data", "delivery.sqlite"),
  exportPath: process.env.G2B_EXPORT_PATH || path.join(ROOT, "..", "frontend", "public", "delivery.json"),
  tmpDir: process.env.G2B_TMP_DIR || path.join(ROOT, "tmp"),

  // 매월 1일 04:00 KST
  cronExpr: process.env.G2B_CRON || "0 4 1 * *",
  cronTimezone: "Asia/Seoul",

  headless: process.env.G2B_HEADFUL !== "1",
  // 보고서 조회가 느릴 수 있어 단계별 타임아웃을 넉넉히
  searchTimeoutMs: 240_000,
  pageNavTimeoutMs: 90_000,
};

export async function resolvePipelineKeywords() {
  // 실행 시 명시한 G2B_KEYWORDS는 일회성 override로 가장 우선한다.
  if (process.env.G2B_KEYWORDS) {
    return { keywords: CONFIG.keywords, source: "G2B_KEYWORDS" };
  }
  if (!CONFIG.keywordConfigUrl) {
    return { keywords: CONFIG.keywords, source: "기본값 (PIPELINE_CONFIG_URL 미설정)" };
  }
  try {
    const res = await fetch(CONFIG.keywordConfigUrl, {
      headers: CONFIG.keywordConfigToken ? { "x-api-token": CONFIG.keywordConfigToken } : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    const companies = payload?.companies && typeof payload.companies === "object" ? payload.companies : null;
    const keywords = companies
      ? [...new Set(Object.values(companies).flatMap((items) => Array.isArray(items) ? items : []).map((item) => String(item || "").trim()).filter(Boolean))]
      : [];
    if (!payload?.configured || !keywords.length) throw new Error("공용 키워드가 없음");
    return { keywords, source: `Worker KV (${CONFIG.keywordConfigUrl})` };
  } catch (error) {
    console.warn(`[g2b-pipeline] 공용 키워드 로드 실패 → 기본값 사용: ${error.message}`);
    return { keywords: CONFIG.keywords, source: "기본값 (공용 설정 로드 실패)" };
  }
}

export function dateRange(now = new Date()) {
  const to = new Date(now);
  const from = new Date(now);
  from.setDate(from.getDate() - CONFIG.windowDays);
  const fmt = (d) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return { from: fmt(from), to: fmt(to) };
}
