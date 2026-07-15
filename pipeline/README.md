# g2b-delivery-pipeline

조달청 **종합쇼핑몰 납품요구 물품 내역**(조달데이터허브 보고서 `UI-ADOXAA-038R`)을 매일 자동 수집해
SQLite에 적재하고 대시보드용 JSON 스냅샷을 생성하는 파이프라인.

## 왜 CSV 직접 다운로드가 아닌가

`https://data.g2b.go.kr/link/AISC001_01/?reptNm=UI-ADOXAA-038R` 은 정적 CSV 파일이 아니라
**WebSquare + MicroStrategy 보고서 페이지**다. HTTP GET으로는 HTML만 내려오고, CSV 내보내기는
보고서 조회 후 세션 기반 이벤트로만 동작하며 비로그인 세션에서는 파일이 생성되지 않는 것을 확인했다.

대신 이 파이프라인은:
1. 헤드리스 브라우저(Playwright)로 보고서를 열고
2. **요청명(납품요구명) 서버사이드 필터**에 키워드를 넣어 조회 범위를 좁힌 뒤
3. 결과 그리드를 페이지 단위로 구조화 추출(스트리밍과 동일하게 페이지=배치 단위 처리)한다.

전량(일 1만+행)이 아니라 키워드 관련 행만 수집하므로 실행당 1분 내외로 끝난다.

## 사용법

```bash
cd pipeline
npm install
npx playwright install chromium   # 최초 1회 (이미 설치돼 있으면 생략)

npm run once        # 1회 수집: 스크래핑 → SQLite upsert → delivery.json 스냅샷
npm run schedule    # 상주 스케줄러: 매월 1일 04:00 KST 자동 실행 (G2B_RUN_ON_START=1 로 시작 시 즉시 1회)
npm run ingest -- 파일.csv          # 수동 다운로드한 CSV 적재 (성공 시 파일 삭제, --keep 로 보존)
```

- DB: `pipeline/data/delivery.sqlite` — 테이블 `delivery_items`,
  복합키 `(납품요구번호, 납품요구변경차수, 물품순번)` upsert (있으면 UPDATE, 없으면 INSERT)
- 스냅샷: `frontend/public/delivery.json` (최근 5,000행) — 프론트엔드에서 `fetch("/delivery.json")` 으로 사용 가능
- 원본 행 전체는 `raw` 컬럼(JSON)에 보존되므로 컬럼 추가 없이도 필드 손실이 없다

## 환경변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `G2B_KEYWORDS` | 흡연부스,이동식초소,… | 요청명 필터 키워드 (쉼표 구분) |
| `PIPELINE_CONFIG_URL` | 빈 값 | 프론트엔드와 공유하는 Worker API. 예: `https://<worker>/api/pipeline-keywords` |
| `PIPELINE_API_TOKEN` | 빈 값 | Worker가 `API_ACCESS_TOKEN`을 쓰는 경우 같은 토큰 |
| `G2B_WINDOW_DAYS` | 45 | 납품요구일자 조회 창(일). upsert라 넉넉히 잡아도 중복 없음 |
| `G2B_MAX_PAGES` | 40 | 키워드당 최대 수집 페이지(페이지당 50행) |
| `G2B_CRON` | `0 4 1 * *` | 스케줄 (KST, 매월 1일 04:00) |
| `G2B_DB_PATH` / `G2B_EXPORT_PATH` | 위 기본 경로 | DB / 스냅샷 경로 |
| `G2B_HEADFUL=1` | — | 브라우저 창 띄워서 디버깅 |

## CSV 수동 적재 (`npm run ingest`)

나라장터 로그인 후 보고서에서 CSV를 직접 받은 경우 같은 테이블에 합칠 수 있다.
- EUC-KR / UTF-8(BOM) 자동 감지
- 따옴표·쉼표·줄바꿈 포함 필드를 처리하는 스트리밍 파서 — 파일 전체를 메모리에 올리지 않으므로 대용량(수백 MB)도 OOM 없이 처리
- 적재 후 원본 파일 삭제(임시파일 정리), `--keep` 시 보존

## 자동 실행 (GitHub Actions)

