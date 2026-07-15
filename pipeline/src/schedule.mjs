// 스케줄러: 매월 1일 04:00 KST에 runOnce 실행 (실행 중 겹침 방지)
import cron from "node-cron";
import { CONFIG } from "./config.mjs";
import { runOnce } from "./run.mjs";

let running = false;

async function tick() {
  if (running) {
    console.warn("[g2b-pipeline] 이전 실행이 아직 진행 중 — 이번 회차 건너뜀");
    return;
  }
  running = true;
  try {
    await runOnce();
  } catch (error) {
    console.error("[g2b-pipeline] 실행 실패:", error.message);
  } finally {
    running = false;
  }
}

console.log(`[g2b-pipeline] 스케줄러 시작 · cron "${CONFIG.cronExpr}" (${CONFIG.cronTimezone})`);
cron.schedule(CONFIG.cronExpr, tick, { timezone: CONFIG.cronTimezone });

// 시작 시 1회 즉시 실행하려면: G2B_RUN_ON_START=1
if (process.env.G2B_RUN_ON_START === "1") tick();
