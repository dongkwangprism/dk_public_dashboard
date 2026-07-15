import type { Env } from "../types/api";

export async function getCachedDashboard(_env: Env): Promise<unknown | null> {
  return null;
}

export async function setCachedDashboard(_env: Env, _data: unknown): Promise<void> {
  // KV or Cache API will be wired in the next phase.
}
