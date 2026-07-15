import type { Env } from "../types/api";
import { getCachedDashboard, setCachedDashboard } from "../cache/cache";
import { createMockDashboard } from "../transform/aggregateDashboard";

export async function getDashboard(env: Env) {
  const cached = await getCachedDashboard(env);

  if (cached) {
    return {
      ...(cached as Record<string, unknown>),
      stale: true,
    };
  }

  const dashboard = createMockDashboard();
  await setCachedDashboard(env, dashboard);
  return dashboard;
}
