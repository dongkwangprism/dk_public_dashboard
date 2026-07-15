// 조달데이터허브 보고서(UI-ADOXAA-038R)를 헤드리스 브라우저로 조회해 그리드를 구조화 추출한다.
// CSV 다운로드는 비로그인 세션에서 파일이 생성되지 않아, 서버사이드 필터(요청명) + 그리드 스크래핑으로 대체.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "./config.mjs";

const REPORT_LINK_TEXT = "종합쇼핑몰 납품요구 물품 내역";
const DATE_FROM_ID = "wq_uuid_157_ibxStrDay";
const DATE_TO_ID = "wq_uuid_157_ibxEndDay";
const REQ_NAME_ID = "mf_popupCnts_comp17"; // 요청명
const SEARCH_BTN_ID = "mf_popupCnts_btnS0001";

export async function scrapeDeliveryReport({ from, to, keywords, onKeywordDone }) {
  const browser = await chromium.launch({ headless: CONFIG.headless });
  const context = await browser.newContext();
  const results = [];
  try {
    const page = await context.newPage();
    page.on("dialog", (d) => d.accept().catch(() => {}));

    await page.goto(CONFIG.reportUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector(`text=${REPORT_LINK_TEXT}`, { timeout: 60_000 });
    await page.click(`text=${REPORT_LINK_TEXT}`);

    // 보고서 팝업(WebSquare popupLayout) 로드 대기
    let popup = null;
    for (let i = 0; i < 60 && !popup; i++) {
      await page.waitForTimeout(1000);
      popup = context.pages().find((p) => p.url().includes("popupLayout"));
      if (popup) {
        const ready = await popup.evaluate(
          () => !!document.getElementById("mf_popupCnts_btnS0001"),
        ).catch(() => false);
        if (!ready) popup = null;
      }
    }
    if (!popup) throw new Error("보고서 팝업이 열리지 않았습니다");
    popup.on("dialog", (d) => d.accept().catch(() => {}));
    await popup.waitForTimeout(3000);

    for (const keyword of keywords) {
      const rows = await scrapeKeyword(popup, { from, to, keyword });
      results.push(...rows);
      onKeywordDone?.(keyword, rows.length);
    }
    return results;
  } catch (error) {
    await saveDebugShot(context, error);
    throw error;
  } finally {
    await browser.close();
  }
}

async function scrapeKeyword(popup, { from, to, keyword }) {
  const setInput = async (id, value) => {
    const loc = popup.locator(`#${id}`);
    await loc.click();
    await loc.fill("");
    if (value) await loc.type(value, { delay: 30 });
    await popup.keyboard.press("Tab");
  };
  await setInput(DATE_FROM_ID, from);
  await setInput(DATE_TO_ID, to);
  await setInput(REQ_NAME_ID, keyword);
  await popup.evaluate((id) => document.getElementById(id).click(), SEARCH_BTN_ID);

  // 조회 완료 대기: 그리드에 "Data rows: 1 - 50 of N" 또는 "No data returned"
  const deadline = Date.now() + CONFIG.searchTimeoutMs;
  let state = null;
  while (Date.now() < deadline && !state) {
    await popup.waitForTimeout(4000);
    state = await readGridState(popup);
  }
  if (!state) throw new Error(`[${keyword}] 조회 시간 초과`);
  if (state.total === 0) return [];

  const rows = [];
  let header = null;
  const maxPages = Math.min(state.pages, CONFIG.maxPagesPerKeyword);
  if (state.pages > CONFIG.maxPagesPerKeyword) {
    console.warn(`[${keyword}] ${state.pages}페이지 중 ${CONFIG.maxPagesPerKeyword}페이지만 수집 (G2B_MAX_PAGES로 조정 가능)`);
  }

  for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
    const extracted = await extractGridRows(popup);
    if (!extracted) throw new Error(`[${keyword}] ${pageNo}페이지 그리드 추출 실패`);
    header = header || extracted.header;
    for (const cells of extracted.rows) {
      const row = Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""]));
      row["수집키워드"] = keyword;
      rows.push(row);
    }
    if (pageNo < maxPages) {
      const prevSignature = extracted.rows[0]?.join("|") || "";
      await goNextPage(popup, prevSignature);
    }
  }
  return rows;
}

