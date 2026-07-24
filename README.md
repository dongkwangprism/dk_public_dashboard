# 나라장터 시장 인텔리전스 대시보드

> **AI 에이전트·개발자 필독:** 탭별 목적, API, 계산식, 현재 구현/미구현 범위는 [`FUNCTIONAL_SPEC.md`](./FUNCTIONAL_SPEC.md)를 이 프로젝트의 기능 기준 문서로 사용한다. 기능을 바꾸면 코드와 함께 해당 문서도 갱신한다.

> 이 README의 일부 `mock` 구현 설명은 초기 스캐폴드 시점의 기록이다. 현재 동작 판단은 `FUNCTIONAL_SPEC.md`와 실제 코드를 우선한다.

프로젝트는 이제 프론트엔드와 Cloudflare Worker가 분리되어 있습니다.

```text
public_data_fetch/
  frontend/
    index.html
    main.jsx
    package.json
    src/services/api.js
    .env.example

  worker/
    wrangler.toml
    package.json
    src/index.ts
    src/routes/
    src/services/
    src/transform/
    src/types/
    src/utils/

  src/public_data_fetch/
    기존 Python 이메일 자동화 코드
```

## 역할

- `frontend/`: Cloudflare Pages에 올릴 React 대시보드입니다.
- `worker/`: Cloudflare Worker API 서버입니다. data.go.kr API 키를 숨기고 `/api/*` endpoint를 제공합니다.
- `src/public_data_fetch/`: 기존 Python 스캐폴드입니다. 이번 React/Worker 구조와는 별도입니다.

React는 data.go.kr API를 직접 호출하지 않습니다. 항상 Worker의 `/api/dashboard`를 호출합니다.

## 프론트엔드 실행

```bash
cd frontend
npm install
npm run dev
```

프론트 주소:

```text
http://localhost:5174/
```

프론트 로컬 환경변수:

```bash
cp .env.example .env
```

```text
VITE_API_BASE_URL=http://localhost:8787
```

프로덕션에서는 브라우저가 `workers.dev`를 직접 호출하지 않는다. Cloudflare Pages
Function의 동일 출처 `/api/proxy`를 우선 사용하고, `VITE_API_BASE_URL`은 네트워크
폴백 주소로 유지한다.

## Worker 실행

```bash
cd worker
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

Worker 주소:

```text
http://localhost:8787/
```

확인:

```bash
curl http://localhost:8787/api/health
curl http://localhost:8787/api/dashboard
```

## Worker 배포

```bash
cd worker
npm run deploy
```

Cloudflare secret 등록:

```bash
npx wrangler secret put DATA_GO_KR_API_KEY
```

## 공유 상태 설정 (키워드 · 영업 메모)

검색 키워드와 영업 메모는 D1에 저장되어 접속한 모든 사람이 같은 내용을 본다.
D1을 연결하기 전까지는 각자 브라우저에만 저장되며, 대시보드에 "서버 미연결"로 표시된다.

```bash
cd worker
npx wrangler d1 create market-dashboard          # 출력된 database_id 복사
# wrangler.toml의 [[d1_databases]] 주석을 풀고 database_id 붙여넣기
npx wrangler d1 execute market-dashboard --remote --file=./schema.sql
npx wrangler deploy
```

| 경로 | 메서드 | 용도 |
| --- | --- | --- |
| `/api/pipeline-keywords` | GET / PUT | 회사별 검색 키워드 (pipeline도 이 API로 읽는다) |
| `/api/sales-notes` | GET / PATCH | 영업 메모. PATCH는 바뀐 항목만 보내 다른 사람의 메모를 덮어쓰지 않는다 |

## 현재 구현 상태

- `/api/health`: 정상 응답
- `/api/dashboard`: mock dashboard 응답
- `/api/contracts`: mock 응답
- `/api/bids`: mock 응답
- `/api/mas`: mock 응답
- 프론트는 Worker 호출 실패 시 샘플 데이터 fallback

## 다음 작업

1. 계약정보 API 실제 응답 확인
2. `worker/src/services/dataGoKrClient.ts`로 실제 호출 연결
3. 계약정보 normalize 구현
4. MAS normalize 구현
5. 낙찰정보 normalize 구현
6. `aggregateDashboard.ts`를 실제 집계로 교체
7. KV 또는 Cache API로 `dashboard:latest` 캐시 적용
