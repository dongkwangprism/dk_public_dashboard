import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequest } from "../../functions/api/proxy/[[path]].js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Pages API proxy", () => {
  it("forwards nested API paths and query parameters to the Worker", async () => {
    const upstreamResponse = new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
    const fetchSpy = vi.fn().mockResolvedValue(upstreamResponse);
    vi.stubGlobal("fetch", fetchSpy);

    const response = await onRequest({
      request: new Request(
        "https://market-dashboard-d38.pages.dev/api/proxy/api/pipeline-keywords?mode=full",
        { headers: { Cookie: "dk_auth=secret" } }
      ),
      env: {},
      params: { path: ["api", "pipeline-keywords"] },
    });

    expect(response).toBe(upstreamResponse);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [target, init] = fetchSpy.mock.calls[0];
    expect(target).toBe(
      "https://market-dashboard-worker.dk-public-dashboard.workers.dev/api/pipeline-keywords?mode=full"
    );
    expect(init.headers.has("cookie")).toBe(false);
  });

  it("forwards root endpoint query requests to the Worker root", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchSpy);

    await onRequest({
      request: new Request(
        "https://market-dashboard-d38.pages.dev/api/proxy?endpoint=bids&keyword=test"
      ),
      env: {},
      params: { path: [] },
    });

    expect(fetchSpy.mock.calls[0][0]).toBe(
      "https://market-dashboard-worker.dk-public-dashboard.workers.dev/?endpoint=bids&keyword=test"
    );
  });

  it("preserves PATCH bodies and API authentication while removing the Pages cookie", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchSpy);

    await onRequest({
      request: new Request(
        "https://market-dashboard-d38.pages.dev/api/proxy/api/sales-notes",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-api-token": "worker-token",
            Cookie: "dk_auth=pages-session",
          },
          body: JSON.stringify({ notes: { test: "memo" } }),
        }
      ),
      env: {},
      params: { path: ["api", "sales-notes"] },
    });

    const [, init] = fetchSpy.mock.calls[0];
    expect(init.method).toBe("PATCH");
    expect(init.headers.get("x-api-token")).toBe("worker-token");
    expect(init.headers.has("cookie")).toBe(false);
    expect(await new Response(init.body).json()).toEqual({
      notes: { test: "memo" },
    });
  });
});
