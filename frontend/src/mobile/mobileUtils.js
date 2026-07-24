export const isMobileMediaQuery = "(max-width: 767px)";
const MOBILE_TABS = new Set(["bids", "regions", "plans"]);

export function normalizeMobileTab(tab) {
  return MOBILE_TABS.has(tab) ? tab : "bids";
}

export function mobileDdayTone(dday) {
  if (dday <= 3) return "red";
  if (dday <= 7) return "orange";
  return "green";
}

export function mobileBidOpacity(dday) {
  return dday > 10 ? 0.55 : 1;
}

export function mergeUpcomingRows(plans = [], specs = []) {
  const specRows = specs
    .map((row) => ({ ...row, kind: "spec" }))
    .sort((a, b) => a.dday - b.dday);
  const planRows = plans
    .map((row) => ({ ...row, kind: "plan" }))
    .sort((a, b) => {
      const left = a.dday < 0 ? Number.POSITIVE_INFINITY : a.dday;
      const right = b.dday < 0 ? Number.POSITIVE_INFINITY : b.dday;
      return left - right;
    });
  return [...specRows, ...planRows];
}
