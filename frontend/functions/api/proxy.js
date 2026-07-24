export const DEFAULT_WORKER_ORIGIN =
  "https://market-dashboard-worker.dk-public-dashboard.workers.dev";

export async function onRequest({ request, env }) {
  return proxyRequest({ request, env, path: [] });
}

export async function proxyRequest({ request, env = {}, path = [] }) {
  const sourceUrl = new URL(request.url);
  const workerOrigin = String(env.WORKER_BASE_URL || DEFAULT_WORKER_ORIGIN)
    .trim()
    .replace(/\/+$/, "");
  const pathSegments = Array.isArray(path) ? path : [path].filter(Boolean);
  const targetUrl = new URL(`/${pathSegments.map(encodeURIComponent).join("/")}`, `${workerOrigin}/`);
  targetUrl.search = sourceUrl.search;

  const headers = new Headers(request.headers);
  headers.delete("cookie");
  headers.delete("host");

  const init = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }

  try {
    return await fetch(targetUrl.toString(), init);
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: "Worker proxy connection failed",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    );
  }
}