// MSTR 그리드 UI는 세션에 따라 영어/한국어가 섞여 나온다 — 두 언어 모두 처리
const ROWS_LABEL = /(?:Data rows|데이터 행)\s*:/;
const NO_DATA = /No data returned|데이터가 없습니다/;

async function findGridFrame(popup) {
  for (const frame of popup.frames()) {
    if (!frame.url().includes("/portal/servlet/mstrWeb") || frame.url().includes("iframeIdle")) continue;
    const text = await frame.evaluate(() => document.body?.innerText || "").catch(() => "");
    if (ROWS_LABEL.test(text) || NO_DATA.test(text)) return { frame, text };
  }
  return null;
}

async function readGridState(popup) {
  const found = await findGridFrame(popup);
  if (!found) return null;
  if (NO_DATA.test(found.text)) return { total: 0, pages: 0 };
  // 50행 초과: "Data rows: 1 - 50 of 974" / 이하: "Data rows: 16" (한국어: "데이터 행: 16")
  const m = found.text.match(/(?:Data rows|데이터 행)\s*:\s*([\d,]+)(?:\s*-\s*[\d,]+\s*(?:of|\/)\s*([\d,]+))?/);
  if (!m) return null;
  const total = Number((m[2] || m[1]).replace(/,/g, ""));
  if (!Number.isFinite(total)) return null;
  return { total, pages: Math.max(1, Math.ceil(total / 50)) };
}

async function extractGridRows(popup) {
  const found = await findGridFrame(popup);
  if (!found) return null;
  return found.frame.evaluate(() => {
    // 헤더 행에 '납품요구번호' 셀이 있는 가장 안쪽 데이터 테이블을 찾는다 (MSTR은 레이아웃 테이블이 중첩됨)
    const tables = [...document.querySelectorAll("table")];
    let best = null;
    for (const table of tables) {
      const firstRowCells = [...(table.rows[0]?.cells || [])].map((c) => c.innerText.trim());
      if (!firstRowCells.includes("납품요구번호")) continue;
      if (!best || table.rows.length > best.rows.length) best = table;
    }
    if (!best) return null;
    const header = [...best.rows[0].cells].map((c) => c.innerText.trim());
    const rows = [];
    for (let i = 1; i < best.rows.length; i++) {
      const cells = [...best.rows[i].cells].map((c) => c.innerText.trim());
      // 데이터 행만 (레이아웃/페이저 행 제외)
      if (cells.length === header.length && cells.some(Boolean)) rows.push(cells);
    }
    return { header, rows };
  });
}

async function goNextPage(popup, prevSignature) {
  const found = await findGridFrame(popup);
  if (!found) throw new Error("그리드 frame 소실");
  const clicked = await found.frame.evaluate(() => {
    // Next 버튼 title/alt도 UI 언어에 따라 바뀔 수 있다
    const img = [...document.querySelectorAll("img")].find(
      (el) => /^(next|다음)/i.test(el.title || el.alt || "") && el.closest("a")
    );
    if (!img) return false;
    img.closest("a").click();
    return true;
  });
  if (!clicked) throw new Error("Next 페이지 버튼을 찾지 못했습니다");

  // 다음 페이지 렌더 대기: 첫 데이터 행 내용이 이전 페이지와 달라질 때까지
  const deadline = Date.now() + CONFIG.pageNavTimeoutMs;
  while (Date.now() < deadline) {
    await popup.waitForTimeout(2500);
    const extracted = await extractGridRows(popup).catch(() => null);
    const signature = extracted?.rows[0]?.join("|") || "";
    if (signature && signature !== prevSignature) return;
  }
  throw new Error("다음 페이지 이동 시간 초과");
}

async function saveDebugShot(context, error) {
  try {
    fs.mkdirSync(CONFIG.tmpDir, { recursive: true });
    const file = path.join(CONFIG.tmpDir, `error-${Date.now()}.png`);
    const target = context.pages().at(-1);
    if (target) {
      await target.screenshot({ path: file, fullPage: true });
      console.error("[debug] 오류 시점 스크린샷:", file, "|", error.message);
    }
    // 스크린샷은 최근 10개만 유지
    const shots = fs.readdirSync(CONFIG.tmpDir).filter((f) => f.startsWith("error-")).sort();
    for (const old of shots.slice(0, -10)) fs.unlinkSync(path.join(CONFIG.tmpDir, old));
  } catch {
    // 디버그 실패는 무시
  }
}
