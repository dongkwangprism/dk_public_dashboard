// 대시보드 소비용 JSON 스냅샷 (frontend/public/delivery.json)
import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "./config.mjs";

export function exportSnapshot(db) {
  const rows = db
    .prepare(`
      SELECT dlvr_req_no, dlvr_req_chg_ord, item_seq, dminstt_nm, dminstt_sgg, dlvr_req_dt,
             dlvr_req_nm, corp_nm, prdct_clsfc_nm, dtl_prdct_nm, prdct_nm,
             cntrct_se, prchs_mthd, dlvr_uprc, unit, dlvr_qty, dlvr_amt, keywords, updated_at
      FROM delivery_items
      ORDER BY dlvr_req_dt DESC, dlvr_req_no DESC, CAST(item_seq AS INTEGER)
      LIMIT 5000
    `)
    .all();

  const snapshot = {
    generatedAt: new Date().toISOString(),
    source: "조달청 종합쇼핑몰 납품요구 물품 내역 (UI-ADOXAA-038R)",
    count: rows.length,
    items: rows,
  };
  fs.mkdirSync(path.dirname(CONFIG.exportPath), { recursive: true });
  fs.writeFileSync(CONFIG.exportPath, JSON.stringify(snapshot));
  return { path: CONFIG.exportPath, count: rows.length };
}
