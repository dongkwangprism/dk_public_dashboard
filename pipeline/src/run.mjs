// 1회 실행: 보고서 스크래핑 → SQLite upsert → 대시보드용 JSON 스냅샷
import { pathToFileURL } from "node:url";
import { dateRange, resolvePipelineKeywords } from "./config.mjs";
import { scrapeDeliveryReport } from "./scrapeReport.mjs";
import { openDb, upsertRows } from "./db.mjs";
import { exportSnapshot } from "./exportJson.mjs";

export async function runOnce() {
  const started = Date.now();
  const { from, to } = dateRange();
  const { keywords, source } = await resolvePipelineKeywords();
  if (!keywords.length) throw new Error("수집할 pipeline 키워드가 없습니다");
  console.log(`[g2b-pipeline] 시작 ${new Date().toLocaleString("ko-KR")} · 기간 ${from}~${to} · 키워드 소스 ${source} · ${keywords.join(", ")}`);

  const rows = await scrapeDeliveryReport({
    from,
    to,
    keywords,
    onKeywordDone: (keyword, count) => console.log(`  - [${keyword}] ${count}행 수집`),
  });

  const db = openDb();
  try {
    const written = upsertRows(db, rows);
    const exported = exportSnapshot(db);
    console.log(
      `[g2b-pipeline] 완료 (${Math.round((Date.now() - started) / 1000)}초) · upsert ${written}행 · 스냅샷 ${exported.count}행 → ${exported.path}`
    );
  } finally {
    db.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  runOnce().catch((error) => {
    console.error("[g2b-pipeline] 실패:", error.message);
    process.exit(1);
  });
}
