// 모든 요청을 가로채 비밀번호 인증을 요구한다 (Cloudflare Pages Functions).
// 통과 기준: 쿠키(dk_auth)가 현재 DASHBOARD_PASSWORD의 SHA-256 해시와 일치.
const COOKIE_NAME = "dk_auth";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30일

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const password = env.DASHBOARD_PASSWORD || "1234";
  const expectedHash = await sha256(password);

  if (request.method === "POST" && url.searchParams.get("action") === "login") {
    const form = await request.formData();
    const submitted = String(form.get("password") || "");
    const submittedHash = await sha256(submitted);

    if (submittedHash === expectedHash) {
      const headers = new Headers({ Location: "/" });
      headers.append(
        "Set-Cookie",
        `${COOKIE_NAME}=${expectedHash}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`
      );
      return new Response(null, { status: 303, headers });
    }

    return new Response(renderLoginPage("비밀번호가 올바르지 않습니다."), {
      status: 401,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const cookieHash = getCookie(request, COOKIE_NAME);
  if (cookieHash === expectedHash) {
    return next();
  }

  return new Response(renderLoginPage(), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? match[1] : null;
}

function renderLoginPage(error = "") {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>로그인 필요</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background:#0f172a; color:#e2e8f0; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }
  form { background:#1e293b; padding:32px; border-radius:12px; width:280px; box-shadow:0 10px 30px rgba(0,0,0,.4); }
  h1 { font-size:17px; margin:0 0 16px; font-weight:600; }
  input { width:100%; box-sizing:border-box; padding:10px 12px; border-radius:8px; border:1px solid #334155; background:#0f172a; color:#e2e8f0; font-size:14px; margin-bottom:12px; }
  input:focus { outline:none; border-color:#3b82f6; }
  button { width:100%; padding:10px; border:none; border-radius:8px; background:#3b82f6; color:white; font-weight:600; font-size:14px; cursor:pointer; }
  button:hover { background:#2563eb; }
  .err { color:#f87171; font-size:13px; margin:-4px 0 12px; }
</style>
</head>
<body>
  <form method="POST" action="/?action=login">
    <h1>대시보드 접근 비밀번호</h1>
    ${error ? `<div class="err">${error}</div>` : ""}
    <input type="password" name="password" placeholder="비밀번호" autofocus required />
    <button type="submit">입장</button>
  </form>
</body>
</html>`;
}
