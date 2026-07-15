// 수동/로그인 다운로드한 CSV 파일을 스트리밍 파싱해 같은 테이블에 upsert.
// 사용: npm run ingest -- <파일.csv> [--keep]   (기본: 적재 성공 시 파일 삭제)
// 대용량 대비: 파일 전체를 메모리에 올리지 않고 청크 단위로 읽어 행 단위 처리한다.
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { openDb, upsertRows } from "./db.mjs";
import { exportSnapshot } from "./exportJson.mjs";

const BATCH_SIZE = 2000;

// 첫 청크로 인코딩 판별: UTF-8 BOM → utf-8, UTF-8로 무결 디코딩되면 utf-8, 아니면 euc-kr
function detectEncoding(firstChunk) {
  if (firstChunk[0] === 0xef && firstChunk[1] === 0xbb && firstChunk[2] === 0xbf) return "utf-8";
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(firstChunk);
    return "utf-8";
  } catch {
    return "euc-kr";
  }
}

// 따옴표/개행 포함 필드를 처리하는 스트리밍 CSV 파서
async function* parseCsvRows(filePath) {
  const stat = fs.statSync(filePath);
  const fd = fs.openSync(filePath, "r");
  const probe = Buffer.alloc(Math.min(64 * 1024, stat.size));
  fs.readSync(fd, probe, 0, probe.length, 0);
  fs.closeSync(fd);
  const encoding = detectEncoding(probe);
  console.log(`[ingest] 인코딩: ${encoding} · 크기: ${(stat.size / 1024 / 1024).toFixed(1)}MB`);

  const decoder = new TextDecoder(encoding);
  const stream = fs.createReadStream(filePath, { highWaterMark: 256 * 1024 });

  // 상태머신: inQuotes 중 '"'를 만나면 quoteSeen으로 보류 → 다음 문자가 '"'면 이스케이프(""), 아니면 닫힘
  let field = "";
  let row = [];
  let inQuotes = false;
  let quoteSeen = false;
  let rowHasContent = false;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const rows = [];
  const endRow = () => {
    endField();
    if (rowHasContent || row.length > 1) rows.push(row);
    row = [];
    rowHasContent = false;
  };

  const feed = (ch) => {
    if (inQuotes) {
      if (quoteSeen) {
        quoteSeen = false;
        if (ch === '"') { field += '"'; return; } // 이스케이프된 따옴표
        inQuotes = false; // 닫힘 — ch는 일반 상태로 재처리
      } else if (ch === '"') {
        quoteSeen = true;
        return;
      } else {
        field += ch;
        return;
      }
    }
    if (ch === '"' && field === "") { inQuotes = true; rowHasContent = true; return; }
    if (ch === ",") { endField(); return; }
    if (ch === "\n") { endRow(); return; }
    if (ch === "\r") return; // CRLF/CR 모두 \n 기준으로 행 종료 (\r 단독은 무시)
    field += ch;
    rowHasContent = true;
  };

  for await (const chunk of stream) {
    for (const ch of decoder.decode(chunk, { stream: true })) feed(ch);
    while (rows.length) yield rows.shift();
  }
  for (const ch of decoder.decode()) feed(ch);
  if (inQuotes && quoteSeen) inQuotes = false;
  if (field !== "" || row.length) endRow();
  while (rows.length) yield rows.shift();
}

export async function ingestCsv(filePath, { keepFile = false } = {}) {
  const db = openDb();
  let header = null;
  let batch = [];
  let total = 0;

  try {
    for await (const cells of parseCsvRows(filePath)) {
      if (!header) {
        header = cells.map((h) => h.replace(/^﻿/, "").trim());
        if (!header.includes("납품요구번호")) {
          throw new Error(`헤더에 '납품요구번호'가 없습니다: ${header.slice(0, 8).join(", ")}...`);
        }
        continue;
      }
      if (cells.length < 3 || cells.every((c) => !c.trim())) continue;
      const row = Object.fromEntries(header.map((h, i) => [h, (cells[i] ?? "").trim()]));
      row["수집키워드"] = "csv";
      batch.push(row);
      if (batch.length >= BATCH_SIZE) {
        total += upsertRows(db, batch);
        batch = [];
        if (total % 20000 === 0) console.log(`[ingest] ${total.toLocaleString()}행 적재…`);
      }
    }
    if (batch.length) total += upsertRows(db, batch);
    const exported = exportSnapshot(db);
    console.log(`[ingest] 완료 · ${total.toLocaleString()}행 upsert · 스냅샷 ${exported.count}행`);
  } finally {
    db.close();
  }

  if (!keepFile) {
    fs.unlinkSync(filePath);
    console.log(`[ingest] 임시 파일 삭제: ${filePath}`);
  }
  return total;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const args = process.argv.slice(2).filter((a) => a !== "--keep");
  const keepFile = process.argv.includes("--keep");
  if (!args[0]) {
    console.error("사용법: npm run ingest -- <파일.csv> [--keep]");
    process.exit(1);
  }
  ingestCsv(args[0], { keepFile }).catch((error) => {
    console.error("[ingest] 실패:", error.message);
    process.exit(1);
  });
}
