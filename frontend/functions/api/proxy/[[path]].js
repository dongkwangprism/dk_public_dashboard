import { proxyRequest } from "../proxy.js";

export async function onRequest({ request, env, params }) {
  return proxyRequest({
    request,
    env,
    path: params.path || [],
  });
}
