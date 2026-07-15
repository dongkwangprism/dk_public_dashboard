// SQLite 적재 — 복합키(납품요구번호+납품요구변경차수+물품순번) upsert
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "./config.mjs";

// 한글 헤더 → 컬럼 매핑 (조회에 자주 쓰는 필드만 컬럼으로, 전체 원본은 raw JSON에 보존)
const COLUMN_MAP = {
  납품요구번호: "dlvr_req_no",
  납품요구변경차수: "dlvr_req_chg_ord",
  물품순번: "item_seq",
  수요기관코드: "dminstt_cd",
  수요기관: "dminstt_nm",
  납품요구일자: "dlvr_req_dt",
  납품요구명: "dlvr_req_nm",
  업체사업자등록번호: "corp_reg_no",
  업체명: "corp_nm",
  품명: "prdct_clsfc_nm",
  세부품명: "dtl_prdct_nm",
  물품식별번호: "prdct_idnt_no",
  품목명: "prdct_nm",
  납품기한: "dlvr_tmlmt_dt",
  계약구분: "cntrct_se",
  계약번호: "cntrct_no",
  구매방법: "prchs_mthd",
  최종납품요구여부: "last_dlvr_req_yn",
  수요기관소재시군구: "dminstt_sgg",
  지청: "branch_nm",
  계약단가: "cntrct_uprc",
  납품단가: "dlvr_uprc",
  단위: "unit",
  납품수량: "dlvr_qty",
  납품금액: "dlvr_amt",
};
const NUMERIC_COLS = new Set(["cntrct_uprc", "dlvr_uprc", "dlvr_qty", "dlvr_amt"]);

export function openDb() {
  fs.mkdirSync(path.dirname(CONFIG.dbPath), { recursive: true });
  const db = new DatabaseSync(CONFIG.dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS delivery_items (
      dlvr_req_no      TEXT NOT NULL,
      dlvr_req_chg_ord TEXT NOT NULL DEFAULT '',
      item_seq         TEXT NOT NULL,
      dminstt_cd TEXT, dminstt_nm TEXT, dlvr_req_dt TEXT, dlvr_req_nm TEXT,
      corp_reg_no TEXT, corp_nm TEXT,
      prdct_clsfc_nm TEXT, dtl_prdct_nm TEXT, prdct_idnt_no TEXT, prdct_nm TEXT,
      dlvr_tmlmt_dt TEXT, cntrct_se TEXT, cntrct_no TEXT, prchs_mthd TEXT,
      last_dlvr_req_yn TEXT, dminstt_sgg TEXT, branch_nm TEXT,
      cntrct_uprc INTEGER, dlvr_uprc INTEGER, unit TEXT, dlvr_qty REAL, dlvr_amt INTEGER,
      keywords TEXT DEFAULT '',
      raw TEXT,
      updated_at TEXT,
      PRIMARY KEY (dlvr_req_no, dlvr_req_chg_ord, item_seq)
    );
    CREATE INDEX IF NOT EXISTS idx_delivery_dt ON delivery_items (dlvr_req_dt);
    CREATE INDEX IF NOT EXISTS idx_delivery_org ON delivery_items (dminstt_nm);
  `);
  return db;
}

function toNumber(value) {
  const n = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// rows: 한글 헤더 키의 객체 배열. 반환: { inserted, updated }
export function upsertRows(db, rows) {
  const cols = Object.values(COLUMN_MAP);
  const nonKeyCols = cols.filter((c) => !["dlvr_req_no", "dlvr_req_chg_ord", "item_seq"].includes(c));
  const stmt = db.prepare(`
    INSERT INTO delivery_items (${cols.join(", ")}, keywords, raw, updated_at)
    VALUES (${cols.map(() => "?").join(", ")}, ?, ?, datetime('now', 'localtime'))
    ON CONFLICT (dlvr_req_no, dlvr_req_chg_ord, item_seq) DO UPDATE SET
      ${nonKeyCols.map((c) => `${c} = excluded.${c}`).join(", ")},
      raw = excluded.raw,
      updated_at = excluded.updated_at,
      keywords = CASE
        WHEN instr(',' || delivery_items.keywords || ',', ',' || excluded.keywords || ',') > 0 THEN delivery_items.keywords
        WHEN delivery_items.keywords = '' THEN excluded.keywords
        ELSE delivery_items.keywords || ',' || excluded.keywords
      END
  `);

  let written = 0;
  db.exec("BEGIN");
  try {
    for (const row of rows) {
      if (!String(row["납품요구번호"] || "").trim()) continue;
      const values = Object.entries(COLUMN_MAP).map(([kor, col]) =>
        NUMERIC_COLS.has(col) ? toNumber(row[kor]) : String(row[kor] ?? "").trim()
      );
      stmt.run(...values, String(row["수집키워드"] || "").trim(), JSON.stringify(row));
      written += 1;
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return written;
}

export function upsertKoreanHeaderRow(db, row) {
  return upsertRows(db, [row]);
}