로컬/서버에서 사람이 직접 `npm run once`를 실행할 필요 없이, `.github/workflows/update-delivery.yml`이 매월 1일 09:00 KST에 자동으로:

1. `pipeline` 실행 (스크래핑 → `pipeline/data/delivery.sqlite` upsert → `frontend/public/delivery.json` 생성)
2. 변경된 `delivery.sqlite` + `delivery.json`을 repo에 커밋 & push
3. `frontend`를 빌드해 Cloudflare Pages에 재배포

까지 처리한다. GitHub Actions 탭에서 `Update delivery snapshot & redeploy` 워크플로를 수동 실행(`workflow_dispatch`)할 수도 있다.

**주의:** `pipeline/data/delivery.sqlite`는 계속 누적되는 이력 DB라 git에 커밋해서 관리한다(`.gitignore`에서 제외됨). CI 러너는 매번 새로 초기화되므로, 이 DB를 커밋해두지 않으면 매달 45일 창 밖의 과거 데이터가 사라진다.

### 필요한 GitHub repo secrets

| Secret | 설명 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare Pages 배포 권한을 가진 API 토큰 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 계정 ID |
| `CLOUDFLARE_PAGES_PROJECT` | 배포 대상 Pages 프로젝트명 (예: `market-dashboard-d38`) |
| `VITE_API_BASE_URL` | 배포된 Worker URL (프론트 빌드에 주입) |
| `PIPELINE_CONFIG_URL` | (선택) 프론트 키워드 공유용 Worker KV endpoint |
| `PIPELINE_API_TOKEN` | (선택) 위 endpoint가 `API_ACCESS_TOKEN`을 요구하는 경우 |

repo 설정 경로: **Settings → Secrets and variables → Actions → New repository secret**

### 알아두면 좋은 점

- GitHub은 60일간 repo에 아무 활동(커밋)이 없으면 scheduled workflow를 자동 비활성화한다. 이 워크플로는 매월 커밋을 남기므로 정상 동작하는 한 문제없지만, 스크래핑이 연속 실패하면(대상 사이트 구조 변경 등) 결국 비활성화될 수 있으니 Actions 탭에서 실행 이력을 가끔 확인하는 게 좋다.
- 대상 사이트(`data.g2b.go.kr`) 구조가 바뀌면 `scrapeReport.mjs`의 그리드 파싱이 깨질 수 있다 — 이 경우 Actions 실행 로그와 `pipeline/tmp/error-*.png`(단, CI에서는 러너 종료 시 사라지므로 필요하면 workflow에 `actions/upload-artifact` 스텝을 추가해 보존해야 한다)를 확인한다.

## 운영 메모

### 프론트엔드 키워드 공유

프론트엔드의 키워드 추가·삭제를 pipeline에 반영하려면 Worker에 `DASHBOARD_CACHE` KV binding이 필요하다. 프론트엔드는 `/api/pipeline-keywords`에 회사별 키워드를 저장하고, pipeline은 월간 실행 시 한 번 읽어 중복을 제거한 후 조회한다.

```bash
cd worker
npx wrangler kv namespace create pipeline-keywords --binding DASHBOARD_CACHE --update-config
npm run deploy
```

```bash
export PIPELINE_CONFIG_URL="https://<worker-domain>/api/pipeline-keywords"
export PIPELINE_API_TOKEN="<API_ACCESS_TOKEN을 쓰는 경우만>"
npm run once
```

`G2B_KEYWORDS`를 명시하면 공용 설정보다 우선하는 일회성 override가 된다. Worker/KV가 없거나 요청이 실패하면 `config.mjs`의 기본 키워드로 폴백한다.

- 데이터 반영 지연: 보고서 기준 D-1 결재분까지 조회되지만 실제로는 며칠 늦게 채워지는 품목도 있다.
  45일 창 + upsert 조합이 이를 흡수한다.
- 오류 시 `pipeline/tmp/error-*.png` 로 화면을 남긴다(최근 10개 유지).
- 그리드 UI가 세션에 따라 영어/한국어로 바뀌는데("Data rows" ↔ "데이터 행") 둘 다 처리한다.
- 스케줄러를 macOS 재부팅 후에도 유지하려면 `npm run schedule` 을 launchd/pm2 로 감싸면 된다.
