import { getBids } from "./routes/bids";
import { getDashboard } from "./routes/dashboard";
import { getLofinBudgets } from "./routes/lofin";
import { getMas } from "./routes/mas";
import { getAwards, getContracts, getOrderPlans, getPrices, getSpecs, getStats } from "./routes/procurement";
import {
  getPipelineKeywords,
  getSalesNotes,
  patchSalesNotes,
  putPipelineKeywords,
} from "./routes/sharedState";
import { DataGoKrError } from "./services/dataGoKrClient";
import type { Env } from "./types/api";
import { corsHeaders, json } from "./utils/response";

// 공유 상태 경로만 쓰기를 허용한다. 나머지는 조달 API 조회라 GET 전용이다.
const WRITE_METHODS: Record<string, string> = {
  "/api/pipeline-keywords": "PUT",
  "/api/sales-notes": "PATCH",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "GET" && request.method !== WRITE_METHODS[url.pathname]) {
      return json({ ok: false, error: "Method not allowed" }, 405);
    }

    try {
      if (!isAuthorized(request, env, url)) {
        return json({ ok: false, error: "Unauthorized" }, 401);
      }

      if (url.pathname === "/api/pipeline-keywords") {
        return request.method === "PUT"
          ? json(await putPipelineKeywords(request, env))
          : json(await getPipelineKeywords(env));
      }

      if (url.pathname === "/api/sales-notes") {
        return request.method === "PATCH"
          ? json(await patchSalesNotes(request, env))
          : json(await getSalesNotes(env));
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

function isAuthorized(request: Request, env: Env, url: URL) {
  if (!env.API_ACCESS_TOKEN) return true;
  const token = request.headers.get("x-api-token") || url.searchParams.get("accessToken");
  return token === env.API_ACCESS_TOKEN;
}
