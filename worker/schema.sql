-- 여러 사람이 함께 보는 공유 상태 (Cloudflare D1).
-- 적용: npx wrangler d1 execute market-dashboard --remote --file=./schema.sql

-- 검색 키워드. 회사별 목록을 통째로 교체하므로 (company_id, keyword)가 곧 식별자다.
CREATE TABLE IF NOT EXISTS company_keywords (
  company_id TEXT NOT NULL,
  keyword    TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (company_id, keyword)
);

-- 영업 메모. 여러 명이 동시에 고칠 수 있으므로 행 단위로 UPSERT 한다 —
-- 한 사람이 저장해도 다른 사람이 방금 쓴 다른 메모를 덮어쓰지 않는다.
CREATE TABLE IF NOT EXISTS sales_notes (
  note_key     TEXT PRIMARY KEY,
  company_id   TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'none',
  memo         TEXT NOT NULL DEFAULT '',
  last_contact TEXT NOT NULL DEFAULT '',
  updated_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sales_notes_company ON sales_notes (company_id);
