import { DataGoKrError } from "../services/dataGoKrClient";
import type { Env } from "../types/api";

// 대시보드를 여는 모든 브라우저와 pipeline이 함께 보는 상태.
// D1(SQLite)을 쓰는 이유: 행 단위 UPSERT라 두 사람이 거의 동시에 저장해도
// 서로의 내용을 덮어쓰지 않는다. 통째로 읽고 다시 쓰는 방식이면 나중에 저장한 쪽이
// 먼저 저장한 사람의 메모를 지워버린다.

const COMPANY_ID_PATTERN = /^[a-z0-9_-]{1,40}$/i;
const MAX_KEYWORDS_PER_COMPANY = 50;
const MAX_KEYWORD_LENGTH = 80;
const MAX_NOTES_PER_REQUEST = 200;
const MAX_NOTE_KEY_LENGTH = 300;
const MAX_MEMO_LENGTH = 2000;
const SALES_STATUSES = new Set(["none", "catalog_sent", "called", "quoted", "ongoing", "closed"]);

function requireDb(env: Env): D1Database {
  if (!env.DASHBOARD_DB) {
    throw new DataGoKrError("DASHBOARD_DB D1 binding is not configured", 503);
  }
  return env.DASHBOARD_DB;
}

function latest(current: string, candidate: string): string {
  // ISO 8601 문자열은 사전순 비교가 곧 시간순 비교다
  return candidate > current ? candidate : current;
}

export async function getPipelineKeywords(env: Env) {
  if (!env.DASHBOARD_DB) {
    return { ok: true, configured: false, companies: null, updatedAt: null };
  }

  const { results } = await env.DASHBOARD_DB
    .prepare("SELECT company_id, keyword, updated_at FROM company_keywords ORDER BY company_id, rowid")
    .all<{ company_id: string; keyword: string; updated_at: string }>();

  const companies: Record<string, string[]> = {};
  let updatedAt = "";
  for (const row of results) {
    (companies[row.company_id] ||= []).push(row.keyword);
    updatedAt = latest(updatedAt, row.updated_at);
  }

  // 아직 아무도 저장한 적이 없으면 companies를 비워 보낸다 —
  // 프론트엔드가 이걸 보고 자기 목록으로 서버를 초기화한다.
  return {
    ok: true,
    configured: true,
    companies: Object.keys(companies).length ? companies : null,
    updatedAt: updatedAt || null,
  };
}

export async function putPipelineKeywords(request: Request, env: Env) {
  const db = requireDb(env);
  const body = await request.json() as { companies?: Record<string, unknown> };
  const companies = normalizePipelineCompanies(body?.companies);
  const updatedAt = new Date().toISOString();

  const statements: D1PreparedStatement[] = [];
  for (const [companyId, keywords] of Object.entries(companies)) {
    // 목록을 통째로 교체한다 — 삭제한 키워드가 되살아나면 안 된다
    statements.push(db.prepare("DELETE FROM company_keywords WHERE company_id = ?").bind(companyId));
    for (const keyword of keywords) {
      statements.push(
        db
          .prepare("INSERT INTO company_keywords (company_id, keyword, updated_at) VALUES (?, ?, ?)")
          .bind(companyId, keyword, updatedAt)
      );
    }
  }
  await db.batch(statements);

  return { ok: true, configured: true, companies, updatedAt };
}

function normalizePipelineCompanies(value: Record<string, unknown> | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DataGoKrError("companies object is required", 400);
  }

  const companies: Record<string, string[]> = {};
  for (const [companyId, rawKeywords] of Object.entries(value)) {
    if (!COMPANY_ID_PATTERN.test(companyId) || !Array.isArray(rawKeywords)) continue;
    companies[companyId] = [...new Set(
      rawKeywords
        .map((keyword) => String(keyword || "").trim())
        .filter((keyword) => keyword.length > 0 && keyword.length <= MAX_KEYWORD_LENGTH)
    )].slice(0, MAX_KEYWORDS_PER_COMPANY);
  }

  if (!Object.keys(companies).length) {
    throw new DataGoKrError("at least one company keyword list is required", 400);
  }
  return companies;
}

export async function getSalesNotes(env: Env) {
  if (!env.DASHBOARD_DB) {
    return { ok: true, configured: false, notes: null, updatedAt: null };
  }

  const { results } = await env.DASHBOARD_DB
    .prepare("SELECT note_key, company_id, status, memo, last_contact, updated_at FROM sales_notes")
    .all<{
      note_key: string;
      company_id: string;
      status: string;
      memo: string;
      last_contact: string;
      updated_at: string;
    }>();

  const notes: Record<string, unknown> = {};
  let updatedAt = "";
  for (const row of results) {
    notes[row.note_key] = {
      company: row.company_id,
      status: row.status,
      memo: row.memo,
      lastContact: row.last_contact,
      updatedAt: row.updated_at,
    };
    updatedAt = latest(updatedAt, row.updated_at);
  }

  return { ok: true, configured: true, notes, updatedAt: updatedAt || null };
}

// 바뀐 메모만 골라 보낸다. 건드리지 않은 메모는 손대지 않으므로
// 다른 사람이 동시에 편집하던 내용이 사라지지 않는다.
export async function patchSalesNotes(request: Request, env: Env) {
  const db = requireDb(env);
  const body = await request.json() as { notes?: Record<string, unknown> };
  const entries = normalizeSalesNotes(body?.notes);
  const updatedAt = new Date().toISOString();

  await db.batch(entries.map((entry) =>
    db
      .prepare(
        `INSERT INTO sales_notes (note_key, company_id, status, memo, last_contact, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(note_key) DO UPDATE SET
           company_id = excluded.company_id,
           status = excluded.status,
           memo = excluded.memo,
           last_contact = excluded.last_contact,
           updated_at = excluded.updated_at`
      )
      .bind(entry.noteKey, entry.companyId, entry.status, entry.memo, entry.lastContact, updatedAt)
  ));

  return { ok: true, configured: true, saved: entries.length, updatedAt };
}

function normalizeSalesNotes(value: Record<string, unknown> | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DataGoKrError("notes object is required", 400);
  }

  const entries = [];
  for (const [noteKey, rawNote] of Object.entries(value)) {
    if (!noteKey || noteKey.length > MAX_NOTE_KEY_LENGTH) continue;
    if (!rawNote || typeof rawNote !== "object" || Array.isArray(rawNote)) continue;

    const note = rawNote as Record<string, unknown>;
    // 메모 키는 "회사|기관|사업명" 형태다. company가 빠져 있으면 키 앞부분에서 되찾는다.
    const companyId = String(note.company || noteKey.split("|")[0] || "").trim();
    if (!COMPANY_ID_PATTERN.test(companyId)) continue;

    const status = String(note.status || "none");
    entries.push({
      noteKey,
      companyId,
      status: SALES_STATUSES.has(status) ? status : "none",
      memo: String(note.memo || "").slice(0, MAX_MEMO_LENGTH),
      lastContact: String(note.lastContact || "").slice(0, 10),
    });
  }

  if (!entries.length) {
    throw new DataGoKrError("at least one valid note is required", 400);
  }
  if (entries.length > MAX_NOTES_PER_REQUEST) {
    throw new DataGoKrError(`too many notes in one request (max ${MAX_NOTES_PER_REQUEST})`, 400);
  }
  return entries;
}
