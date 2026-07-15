import { getBids } from "./routes/bids";
import { getDashboard } from "./routes/dashboard";
import { getLofinBudgets } from "./routes/lofin";
import { getMas } from "./routes/mas";
import { getAwards, getContracts, getOrderPlans, getPrices, getSpecs, getStats } from "./routes/procurement";
import { DataGoKrError } from "./services/dataGoKrClient";
import type { Env } from "./types/api";
import { corsHeaders, json } from "./utils/response";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const isPipelineKeywordsRoute = url.pathname === "/api/pipeline-keywords";

    if (request.method !== "GET" && !(isPipelineKeywordsRoute && request.method === "PUT")) {
      return json({ ok: false, error: "Method not allowed" }, 405);
    }

    try {
      if (!isAuthorized(request, env, url)) {
        return json({ ok: false, error: "Unauthorized" }, 401);
      }

      if (isPipelineKeywordsRoute) {
        return request.method === "PUT"
          ? json(await putPipelineKeywords(request, env))
          : json(await getPipelineKeywords(env));
      }

      const endpoint = url.searchParams.get("endpoint");

      if (endpoint) {
        if (endpoint === "plan") {
          return json(await getOrderPlans(env, url.searchParams));
        }

        if (endpoint === "spec") {
          return json(await getSpecs(env, url.searchParams));
        }

        if (endpoint === "awards") {
          return json(await getAwards(env, url.searchParams));
        }

        if (endpoint === "contract") {
          return json(await getContracts(env, url.searchParams));
        }

        if (endpoint === "stats") {
          return json(await getStats(env, url.searchParams));
        }

        if (endpoint === "price") {
          return json(await getPrices(env, url.searchParams));
        }

        if (endpoint === "bids") {
          return json(await getBids(env, url.searchParams));
        }

        if (endpoint === "lofin") {
          return json(await getLofinBudgets(env, url.searchParams));
        }

        return json({
          ok: true,
          mode: "not_implemented",
          endpoint,
          response: {
            body: {
              items: [],
            },
          },
        });
      }

      if (url.pathname === "/api/health") {
        return json({
          ok: true,
          service: "market-dashboard-worker",
          time: new Date().toISOString(),
        });
      }

      if (url.pathname === "/api/dashboard") {
        return json(await getDashboard(env));
      }

      if (url.pathname === "/api/contracts") {
        return json(await getContracts(env, url.searchParams));
      }

      if (url.pathname === "/api/bids") {
        return json(await getBids(env, url.searchParams));
      }

      if (url.pathname === "/api/mas") {
        return json(await getMas());
      }

      return json({ ok: false, error: "Not found" }, 404);
    } catch (error) {
      const status = error instanceof DataGoKrError ? error.status : 500;
      return json(
        {
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        status
      );
    }
  },
};

const PIPELINE_KEYWORDS_KV_KEY = "settings:pipeline-keywords:v1";

async function getPipelineKeywords(env: Env) {
  if (!env.DASHBOARD_CACHE) {
    return { ok: true, configured: false, companies: null, updatedAt: null };
  }
  const saved = await env.DASHBOARD_CACHE.get(PIPELINE_KEYWORDS_KV_KEY, "json") as {
    companies?: Record<string, string[]>;
    updatedAt?: string;
  } | null;
  return {
    ok: true,
    configured: true,
    companies: saved?.companies || null,
    updatedAt: saved?.updatedAt || null,
  };
}

async function putPipelineKeywords(request: Request, env: Env) {
  if (!env.DASHBOARD_CACHE) {
    throw new DataGoKrError("DASHBOARD_CACHE KV binding is not configured", 503);
  }
  const body = await request.json() as { companies?: Record<string, unknown> };
  const companies = normalizePipelineCompanies(body?.companies);
  const value = { companies, updatedAt: new Date().toISOString() };
  await env.DASHBOARD_CACHE.put(PIPELINE_KEYWORDS_KV_KEY, JSON.stringify(value));
  return { ok: true, configured: true, ...value };
}

function normalizePipelineCompanies(value: Record<string, unknown> | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DataGoKrError("companies object is required", 400);
  }
  const companies: Record<string, string[]> = {};
  for (const [companyId, rawKeywords] of Object.entries(value)) {
    if (!/^[a-z0-9_-]{1,40}$/i.test(companyId) || !Array.isArray(rawKeywords)) continue;
    companies[companyId] = [...new Set(
      rawKeywords.map((keyword) => String(keyword || "").trim()).filter((keyword) => keyword.length > 0 && keyword.length <= 80)
    )].slice(0, 50);
  }
  if (!Object.keys(companies).length) {
    throw new DataGoKrError("at least one company keyword list is required", 400);
  }
  return companies;
}

function isAuthorized(request: Request, env: Env, url: URL) {
  if (!env.API_ACCESS_TOKEN) return true;
  const token = request.headers.get("x-api-token") || url.searchParams.get("accessToken");
  return token === env.API_ACCESS_TOKEN;
}
