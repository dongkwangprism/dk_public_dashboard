import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ApiResponseError,
  fetchPipelineKeywordConfig,
  fetchProcurementBundle,
  fetchSalesNotes,
  savePipelineKeywordConfig,
  saveSalesNotes,
} from "./src/services/api.js";
import { MobileApp } from "./src/mobile/MobileApp.jsx";
import { normalizeMobileTab } from "./src/mobile/mobileUtils.js";
import { useIsMobile } from "./src/mobile/useIsMobile.js";

const COMPANIES = {
  jeil: {
    label: "제일테크",
    keywords: ["흡연부스", "이동식초소", "흡연실", "부스"],
    // 지방재정365 세부사업명 검색용 — 지자체가 사업명을 자유롭게 쓰므로 변형 다수 (v6 명세 5장)
    budgetKeywords: ["흡연부스", "흡연실", "흡연시설", "초소", "자전거거치대", "자전거보관소"],
  },
  dongkwang: {
    label: "동광프리즘",
    keywords: ["분리수거함", "분리수거", "쓰레기통", "클린하우스", "제설함", "음식물쓰레기통", "쓰레기수거함"],
    budgetKeywords: ["클린하우스", "클린 하우스", "분리수거", "재활용정거장", "분리배출시설", "음식물", "제설함", "쓰레기"],
  },
};

const TABS = [
  { id: "bids", label: "① 공고 모니터링 + 투찰 분석" },
  { id: "plans", label: "② 발주계획·사전규격" },
  { id: "regions", label: "③ 지역 예산·집행률" },
  { id: "competitors", label: "④ 경쟁사 분석" },
  { id: "buyers", label: "⑤ 발주처 패턴" },
  { id: "opportunities", label: "⑥ 공략 기회" },
];

const COLORS = {
  blue: "#2563EB",
  teal: "#0F766E",
  amber: "#B45309",
  green: "#15803D",
  red: "#DC2626",
  slate: "#334155",
  gray: "#64748B",
  border: "#E2E8F0",
  bg: "#F8FAFC",
};

const CHART_COLORS = ["#2563EB", "#0F766E", "#B45309", "#DC2626", "#7C3AED", "#15803D", "#475569"];
const UNKNOWN_REGION = "미분류";
const DATA_CACHE_PREFIX = "g2b-procurement-cache-v6.3";
// 버전이 바뀐 옛 캐시까지 찾아내 지우기 위한 접두사 — 읽히지 않는 캐시가 용량만 차지한다
const DATA_CACHE_FAMILY_PREFIX = "g2b-procurement-cache";
const DATA_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
// 캐시 키에 키워드 목록이 들어가므로 키워드를 고칠 때마다 새 항목이 생긴다.
// 정리하지 않으면 localStorage 용량을 다 써버려 키워드·영업 메모 저장이 실패한다.
// 회사 전환(제일테크 ↔ 동광프리즘) 왕복 정도만 캐시가 남도록 2개로 제한한다.
const MAX_DATA_CACHE_ENTRIES = 2;
const INITIAL_ENDPOINTS = ["bids"];
const TAB_ENDPOINTS = {
  bids: ["bids"],
  plans: ["plan", "spec"],
  regions: ["lofin", "plan"],
  competitors: ["awards"],
  buyers: ["contract"],
  opportunities: ["contract", "plan", "spec", "price", "lofin"],
};
// 영업 등급 잔액 기준 (원)
const GRADE_RED_REMAINING = 30_000_000;
const GRADE_ORANGE_REMAINING = 10_000_000;
const GRADE_MIN_REMAINING = 5_000_000;
const SALES_STATUS_LABELS = {
  none: "미접촉",
  catalog_sent: "카탈로그 발송",
  called: "통화 완료",
  quoted: "견적 제출",
  ongoing: "진행 중",
  closed: "종료",
};
const REGION_PATTERNS = [
  { region: "서울", patterns: ["서울특별시", "서울시", "서울"] },
  { region: "부산", patterns: ["부산광역시", "부산"] },
  { region: "대구", patterns: ["대구광역시", "대구"] },
  { region: "인천", patterns: ["인천광역시", "인천"] },
  { region: "광주", patterns: ["광주광역시", "광주"] },
  { region: "대전", patterns: ["대전광역시", "대전"] },
  { region: "울산", patterns: ["울산광역시", "울산"] },
  { region: "세종", patterns: ["세종특별자치시", "세종"] },
  { region: "경기", patterns: ["경기도", "경기"] },
  { region: "강원", patterns: ["강원특별자치도", "강원도", "강원"] },
  { region: "충북", patterns: ["충청북도", "충북"] },
  { region: "충남", patterns: ["충청남도", "충남"] },
  { region: "전북", patterns: ["전북특별자치도", "전라북도", "전북"] },
  { region: "전남", patterns: ["전라남도", "전남"] },
  { region: "경북", patterns: ["경상북도", "경북"] },
  { region: "경남", patterns: ["경상남도", "경남"] },
  { region: "제주", patterns: ["제주특별자치도", "제주"] },
];
const LOCAL_REGION_PATTERNS = [
  { region: "서울", patterns: ["종로구", "용산구", "성동구", "광진구", "동대문구", "중랑구", "성북구", "강북구", "도봉구", "노원구", "은평구", "서대문구", "마포구", "양천구", "구로구", "금천구", "영등포구", "동작구", "관악구", "서초구", "강남구", "송파구", "강동구"] },
  { region: "부산", patterns: ["영도구", "부산진구", "동래구", "해운대구", "사하구", "금정구", "연제구", "수영구", "사상구", "기장군"] },
  { region: "대구", patterns: ["수성구", "달서구", "달성군", "군위군"] },
  { region: "인천", patterns: ["미추홀구", "연수구", "남동구", "부평구", "계양구", "강화군", "옹진군"] },
  { region: "광주", patterns: ["광산구"] },
  { region: "대전", patterns: ["유성구", "대덕구"] },
  { region: "울산", patterns: ["울주군"] },
  { region: "세종", patterns: ["세종시", "조치원읍"] },
  { region: "경기", patterns: ["수원시", "성남시", "의정부시", "안양시", "부천시", "광명시", "평택시", "동두천시", "안산시", "고양시", "과천시", "구리시", "남양주시", "오산시", "시흥시", "군포시", "의왕시", "하남시", "용인시", "파주시", "이천시", "안성시", "김포시", "화성시", "광주시", "양주시", "포천시", "여주시", "연천군", "가평군", "양평군"] },
  { region: "강원", patterns: ["춘천시", "원주시", "강릉시", "동해시", "태백시", "속초시", "삼척시", "홍천군", "횡성군", "영월군", "평창군", "정선군", "철원군", "화천군", "양구군", "인제군", "양양군"] },
  { region: "충북", patterns: ["청주시", "충주시", "제천시", "보은군", "옥천군", "영동군", "증평군", "진천군", "괴산군", "음성군", "단양군"] },
  { region: "충남", patterns: ["천안시", "공주시", "보령시", "아산시", "서산시", "논산시", "계룡시", "당진시", "금산군", "부여군", "서천군", "청양군", "홍성군", "예산군", "태안군"] },
  { region: "전북", patterns: ["전주시", "군산시", "익산시", "정읍시", "남원시", "김제시", "완주군", "진안군", "무주군", "장수군", "임실군", "순창군", "고창군", "부안군"] },
  { region: "전남", patterns: ["목포시", "여수시", "순천시", "나주시", "광양시", "담양군", "곡성군", "구례군", "고흥군", "보성군", "화순군", "장흥군", "강진군", "해남군", "영암군", "무안군", "함평군", "영광군", "장성군", "완도군", "진도군", "신안군"] },
  { region: "경북", patterns: ["포항시", "경주시", "김천시", "안동시", "구미시", "영주시", "영천시", "상주시", "문경시", "경산시", "의성군", "청송군", "영양군", "영덕군", "청도군", "고령군", "성주군", "칠곡군", "예천군", "봉화군", "울진군", "울릉군"] },
  { region: "경남", patterns: ["창원시", "진주시", "통영시", "사천시", "김해시", "밀양시", "거제시", "양산시", "의령군", "함안군", "창녕군", "남해군", "하동군", "산청군", "함양군", "거창군", "합천군"] },
  { region: "제주", patterns: ["제주시", "서귀포시"] },
];
const PUBLIC_ORG_CATEGORIES = [
  {
    category: "공공기관-에너지/자원",
    patterns: ["한국전력공사", "한전", "한국가스공사", "한국수력원자력", "한국남동발전", "한국남부발전", "한국동서발전", "한국서부발전", "한국중부발전", "한국지역난방공사", "한국석유공사", "대한석탄공사"],
  },
  {
    category: "공공기관-교통/인프라",
    patterns: ["한국도로공사", "한국철도공사", "코레일", "한국공항공사", "인천국제공항공사", "국가철도공단", "한국교통안전공단", "항만공사"],
  },
  {
    category: "공공기관-주택/토지",
    patterns: ["한국토지주택공사", "한국부동산원", "새만금개발공사"],
  },
  {
    category: "공공기관-복지/환경",
    patterns: ["국민건강보험공단", "국민연금공단", "근로복지공단", "건강보험심사평가원", "한국환경공단", "한국수자원공사", "한국농어촌공사"],
  },
  {
    category: "공공기관-기타",
    patterns: ["한국조폐공사", "한국마사회", "한국자산관리공사", "우정사업본부", "조달청", "예금보험공사"],
  },
];

function App() {
  const isMobile = useIsMobile();
  const [companyId, setCompanyId] = useStoredState("g2b-company", "jeil");
  const [keywordMap, setKeywordMap] = useStoredState("g2b-keywords", COMPANIES);
  const [tab, setTab] = useState("bids");
  const [bundle, setBundle] = useState(emptyBundle);
  const [mode, setMode] = useState("empty");
  const [status, setStatus] = useState("Worker 연결 전");
  const [loading, setLoading] = useState(false);
  const [loadedEndpoints, setLoadedEndpoints] = useState([]);
  const [failedEndpoints, setFailedEndpoints] = useState([]);
  const [lastUpdated, setLastUpdated] = useState("");
  const [draftKeyword, setDraftKeyword] = useState("");
  const [keywordSyncStatus, setKeywordSyncStatus] = useState("");
  const [deliverySnapshot, setDeliverySnapshot] = useState({ items: [], generatedAt: "", source: "" });
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [deliveryError, setDeliveryError] = useState("");
  const [deliveryLoaded, setDeliveryLoaded] = useState(false);
  const [selectedAnalysisBid, setSelectedAnalysisBid] = useState(null);
  const [mobileMyBids, setMobileMyBids] = useStoredState("g2b-my-bids", []);
  // 영업 메모는 탭을 옮겨도 유지되도록 App에서 한 번만 불러온다
  const salesNotes = useSharedSalesNotes();
  const [staleEndpoints, setStaleEndpoints] = useState({}); // { endpoint: 원본 수신 시각 } — 만료 캐시로 채워진 endpoint
  const [fetchingEndpoints, setFetchingEndpoints] = useState([]); // 현재 요청이 호출 중인 endpoint — force 갱신은 loadedEndpoints를 유지하므로 이것 없이는 로딩 표시가 사라진다
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const requestIdRef = useRef(0);
  const bundleRef = useRef(emptyBundle());
  const loadedEndpointsRef = useRef([]);
  const failedEndpointsRef = useRef([]);
  const staleEndpointsRef = useRef({});

  const safeKeywordMap = useMemo(() => normalizeKeywordMap(keywordMap), [keywordMap]);
  const safeCompanyId = safeKeywordMap[companyId] ? companyId : "jeil";
  const company = safeKeywordMap[safeCompanyId] || COMPANIES.jeil;
  const keywords = Array.isArray(company?.keywords) ? company.keywords : COMPANIES[safeCompanyId]?.keywords || [];
  const budgetKeywords = useMemo(
    () => (Array.isArray(company?.budgetKeywords) ? company.budgetKeywords : COMPANIES[safeCompanyId]?.budgetKeywords || []),
    [company, safeCompanyId]
  );
  const cacheKey = useMemo(
    () => dataCacheKey(safeCompanyId, [...keywords, ...budgetKeywords]),
    [safeCompanyId, keywords, budgetKeywords]
  );

  useEffect(() => {
    bundleRef.current = bundle;
  }, [bundle]);

  useEffect(() => {
    loadedEndpointsRef.current = loadedEndpoints;
  }, [loadedEndpoints]);

  useEffect(() => {
    failedEndpointsRef.current = failedEndpoints;
  }, [failedEndpoints]);

  const loadData = useCallback(async ({ force = false, endpoints = INITIAL_ENDPOINTS, clear = false } = {}) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const requestedEndpoints = [...new Set(endpoints)];
    let targetEndpoints = requestedEndpoints;
    let baseBundle = clear ? emptyBundle() : bundleRef.current;
    let nextLoadedEndpoints = clear ? [] : loadedEndpointsRef.current;

    if (!force) {
      const cached = readDataCache(cacheKey);
      if (cached) {
        // clear가 아니면 세션 중 상태와 캐시를 병합 — 캐시가 실패 기록을 덮어쓰면 실패한 endpoint를 무한 재시도한다
        const mergedBundle = clear ? cached.bundle : { ...bundleRef.current, ...cached.bundle };
        setBundle(mergedBundle);
        bundleRef.current = mergedBundle;
        nextLoadedEndpoints = [...new Set([...(clear ? [] : loadedEndpointsRef.current), ...(cached.loadedEndpoints || [])])];
        setLoadedEndpoints(nextLoadedEndpoints);
        const mergedFailed = [...new Set([...(clear ? [] : failedEndpointsRef.current), ...(cached.failedEndpoints || [])])]
          .filter((endpoint) => !nextLoadedEndpoints.includes(endpoint));
        failedEndpointsRef.current = mergedFailed;
        setFailedEndpoints(mergedFailed);
        // 이전 세션에서 만료 캐시로 채워졌던 endpoint의 수신 시각 복원
        const restoredStale = {};
        for (const [endpoint, fetchedAt] of Object.entries(cached.endpointFetchedAt || {})) {
          if (mergedFailed.includes(endpoint) && Date.now() - fetchedAt > DATA_CACHE_TTL_MS && mergedBundle[endpoint]?.length) {
            restoredStale[endpoint] = fetchedAt;
          }
        }
        staleEndpointsRef.current = clear ? restoredStale : { ...staleEndpointsRef.current, ...restoredStale };
        setStaleEndpoints(staleEndpointsRef.current);
        setMode("cache");
        setStatus(mergedFailed.length ? `캐시 데이터 표시 중 · 일부 endpoint 실패: ${mergedFailed.join(", ")}` : "캐시 데이터 표시 중");
        setLastUpdated(cached.lastUpdated);
        baseBundle = mergedBundle;
        // 이미 실패로 기록된 endpoint는 자동 재시도하지 않는다 (새로고침 시에만 force로 재시도)
        targetEndpoints = requestedEndpoints.filter(
          (endpoint) => !nextLoadedEndpoints.includes(endpoint) && !mergedFailed.includes(endpoint)
        );
        if (!targetEndpoints.length) {
          setLoading(false);
          setFetchingEndpoints([]);
          return;
        }
      }
    }

    setLoading(true);
    if (force) setManualRefreshing(true);
    if (clear) {
      const empty = emptyBundle();
      setBundle(empty);
      bundleRef.current = empty;
      setLoadedEndpoints([]);
      loadedEndpointsRef.current = [];
      setFailedEndpoints([]);
      failedEndpointsRef.current = [];
      staleEndpointsRef.current = {};
      setStaleEndpoints({});
    } else if (force) {
      const retryFailures = failedEndpointsRef.current.filter((endpoint) => !requestedEndpoints.includes(endpoint));
      setFailedEndpoints(retryFailures);
      failedEndpointsRef.current = retryFailures;
    }
    setMode("loading");
    setStatus("Worker endpoint 호출 중");
    setFetchingEndpoints(targetEndpoints);
    if (clear) setLastUpdated("");

    try {
      const { bundle: live, failedEndpoints } = await fetchProcurementBundle(keywords, {
        endpoints: targetEndpoints,
        endpointKeywords: { lofin: budgetKeywords },
        onEndpointComplete: (endpoint, rows, endpointResult) => {
          if (requestIdRef.current !== requestId) return;
          setFetchingEndpoints((current) => current.filter((item) => item !== endpoint));
          if (endpointResult.successCount === 0) {
            setStatus(`Worker endpoint 실패 · ${endpoint}`);
            setFailedEndpoints((current) => {
              const next = [...new Set([...current, endpoint])];
              failedEndpointsRef.current = next;
              return next;
            });
            return;
          }
          setBundle((current) => {
            const next = { ...current, [endpoint]: rows };
            bundleRef.current = next;
            return next;
          });
          setLoadedEndpoints((current) => [...new Set([...current, endpoint])]);
          setFailedEndpoints((current) => {
            const next = current.filter((item) => item !== endpoint);
            failedEndpointsRef.current = next;
            return next;
          });
          setStatus(`Worker endpoint 호출 중 · ${endpoint} ${rows.length}건 수신`);
        },
      });
      if (requestIdRef.current !== requestId) return;
      const updatedAt = new Date().toLocaleString("ko-KR");
      const mergedBundle = { ...baseBundle, ...live };
      const successfulEndpoints = targetEndpoints.filter((endpoint) => !failedEndpoints.includes(endpoint));
      const mergedLoadedEndpoints = [...new Set([...nextLoadedEndpoints, ...successfulEndpoints])];
      const nextFailedEndpoints = [
        ...new Set([
          ...failedEndpointsRef.current.filter((endpoint) => !targetEndpoints.includes(endpoint)),
          ...failedEndpoints,
        ]),
      ];

      // 캐시 폴백: 실패했고 화면에 보여줄 데이터가 없는 endpoint는 만료 캐시라도 채운다
      const stale = readDataCache(cacheKey, { allowStale: true });
      const nextStale = { ...staleEndpointsRef.current };
      successfulEndpoints.forEach((endpoint) => delete nextStale[endpoint]);
      for (const endpoint of nextFailedEndpoints) {
        if (!mergedBundle[endpoint]?.length && stale?.bundle?.[endpoint]?.length) {
          mergedBundle[endpoint] = stale.bundle[endpoint];
          nextStale[endpoint] = stale.endpointFetchedAt?.[endpoint] || stale.cachedAt;
        }
      }
      staleEndpointsRef.current = nextStale;
      setStaleEndpoints(nextStale);

      setBundle(mergedBundle);
      bundleRef.current = mergedBundle;
      setLoadedEndpoints(mergedLoadedEndpoints);
      loadedEndpointsRef.current = mergedLoadedEndpoints;
      failedEndpointsRef.current = nextFailedEndpoints;
      setFailedEndpoints(nextFailedEndpoints);
      setMode("live");
      setStatus(failedEndpoints.length ? `일부 endpoint 실패: ${failedEndpoints.join(", ")}` : "Worker endpoint 데이터 표시 중");
      setLastUpdated(updatedAt);
      // endpoint별 수신 시각 기록 — 만료 캐시로 채운 endpoint는 원래 수신 시각을 유지해 신선한 척하지 않게 한다
      const endpointFetchedAt = {
        ...(stale?.endpointFetchedAt || {}),
        ...Object.fromEntries(successfulEndpoints.map((endpoint) => [endpoint, Date.now()])),
      };
      writeDataCache(cacheKey, {
        bundle: mergedBundle,
        loadedEndpoints: mergedLoadedEndpoints,
        failedEndpoints: nextFailedEndpoints,
        endpointFetchedAt,
        lastUpdated: updatedAt,
        cachedAt: Date.now(),
      });
    } catch (error) {
      if (requestIdRef.current !== requestId) return;
      console.warn("Worker API failed", error);
      const nextFailedEndpoints = [...new Set([...failedEndpointsRef.current, ...targetEndpoints])];
      failedEndpointsRef.current = nextFailedEndpoints;
      setFailedEndpoints(nextFailedEndpoints);

      // 전면 실패 시에도 만료 캐시가 있으면 그걸로 화면을 유지한다
      const stale = readDataCache(cacheKey, { allowStale: true });
      if (stale?.bundle) {
        const fallbackBundle = { ...(clear ? emptyBundle() : bundleRef.current) };
        const nextStale = { ...(clear ? {} : staleEndpointsRef.current) };
        for (const endpoint of nextFailedEndpoints) {
          if (!fallbackBundle[endpoint]?.length && stale.bundle[endpoint]?.length) {
            fallbackBundle[endpoint] = stale.bundle[endpoint];
            nextStale[endpoint] = stale.endpointFetchedAt?.[endpoint] || stale.cachedAt;
          }
        }
        setBundle(fallbackBundle);
        bundleRef.current = fallbackBundle;
        staleEndpointsRef.current = nextStale;
        setStaleEndpoints(nextStale);
      } else if (clear) {
        setBundle(emptyBundle());
      }
      setMode("error");
      setStatus(formatLoadError(error));
      setLastUpdated("");
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
        setFetchingEndpoints([]);
        if (force) setManualRefreshing(false);
      }
    }
  }, [cacheKey, keywords, budgetKeywords]);

  const hasKeywords = keywords.length > 0;

  useEffect(() => {
    let active = true;
    fetchPipelineKeywordConfig()
      .then(async (remote) => {
        if (!active) return;
        if (!remote.configured) {
          setKeywordSyncStatus("서버 미연결 · 이 브라우저에만 저장됩니다");
          return;
        }
        if (remote.companies) {
          setKeywordMap((current) => mergeRemoteKeywordCompanies(current, remote.companies));
          setKeywordSyncStatus(`공유 중${remote.updatedAt ? ` · 최근 수정 ${formatDateTime(remote.updatedAt)}` : ""}`);
          return;
        }
        const companies = pipelineKeywordCompanies(safeKeywordMap);
        await savePipelineKeywordConfig(companies);
        if (active) setKeywordSyncStatus("공유 시작됨 · 이 목록을 서버에 올렸습니다");
      })
      .catch((error) => {
        if (active) setKeywordSyncStatus(`서버 연결 실패 · 이 브라우저에만 저장됨 · ${formatLoadError(error)}`);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hasKeywords) {
      // 키워드가 없으면 API를 호출하지 않는다 — 진행 중 요청도 무효화하고 빈 상태로 표시
      requestIdRef.current += 1;
      const empty = emptyBundle();
      setBundle(empty);
      bundleRef.current = empty;
      setLoadedEndpoints([]);
      loadedEndpointsRef.current = [];
      setFailedEndpoints([]);
      failedEndpointsRef.current = [];
      staleEndpointsRef.current = {};
      setStaleEndpoints({});
      setFetchingEndpoints([]);
      setLoading(false);
      setMode("empty");
      setStatus("검색 키워드가 없습니다 · 키워드를 추가하면 데이터를 불러옵니다");
      setLastUpdated("");
      return;
    }
    loadData({ endpoints: INITIAL_ENDPOINTS, clear: true });
  }, [loadData, hasKeywords]);

  useEffect(() => {
    if (!hasKeywords) return;
    const endpoints = TAB_ENDPOINTS[tab] || [];
    const missingEndpoints = endpoints.filter((endpoint) => !loadedEndpoints.includes(endpoint) && !failedEndpoints.includes(endpoint));
    if (missingEndpoints.length && !loading) {
      loadData({ endpoints: missingEndpoints });
    }
  }, [tab, loadedEndpoints, failedEndpoints, loading, loadData, hasKeywords]);

  useEffect(() => {
    if (!hasKeywords || tab !== "competitors" || deliveryLoaded || deliveryLoading) return;
    setDeliveryLoading(true);
    setDeliveryError("");
    fetch(new URL("delivery.json", document.baseURI))
      .then((response) => {
        if (!response.ok) throw new Error(`delivery.json HTTP ${response.status}`);
        return response.json();
      })
      .then((payload) => {
        setDeliverySnapshot({
          items: Array.isArray(payload?.items) ? payload.items : [],
          generatedAt: payload?.generatedAt || "",
          source: payload?.source || "조달청 종합쇼핑몰 납품요구 물품 내역",
        });
        setDeliveryLoaded(true);
      })
      .catch((error) => {
        console.warn("delivery snapshot failed", error);
        setDeliveryError(error instanceof Error ? error.message : "납품요구 데이터를 불러오지 못했습니다.");
      })
      .finally(() => setDeliveryLoading(false));
  }, [tab, hasKeywords, deliveryLoaded]);

  const data = useMemo(() => transformBundle(bundle), [bundle]);
  const deliveryData = useMemo(
    () => transformDeliverySnapshot(deliverySnapshot, [...keywords, ...budgetKeywords]),
    [deliverySnapshot, keywords, budgetKeywords]
  );
  const pendingEndpoints = loading
    ? (TAB_ENDPOINTS[tab] || []).filter(
        (endpoint) => fetchingEndpoints.includes(endpoint) || !loadedEndpoints.includes(endpoint)
      )
    : [];
  const visibleState = getVisibleDataState({
    tab,
    mode,
    status,
    loading,
    loadedEndpoints,
    failedEndpoints,
    staleEndpoints,
    fetchingEndpoints,
  });
  const opportunityDataLoading = tab === "opportunities" && visibleState.loading;

  const addKeyword = () => {
    const next = draftKeyword.trim();
    if (!next || keywords.includes(next)) return;
    const nextMap = {
      ...safeKeywordMap,
      [safeCompanyId]: { ...company, keywords: [...keywords, next] },
    };
    setKeywordMap(nextMap);
    syncPipelineKeywords(nextMap, setKeywordSyncStatus);
    setDraftKeyword("");
  };

  const removeKeyword = (keyword) => {
    const nextMap = {
      ...safeKeywordMap,
      [safeCompanyId]: { ...company, keywords: keywords.filter((item) => item !== keyword) },
    };
    setKeywordMap(nextMap);
    syncPipelineKeywords(nextMap, setKeywordSyncStatus);
  };

  useEffect(() => {
    if (isMobile && tab !== normalizeMobileTab(tab)) {
      setTab("bids");
    }
  }, [isMobile, tab]);

  if (isMobile) {
    const mobileCompanyHistory = selectedAnalysisBid
      ? mobileMyBids
        .filter((item) => item.company === safeCompanyId
          && (item.org ? organizationsMatch(item.org, selectedAnalysisBid.org) : item.bidNo === selectedAnalysisBid.bidNo))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      : [];
    return (
      <MobileApp
        companyId={safeCompanyId}
        companies={safeKeywordMap}
        onCompanyChange={setCompanyId}
        tab={tab}
        onTabChange={setTab}
        data={data}
        visibleState={visibleState}
        loading={loading}
        onRefresh={() => loadData({ force: true, endpoints: TAB_ENDPOINTS[normalizeMobileTab(tab)] || INITIAL_ENDPOINTS })}
        onAnalyze={(row) => {
          setSelectedAnalysisBid(row);
          window.setTimeout(() => loadData({ endpoints: ["awards"] }), 0);
        }}
        selectedBid={selectedAnalysisBid}
        onCloseAnalysis={() => setSelectedAnalysisBid(null)}
        analysisPending={fetchingEndpoints.includes("awards")}
        analyzeBid={(bid, floorRate) => analyzeBidOpportunity(bid, data.awardsRaw, floorRate)}
        companyHistory={mobileCompanyHistory}
        onRecordBid={(bid, draft) => {
          setMobileMyBids([...mobileMyBids, {
            bidNo: bid.bidNo,
            bidName: bid.name,
            org: bid.org,
            item: bid.item || bid.name,
            basePrice: bid.budget,
            myPrice: draft.myPrice,
            result: draft.result,
            company: safeCompanyId,
            createdAt: new Date().toISOString().slice(0, 10),
          }]);
        }}
        salesNotes={salesNotes}
      />
    );
  }

  return (
    <div style={styles.page}>
      <main style={styles.shell}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.h1}>나라장터 조사 대시보드</h1>
            <p style={styles.sub}>조달청 데이터허브 기반 · 발주계획부터 개찰결과까지 추적</p>
          </div>
          <div style={styles.headerActions}>
            <CompanySwitch value={safeCompanyId} onChange={setCompanyId} />
            <button style={styles.primaryButton} onClick={() => loadData({ force: true, endpoints: TAB_ENDPOINTS[tab] || INITIAL_ENDPOINTS })} disabled={loading || !hasKeywords}>
              {loading ? "갱신 중" : "새로고침"}
            </button>
          </div>
        </header>

        {!manualRefreshing && (
          <section style={styles.statusBand}>
            <Badge tone={visibleState.mode === "live" ? "green" : visibleState.mode === "error" ? "red" : "amber"}>{modeLabel(visibleState.mode)}</Badge>
            <span>{visibleState.status}</span>
            <span style={styles.statusMeta}>업데이트: {lastUpdated || "-"}</span>
          </section>
        )}

        <KeywordPanel
          company={company}
          keywords={keywords}
          draftKeyword={draftKeyword}
          setDraftKeyword={setDraftKeyword}
          addKeyword={addKeyword}
          removeKeyword={removeKeyword}
          syncStatus={keywordSyncStatus}
        />

        {!manualRefreshing && <KpiRow data={data} />}

        <nav style={styles.tabs}>
          {TABS.map((item) => (
            <button key={item.id} onClick={() => setTab(item.id)} style={tab === item.id ? styles.activeTab : styles.tab}>
              {item.label}
            </button>
          ))}
        </nav>

        <section style={styles.panel}>
          {manualRefreshing ? (
            <RefreshState />
          ) : opportunityDataLoading ? (
            <ApiCallingState />
          ) : (
            <>
              <DataState mode={visibleState.mode} loading={visibleState.loading} status={visibleState.status} refreshing={visibleState.refreshing} />
              {tab === "bids" && (
                <BidsTab
                  rows={data.bids}
                  pending={pendingEndpoints.includes("bids")}
                  onAnalyze={(row) => {
                    setSelectedAnalysisBid(row);
                    window.setTimeout(() => loadData({ endpoints: ["awards"] }), 0);
                  }}
                />
              )}
              {tab === "plans" && <PlansTab plans={data.plans} specs={data.specs} planPending={pendingEndpoints.includes("plan")} specPending={pendingEndpoints.includes("spec")} />}
              {tab === "regions" && (
                <BudgetTab
                  rows={data.budgets}
                  pending={pendingEndpoints.includes("lofin")}
                  companyId={safeCompanyId}
                  salesNotes={salesNotes}
                />
              )}
              {tab === "competitors" && (
                <CompetitorsTab
                  rows={data.competitors}
                  delivery={deliveryData}
                  activeCompany={company.label}
                  pending={pendingEndpoints.includes("awards")}
                  deliveryLoading={deliveryLoading}
                  deliveryError={deliveryError}
                />
              )}
              {tab === "buyers" && <BuyersTab rows={data.buyers} pending={pendingEndpoints.includes("contract")} />}
              {tab === "opportunities" && <OpportunitiesTab rows={data.opportunities} pending={pendingEndpoints.length > 0} />}
            </>
          )}
        </section>
        {selectedAnalysisBid && (
          <BidAnalysisDrawer
            bid={selectedAnalysisBid}
            awards={data.awardsRaw}
            pending={fetchingEndpoints.includes("awards")}
            companyId={safeCompanyId}
            companyLabel={company.label}
            onClose={() => setSelectedAnalysisBid(null)}
          />
        )}
      </main>
    </div>
  );
}

function CompanySwitch({ value, onChange }) {
  return (
    <div style={styles.segment}>
      {Object.entries(COMPANIES).map(([id, company]) => (
        <button key={id} style={value === id ? styles.segmentActive : styles.segmentButton} onClick={() => onChange(id)}>
          {company.label}
        </button>
      ))}
    </div>
  );
}

function KeywordPanel({ company, keywords, draftKeyword, setDraftKeyword, addKeyword, removeKeyword, syncStatus }) {
  return (
    <section style={styles.keywordPanel}>
      <div>
        <strong>{company.label} 키워드</strong>
        <div style={styles.keywordList}>
          {keywords.length ? (
            keywords.map((keyword) => (
              <button key={keyword} style={styles.keywordChip} onClick={() => removeKeyword(keyword)} title="클릭하면 삭제">
                {keyword} ×
              </button>
            ))
          ) : (
            <span style={styles.cellSub}>등록된 키워드가 없습니다. 키워드를 추가하면 데이터를 불러옵니다.</span>
          )}
        </div>
        {syncStatus && <div style={styles.cellSub}>{syncStatus}</div>}
      </div>
      <div style={styles.keywordInputWrap}>
        <input
          style={styles.input}
          value={draftKeyword}
          onChange={(event) => setDraftKeyword(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && !event.nativeEvent.isComposing && addKeyword()}
          placeholder="검색 키워드 추가"
        />
        <button style={styles.secondaryButton} onClick={addKeyword}>추가</button>
      </div>
    </section>
  );
}

function KpiRow({ data }) {
  return (
    <section style={styles.kpis}>
      <Kpi label="입찰 가능 공고" value={`${data.bids.length}건`} sub="최근 30일" tone={COLORS.blue} />
      <Kpi label="이번 주 사전규격 마감" value={`${data.specDueThisWeek}건`} sub="의견 제출 필요" tone={data.specDueThisWeek ? COLORS.red : COLORS.gray} />
      <Kpi label="발주계획 신규" value={`${data.plans.length}건`} sub="선제 영업 대상" tone={COLORS.teal} />
      <Kpi label="공략 추천 기관" value={`${data.opportunities.filter((item) => item.score >= 80).length}곳`} sub="80점 이상" tone={COLORS.green} />
    </section>
  );
}

function Kpi({ label, value, sub, tone }) {
  return (
    <div style={styles.kpi}>
      <div style={styles.kpiLabel}>{label}</div>
      <div style={{ ...styles.kpiValue, color: tone }}>{value}</div>
      <div style={styles.kpiSub}>{sub}</div>
    </div>
  );
}

function DataState({ mode, loading, status, refreshing }) {
  if (mode === "live" || mode === "cache") return null;

  if (refreshing) {
    return (
      <div style={styles.loadingState}>
        <strong>API 호출 중</strong>
        <span>{status}</span>
        <span>최신 데이터를 받아오는 동안 기존 데이터를 계속 표시합니다.</span>
      </div>
    );
  }

  if (mode === "stale") {
    return (
      <div style={styles.staleState}>
        <strong>이전 데이터 표시 중</strong>
        <span>{status}</span>
        <span>서버(조달청 등)가 응답하지 않아 마지막으로 받아둔 데이터를 보여주고 있습니다. 복구되면 새로고침하세요.</span>
      </div>
    );
  }

  return (
    <div style={mode === "error" ? styles.errorState : styles.loadingState}>
      <strong>{loading ? "데이터 불러오는 중" : mode === "error" ? "실시간 데이터 없음" : "데이터 대기 중"}</strong>
      <span>{status}</span>
      {loading && <span>샘플이나 이전 회사 데이터는 표시하지 않습니다. 처음 조회는 조달 API 호출 수 때문에 시간이 걸릴 수 있습니다.</span>}
      {mode === "error" && <span>Worker가 실행 중인지, API 키와 접근 토큰 설정이 맞는지 확인한 뒤 새로고침하세요.</span>}
    </div>
  );
}

function RefreshState() {
  return (
    <div style={styles.refreshState} role="status" aria-live="polite">
      <strong>새로고침 중</strong>
    </div>
  );
}

function ApiCallingState() {
  return (
    <div style={styles.refreshState} role="status" aria-live="polite">
      <strong>API 호출 중</strong>
    </div>
  );
}

function getVisibleDataState({ tab, mode, status, loading, loadedEndpoints, failedEndpoints, staleEndpoints = {}, fetchingEndpoints = [] }) {
  const tabEndpoints = TAB_ENDPOINTS[tab] || [];
  const tabFailed = tabEndpoints.filter((endpoint) => failedEndpoints.includes(endpoint));
  const tabLoaded = tabEndpoints.filter((endpoint) => loadedEndpoints.includes(endpoint));
  const tabStale = tabFailed.filter((endpoint) => staleEndpoints[endpoint]);
  const tabPending = loading && tabEndpoints.some(
    (endpoint) => fetchingEndpoints.includes(endpoint) || (!loadedEndpoints.includes(endpoint) && !failedEndpoints.includes(endpoint))
  );

  if (tabPending) {
    return tabLoaded.length
      ? { mode: "loading", loading: true, refreshing: true, status: "현재 탭 데이터 호출 중 · 수신된 데이터 먼저 표시" }
      : { mode: "loading", loading: true, status: "현재 탭 데이터 호출 중" };
  }

  if (tabFailed.length && !tabLoaded.length) {
    // 실패했지만 만료 캐시로 화면을 채운 경우 — 데이터는 보이니 오류 대신 '이전 데이터' 안내
    if (tabStale.length === tabFailed.length) {
      const oldest = Math.min(...tabStale.map((endpoint) => staleEndpoints[endpoint]));
      return { mode: "stale", loading: false, status: `서버 미응답 · ${formatDataAge(oldest)} 데이터 표시 중 (${tabStale.join(", ")})` };
    }
    return { mode: "error", loading: false, status: `현재 탭 endpoint 실패: ${tabFailed.join(", ")}` };
  }

  if (tabFailed.length) {
    const staleNote = tabStale.length
      ? ` · ${tabStale.join(", ")}는 ${formatDataAge(Math.min(...tabStale.map((endpoint) => staleEndpoints[endpoint])))} 데이터`
      : "";
    return { mode: "live", loading: false, status: `현재 탭 일부 endpoint 실패: ${tabFailed.join(", ")}${staleNote}` };
  }

  if (tabLoaded.length) {
    return { mode: mode === "cache" ? "cache" : "live", loading: false, status: "현재 탭 데이터 표시 중" };
  }

  if (mode === "error") {
    return { mode: "empty", loading: false, status: "현재 탭 데이터 대기 중" };
  }

  return { mode, loading, status };
}

function MemoTextarea({ id }) {
  const [memo, setMemo] = useStoredState(`g2b-plan-memo:${id}`, "");
  return (
    <textarea
      style={styles.memo}
      value={memo}
      onChange={(event) => setMemo(event.target.value)}
      placeholder="선제 영업 메모"
    />
  );
}

function BidsTab({ rows, pending, onAnalyze }) {
  return (
    <>
      <SectionTitle>오늘 입찰 가능한 공고</SectionTitle>
      <DataTable
        headers={["공고명", "발주기관", "예산", "개찰일", "마감", "지역", "액션"]}
        rows={rows}
        pending={pending}
        render={(row) => [
          row.url ? (
            <a style={styles.link} href={row.url} target="_blank" rel="noreferrer">
              {row.name}
            </a>
          ) : row.name,
          row.org,
          formatMoney(row.budget),
          <Badge tone={ddayTone(row.openDday)}>{formatDday(row.openDday)}</Badge>,
          row.closeDate || "-",
          row.region || "전국",
          <button style={styles.analysisButton} onClick={() => onAnalyze(row)}>투찰 분석</button>,
        ]}
      />
    </>
  );
}

function BidAnalysisDrawer({ bid, awards = [], pending, companyId, companyLabel, onClose }) {
  const [floorRate, setFloorRate] = useState("87.995");
  const [myBids, setMyBids] = useStoredState("g2b-my-bids", []);
  const [recordOpen, setRecordOpen] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const analysis = useMemo(() => analyzeBidOpportunity(bid, awards, num(floorRate)), [bid, awards, floorRate]);
  const companyHistory = myBids
    .filter((item) => item.company === companyId && (item.org ? organizationsMatch(item.org, bid.org) : item.bidNo === bid.bidNo))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  return (
    <div style={styles.drawerBackdrop} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside style={styles.drawer} role="dialog" aria-modal="true" aria-label={`${bid.name} 투찰 분석`}>
        <div style={styles.drawerHeader}>
          <div>
            <div style={styles.drawerEyebrow}>공고별 투찰 분석</div>
            <h2 style={styles.drawerTitle}>{bid.name}</h2>
            <div style={styles.cardMeta}>{bid.org} · 기초금액 {formatMoney(bid.budget)} · 개찰 {formatDate(bid.openDate) || "-"}</div>
          </div>
          <button style={styles.drawerClose} onClick={onClose} aria-label="닫기">×</button>
        </div>

        <section style={styles.drawerSection}>
          <label style={styles.floorLabel}>
            <strong>낙찰하한율</strong>
            <span style={styles.floorInputWrap}>
              <input
                style={{ ...styles.input, minWidth: 0, width: 120 }}
                value={floorRate}
                onChange={(event) => setFloorRate(event.target.value)}
                inputMode="decimal"
                aria-label="낙찰하한율"
              /> %
            </span>
          </label>
          <div style={styles.cellSub}>공고문에 명시된 값을 직접 확인해 입력하세요.</div>
        </section>

        {pending && !awards.length ? <LoadingPlaceholder /> : (
          <>
            <RateDistributionSection analysis={analysis} />
            <CompetitorHistorySection competitors={analysis.competitors} />
            <RecommendationSection analysis={analysis} budget={bid.budget} />
          </>
        )}

        <section style={styles.drawerSection}>
          <div style={styles.sectionHeadingRow}>
            <h3 style={styles.drawerSectionTitle}>우리 이력</h3>
            <button style={styles.secondaryButton} onClick={() => setRecordOpen((value) => !value)}>+ 이번 투찰 기록하기</button>
          </div>
          {recordOpen && (
            <BidRecordForm
              bid={bid}
              companyId={companyId}
              myBids={myBids}
              setMyBids={setMyBids}
              onSaved={() => setRecordOpen(false)}
            />
          )}
          {!companyHistory.length && <div style={styles.empty}>이 기관에 기록한 {companyLabel} 투찰 이력이 없습니다.</div>}
          {!!companyHistory.length && (
            <div style={styles.cardStack}>
              {companyHistory.map((item, index) => {
                const result = analyzeStoredBid(item, awards);
                return (
                  <div key={`${item.bidNo}-${item.createdAt}-${index}`} style={styles.card}>
                    <div style={styles.cardTitle}>{item.createdAt} · {item.bidName || item.bidNo} <Badge tone={item.result === "won" ? "green" : "red"}>{item.result === "won" ? "낙찰" : "패찰"}</Badge></div>
                    <div style={styles.cardMeta}>우리 투찰가 {formatMoney(item.myPrice)}{result ? ` · 투찰률 ${result.myRate.toFixed(3)}%` : ""}</div>
                    {result && <div style={styles.summary}>실제 낙찰률 {result.awardedRate.toFixed(3)}% 대비 {Math.abs(result.gap).toFixed(3)}%p {result.gap > 0 ? "높게" : "낮게"} 투찰</div>}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div style={styles.warningList}>
          <div>• 예정가격은 개찰 시 복수예비가격 추첨으로 확정되므로 예상 금액은 기초금액 기준 참고치임</div>
          <div>• 낙찰하한율 미만 투찰은 무효 — 하한율은 반드시 공고문 원문에서 확인</div>
          <div>• 과거 분포는 참고 자료이며 낙찰을 보장하지 않음</div>
        </div>
      </aside>
    </div>
  );
}

function RateDistributionSection({ analysis }) {
  return (
    <section style={styles.drawerSection}>
      <div style={styles.sectionHeadingRow}>
        <h3 style={styles.drawerSectionTitle}>낙찰률 분포</h3>
        <Badge tone={analysis.confidenceTone}>{analysis.confidenceLabel}</Badge>
      </div>
      <div style={styles.cardMeta}>{analysis.scopeMessage}</div>
      {!!analysis.orgRates.length && <RateStats label="이 기관 · 유사 품목" rates={analysis.orgRates} />}
      {analysis.showProductDistribution && !!analysis.productRates.length && <RateStats label="품목 전체 · 기관 무관" rates={analysis.productRates} />}
      {!analysis.displayRates.length && <EmptyBlock message="최근 3년 낙찰 결과에서 유사 품목 표본을 찾지 못했습니다." />}
    </section>
  );
}

function RateStats({ label, rates }) {
  const stat = rateStatistics(rates);
  const bars = buildDecimalRateBuckets(rates);
  return (
    <div style={styles.rateBlock}>
      <div style={styles.cardTitle}>{label} ({stat.n}건)</div>
      <div style={styles.decimalHistogram}>
        {bars.map((bar) => (
          <div key={bar.label} style={styles.decimalHistRow}>
            <span>{bar.label}%</span>
            <div style={styles.histBarWrap}><div style={{ ...styles.histBar, width: `${bar.width}%` }} /></div>
            <strong>{bar.count}</strong>
          </div>
        ))}
      </div>
      <div style={styles.statGrid}>
        <span>평균 <strong>{stat.avg.toFixed(3)}%</strong></span>
        <span>중앙값 <strong>{stat.median.toFixed(3)}%</strong></span>
        <span>최저 <strong>{stat.min.toFixed(3)}%</strong></span>
        <span>최고 <strong>{stat.max.toFixed(3)}%</strong></span>
      </div>
    </div>
  );
}

function CompetitorHistorySection({ competitors }) {
  return (
    <section style={styles.drawerSection}>
      <h3 style={styles.drawerSectionTitle}>이 공고에 올 만한 경쟁사</h3>
      <div style={styles.cellSub}>낙찰정보서비스에서 이 기관·유사 품목의 낙찰자로 확인된 업체입니다. 전체 투찰 참여업체 목록은 아닙니다.</div>
      {!competitors.length && <EmptyBlock message="확인된 경쟁사 이력이 없습니다." />}
      {!!competitors.length && (
        <div style={styles.cardStack}>
          {competitors.map((item) => (
            <div key={item.name} style={styles.compactCompetitor}>
              <strong>{item.name}</strong>
              <span>이 기관 {item.count}회 낙찰 · 평균 {item.avgRate.toFixed(3)}% · {item.count}승</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function RecommendationSection({ analysis, budget }) {
  if (!analysis.recommendations) {
    return <section style={styles.drawerSection}><h3 style={styles.drawerSectionTitle}>권장 투찰 구간</h3><EmptyBlock message="유효한 낙찰하한율을 입력하면 권장 구간을 계산합니다." /></section>;
  }
  const rows = [
    ["공격", analysis.recommendations.aggressive, "하한 바로 위"],
    ["표준", analysis.recommendations.standard, "중앙값 반영"],
    ["안전", analysis.recommendations.safe, "평균 반영"],
  ];
  return (
    <section style={styles.drawerSection}>
      <h3 style={styles.drawerSectionTitle}>권장 투찰 구간</h3>
      <div style={styles.recommendationGrid}>
        {rows.map(([label, rate, description]) => (
          <div key={label} style={styles.recommendationRow}>
            <strong>{label}</strong>
            <span>{rate.toFixed(3)}%</span>
            <span>→ {formatWon(budget * rate / 100)}</span>
            <small>{description}</small>
          </div>
        ))}
      </div>
      {analysis.comment && <div style={styles.autoComment}>자동 코멘트: {analysis.comment}</div>}
    </section>
  );
}

function BidRecordForm({ bid, companyId, myBids, setMyBids, onSaved }) {
  const [draft, setDraft] = useState({ myPrice: "", result: "lost" });
  const save = () => {
    const myPrice = num(draft.myPrice);
    if (!myPrice) return;
    setMyBids([...myBids, {
      bidNo: bid.bidNo,
      bidName: bid.name,
      org: bid.org,
      item: bid.item || bid.name,
      basePrice: bid.budget,
      myPrice,
      result: draft.result,
      company: companyId,
      createdAt: new Date().toISOString().slice(0, 10),
    }]);
    onSaved();
  };
  return (
    <div style={styles.bidRecordForm}>
      <input style={styles.input} value={draft.myPrice} onChange={(event) => setDraft({ ...draft, myPrice: event.target.value })} placeholder="우리 투찰가 (원)" inputMode="numeric" />
      <select style={styles.select} value={draft.result} onChange={(event) => setDraft({ ...draft, result: event.target.value })}>
        <option value="won">낙찰</option><option value="lost">패찰</option>
      </select>
      <button style={styles.primaryButton} onClick={save}>기록 저장</button>
    </div>
  );
}

function PlansTab({ plans, specs, planPending, specPending }) {
  return (
    <div style={styles.twoCol}>
      <div>
        <SectionTitle>발주계획</SectionTitle>
        <CardList
          rows={plans}
          pending={planPending}
          empty="발주계획 데이터가 없습니다."
          render={(row) => (
            <>
              <div style={styles.cardTitle}>{row.product}</div>
              <div style={styles.cardMeta}>{row.org} · {formatMoney(row.amount)}</div>
              <div style={styles.cardFooter}>
                <Badge tone="blue">예정 {formatDday(row.dday)}</Badge>
                <span>공고기관: {row.noticeOrg || "-"}</span>
              </div>
              <MemoTextarea id={row.id} />
            </>
          )}
        />
      </div>
      <div>
        <SectionTitle>사전규격</SectionTitle>
        <CardList
          rows={specs}
          pending={specPending}
          empty="사전규격 데이터가 없습니다."
          render={(row) => (
            <>
              <div style={styles.cardTitle}>{row.product}</div>
              <div style={styles.cardMeta}>{row.org} · 공개일 {row.releaseDate || "-"}</div>
              <p style={styles.summary}>{row.summary}</p>
              <div style={styles.cardFooter}>
                <Badge tone={row.dday <= 3 ? "red" : "amber"}>마감 {formatDday(row.dday)}</Badge>
                {row.url ? <a style={styles.link} href={row.url} target="_blank" rel="noreferrer">의견 제출하기</a> : <span>-</span>}
              </div>
            </>
          )}
        />
      </div>
    </div>
  );
}

// ── 탭③ 지역 예산·집행률 (v6 명세 4~5장 전면 교체) ──
const BUDGET_PRESETS = [
  { id: "first", label: "1차 영업 (2~3월)", hint: "예산현액 내림차순 — 신규 편성 사업 발굴" },
  { id: "second", label: "2차 영업 (8~10월)", hint: "지연지수 내림차순 · 잔액 ≥ 1천만원 — 집행 압박 기관" },
  { id: "yearend", label: "연말 소진 (11~12월)", hint: "집행잔액 내림차순 — 연내 소진할 잔액 큰 기관" },
  { id: "all", label: "전체 보기", hint: "지연지수 내림차순" },
];

function applyBudgetPreset(rows, preset) {
  if (preset === "first") return [...rows].sort((a, b) => b.budgetAmt - a.budgetAmt);
  if (preset === "second") {
    return rows.filter((row) => row.remaining >= GRADE_ORANGE_REMAINING).sort((a, b) => b.lagIndex - a.lagIndex);
  }
  if (preset === "yearend") return [...rows].sort((a, b) => b.remaining - a.remaining);
  return [...rows].sort((a, b) => b.lagIndex - a.lagIndex);
}

function BudgetTab({ rows, pending, companyId, salesNotes }) {
  const [preset, setPreset] = useStoredState("g2b-budget-preset", "all");
  const [regionFilter, setRegionFilter] = useState("전체");
  const [uncontactedOnly, setUncontactedOnly] = useState(false);
  const [productOnly, setProductOnly] = useStoredState("g2b-budget-product-only", true);
  const { notes, saveNote: saveSharedNote, syncStatus: noteSyncStatus } = salesNotes;
  const [openNoteKey, setOpenNoteKey] = useState("");

  if (!rows.length) {
    return (
      <>
        <SectionTitle>예산 집행률 · 영업 타이밍</SectionTitle>
        {pending ? <LoadingPlaceholder /> : <EmptyBlock message="지방재정365 예산 데이터가 없습니다. LOFIN_KEY 설정과 검색 키워드를 확인하세요." />}
      </>
    );
  }

  // 용역성 사업(운영·위탁·수거대행 등) 제외 — 물품 신호가 있는 혼합형("설치 및 관리")은 유지
  const scopedRows = productOnly ? rows.filter((row) => row.bizType !== "service") : rows;
  const serviceCount = rows.length - rows.filter((row) => row.bizType !== "service").length;

  const elapsedRate = rows[0]?.elapsedRate ?? computeElapsedRate();
  const nowCount = scopedRows.filter((row) => row.grade === "now").length;
  const totalRemaining = scopedRows.reduce((sum, row) => sum + Math.max(0, row.remaining), 0);
  const avgExecRate = scopedRows.length
    ? scopedRows.reduce((sum, row) => sum + row.execRate, 0) / scopedRows.length
    : 0;

  const noteKeyFor = (row) => `${companyId}|${row.org}|${row.bizName}`;
  const noteFor = (row) => notes[noteKeyFor(row)] || EMPTY_NOTE;
  const saveNote = (row, patch) => saveSharedNote(noteKeyFor(row), patch, companyId);

  const regionsPresent = ["전체", ...new Set(scopedRows.map((row) => row.region))];
  let visibleRows = applyBudgetPreset(scopedRows, preset);
  if (regionFilter !== "전체") visibleRows = visibleRows.filter((row) => row.region === regionFilter);
  if (uncontactedOnly) visibleRows = visibleRows.filter((row) => noteFor(row).status === "none" || !noteFor(row).status);

  return (
    <>
      <SectionTitle>예산 집행률 · 영업 타이밍</SectionTitle>
      <section style={styles.kpis}>
        <Kpi label="즉시 영업 대상" value={`${nowCount}건`} sub="지연지수 40 이상 · 잔액 3천만원 이상" tone={nowCount ? COLORS.red : COLORS.gray} />
        <Kpi label="총 집행잔액" value={formatMoney(totalRemaining)} sub="표시 중인 사업 합계" tone={COLORS.blue} />
        <Kpi label="연중 경과율" value={`${elapsedRate.toFixed(1)}%`} sub="오늘 기준" tone={COLORS.slate} />
        <Kpi label="평균 집행률" value={`${avgExecRate.toFixed(1)}%`} sub={`${scopedRows.length}개 사업 평균`} tone={COLORS.teal} />
      </section>

      <div style={styles.presetBar}>
        {BUDGET_PRESETS.map((item) => (
          <button
            key={item.id}
            title={item.hint}
            onClick={() => setPreset(item.id)}
            style={preset === item.id ? styles.presetActive : styles.presetButton}
          >
            {item.label}
          </button>
        ))}
        <select style={styles.select} value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)}>
          {regionsPresent.map((region) => <option key={region} value={region}>{region}</option>)}
        </select>
        <label style={styles.toggleLabel}>
          <input type="checkbox" checked={uncontactedOnly} onChange={(event) => setUncontactedOnly(event.target.checked)} />
          미접촉만 보기
        </label>
        <label style={styles.toggleLabel}>
          <input type="checkbox" checked={productOnly} onChange={(event) => setProductOnly(event.target.checked)} />
          물품 사업만 보기{serviceCount > 0 && ` (용역성 ${serviceCount}건 제외)`}
        </label>
      </div>

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              {["등급", "자치단체", "세부사업명", "예산현액", "지출액", "집행잔액", "집행률", "지연지수", "발주계획", "영업 메모"].map((header) => (
                <th key={header} style={styles.th}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const note = noteFor(row);
              const key = noteKeyFor(row);
              const grade = BUDGET_GRADES[row.grade] || BUDGET_GRADES.watch;
              return (
                <React.Fragment key={row.id}>
                  <tr style={styles.tr}>
                    <td style={styles.td}><Badge tone={grade.tone}>{grade.label}</Badge></td>
                    <td style={styles.td}>
                      <div>{row.org}</div>
                      <div style={styles.cellSub}>{row.region}</div>
                    </td>
                    <td style={styles.td}>
                      {row.bizName}
                      {row.bizType === "service" && <span style={{ marginLeft: 6 }}><Badge tone="gray">용역성</Badge></span>}
                    </td>
                    <td style={styles.td}>{formatMoney(row.budgetAmt)}</td>
                    <td style={styles.td}>{formatMoney(row.spentAmt)}</td>
                    <td style={{ ...styles.td, fontWeight: 800 }}>{formatMoney(row.remaining)}</td>
                    <td style={styles.td}><ExecRateBar rate={row.execRate} /></td>
                    <td style={styles.td}>
                      <strong style={{ color: row.lagIndex >= 40 ? COLORS.red : row.lagIndex >= 20 ? COLORS.amber : COLORS.slate }}>
                        {row.lagIndex.toFixed(0)}
                      </strong>
                    </td>
                    <td style={styles.td}>{row.planMatched ? <Badge tone="green">✓ 있음</Badge> : <span style={styles.cellSub}>-</span>}</td>
                    <td style={styles.td}>
                      <button style={styles.noteButton} onClick={() => setOpenNoteKey(openNoteKey === key ? "" : key)}>
                        <Badge tone={note.status && note.status !== "none" ? "blue" : "gray"}>
                          {SALES_STATUS_LABELS[note.status] || "미접촉"}
                        </Badge>
                      </button>
                    </td>
                  </tr>
                  {openNoteKey === key && (
                    <tr style={styles.tr}>
                      <td style={styles.td} colSpan={10}>
                        <div style={styles.notePanel}>
                          <select
                            style={styles.select}
                            value={note.status || "none"}
                            onChange={(event) => saveNote(row, { status: event.target.value })}
                          >
                            {Object.entries(SALES_STATUS_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                          </select>
                          <textarea
                            style={{ ...styles.memo, marginTop: 0, flex: 1 }}
                            value={note.memo || ""}
                            onChange={(event) => saveNote(row, { memo: event.target.value })}
                            placeholder="담당자명, 통화 내용, 특이사항"
                          />
                          <span style={styles.cellSub}>최근 접촉: {note.lastContact || "-"}</span>
                          <span style={styles.cellSub}>{noteSyncStatus}</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        {!visibleRows.length && <div style={styles.empty}>조건에 맞는 사업이 없습니다.</div>}
      </div>
    </>
  );
}

function ExecRateBar({ rate }) {
  const clamped = Math.max(0, Math.min(100, rate));
  return (
    <div style={styles.scoreWrap}>
      <div style={{ ...styles.scoreBar, width: `${clamped}%`, background: clamped >= 60 ? COLORS.green : clamped >= 30 ? COLORS.amber : COLORS.red }} />
      <span>{clamped.toFixed(0)}%</span>
    </div>
  );
}

function CompetitorsTab({ rows, delivery, activeCompany, pending, deliveryLoading, deliveryError }) {
  const comparisonRows = mergeCompetitorSources(rows, delivery.suppliers);
  return (
    <>
      <div style={styles.note}>
        낙찰정보와 종합쇼핑몰 납품요구를 합산한 금액을 함께 표시합니다.
      </div>
      <SectionTitle>낙찰·납품 통합 경쟁사 비교</SectionTitle>
      <DataTable
        headers={["업체", "입찰 낙찰", "낙찰금액", "평균 낙찰률", "MAS 판매", "MAS 판매금액", "합산금액", "MAS 거래기관", "주요 기관"]}
        rows={comparisonRows}
        pending={pending || deliveryLoading}
        render={(row) => [
          <span style={row.name.includes(activeCompany) ? { color: COLORS.blue, fontWeight: 800 } : undefined}>{row.name}</span>,
          row.awardCount ? `${row.awardCount}건` : "-",
          row.awardCount ? formatMoney(row.awardAmount) : "-",
          row.awardCount ? `${row.avgRate.toFixed(1)}%` : "-",
          row.deliveryCount ? `${row.deliveryCount}건` : "-",
          row.deliveryCount ? formatMoney(row.deliveryAmount) : "-",
          formatMoney(row.totalAmount),
          row.deliveryCount ? `${row.deliveryOrgCount}곳` : "-",
          row.deliveryMainOrg || row.awardMainOrg || "-",
        ]}
      />

      <SectionTitle>나라장터 낙찰 경쟁사 Top10</SectionTitle>
      {!rows.length && (pending ? <LoadingPlaceholder /> : <EmptyBlock message="경쟁사 데이터가 없습니다." />)}
      <div style={styles.cardGrid}>
        {rows.map((row, index) => (
          <div key={row.name} style={row.name.includes(activeCompany) ? styles.activeCard : styles.card}>
            <div style={styles.cardTitle}>#{index + 1} {row.name}</div>
            <div style={styles.cardMeta}>수주 {row.count}건 · {formatMoney(row.amount)}</div>
            <div style={styles.cardFooter}>
              <Badge tone="blue">평균 {row.avgRate.toFixed(1)}%</Badge>
              <span>{row.mainOrg || "주요 기관 없음"}</span>
            </div>
          </div>
        ))}
      </div>
      {!!rows.length && (
        <ChartBlock>
          <BarChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-12} height={48} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(value) => formatMoney(value)} />
            <Bar dataKey="amount" name="수주금액" radius={[4, 4, 0, 0]}>
              {rows.map((_, index) => <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ChartBlock>
      )}

      <SectionTitle>MAS 판매 Top10</SectionTitle>
      <DeliverySnapshotState delivery={delivery} loading={deliveryLoading} error={deliveryError} />
      {!!delivery.suppliers.length && (
        <>
          <div style={styles.cardGrid}>
            {delivery.suppliers.map((row, index) => (
              <div key={row.name} style={row.name.includes(activeCompany) ? styles.activeCard : styles.card}>
                <div style={styles.cardTitle}>#{index + 1} {row.name}</div>
                <div style={styles.cardMeta}>MAS 판매 {row.count}건 · {formatMoney(row.amount)}</div>
                <div style={styles.cardFooter}>
                  <Badge tone="green">품목 {row.itemCount}건</Badge>
                  <span>거래기관 {row.orgCount}곳 · {row.mainOrg || "주요 기관 없음"}</span>
                </div>
              </div>
            ))}
          </div>
          <ChartBlock>
            <BarChart data={delivery.suppliers}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-12} height={48} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => formatMoney(value)} />
              <Bar dataKey="amount" name="납품금액" fill={COLORS.teal} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartBlock>
        </>
      )}
    </>
  );
}

function DeliverySnapshotState({ delivery, loading, error }) {
  if (loading) return <LoadingPlaceholder />;
  if (error) return <EmptyBlock message={`납품요구 snapshot 로드 실패: ${error}`} />;
  if (!delivery.rows.length) return <EmptyBlock message="선택한 회사 키워드와 일치하는 납품요구 데이터가 없습니다." />;
  return (
    <div style={styles.note}>
      {delivery.source} · {delivery.rows.length}개 품목 · snapshot {formatDateTime(delivery.generatedAt)}
    </div>
  );
}

function BuyersTab({ rows, pending }) {
  return (
    <>
      <SectionTitle>발주처 반복 선택 패턴</SectionTitle>
      <DataTable
        headers={["기관", "계약금액", "계약건수", "주요 업체", "집중도", "판정"]}
        rows={rows}
        pending={pending}
        render={(row) => [
          row.org,
          formatMoney(row.amount),
          `${row.count}건`,
          row.topCorp,
          `${Math.round(row.hhi * 100)}%`,
          <Badge tone={row.recommendation === "진입 추천" ? "green" : row.recommendation === "텃세 주의" ? "red" : "amber"}>{row.recommendation}</Badge>,
        ]}
      />
    </>
  );
}

function OpportunitiesTab({ rows, pending }) {
  return (
    <>
      <div style={styles.note}>공략 점수 = 예산 25% + 지연지수(집행 압박) 25% + 독점도 낮음 20% + 발주계획 20% + 사전규격 10%</div>
      <SectionTitle>자동 추천 기관</SectionTitle>
      <DataTable
        headers={["순위", "기관", "지역", "예산", "지연지수", "가격정보", "점수", "상태"]}
        rows={rows}
        pending={pending}
        render={(row, index) => [
          `#${index + 1}`,
          row.org,
          row.region,
          formatMoney(row.budget),
          row.lagIndex === null ? "-" : row.lagIndex,
          row.priceMatched ? `${row.priceCount}건` : "-",
          <ScoreBar score={row.score} />,
          <Badge tone={row.score >= 80 ? "green" : row.score >= 60 ? "amber" : "gray"}>
            {row.score >= 80 ? "적극 공략" : row.score >= 60 ? "검토 필요" : "진입 어려움"}
          </Badge>,
        ]}
      />
    </>
  );
}

function DataTable({ headers, rows, render, pending }) {
  if (pending && !rows.length) return <LoadingPlaceholder />;

  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>{headers.map((header) => <th key={header} style={styles.th}>{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={row.id || row.org || row.name || rowIndex} style={styles.tr}>
              {render(row, rowIndex).map((cell, index) => <td key={index} style={styles.td}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <div style={styles.empty}>표시할 데이터가 없습니다.</div>}
    </div>
  );
}

function CardList({ rows, render, empty, pending }) {
  if (pending && !rows.length) return <LoadingPlaceholder />;
  if (!rows.length) return <div style={styles.empty}>{empty}</div>;
  return <div style={styles.cardStack}>{rows.map((row, index) => <div key={row.id || index} style={styles.card}>{render(row)}</div>)}</div>;
}

function EmptyBlock({ message }) {
  return <div style={styles.empty}>{message}</div>;
}

function LoadingPlaceholder() {
  return (
    <div style={styles.placeholder}>
      <div style={styles.placeholderHeader}>
        <strong>API 호출 중</strong>
        <span>대시보드 구성 중입니다.</span>
      </div>
      <div style={styles.placeholderRows}>
        <span style={{ ...styles.placeholderBar, width: "72%" }} />
        <span style={{ ...styles.placeholderBar, width: "48%" }} />
        <span style={{ ...styles.placeholderBar, width: "60%" }} />
      </div>
    </div>
  );
}

function SectionTitle({ children }) {
  return <h2 style={styles.h2}>{children}</h2>;
}

function ChartBlock({ children }) {
  return <div style={styles.chart}><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>;
}

function Badge({ children, tone = "gray" }) {
  const palette = {
    blue: ["#DBEAFE", "#1D4ED8"],
    green: ["#DCFCE7", "#166534"],
    amber: ["#FEF3C7", "#92400E"],
    orange: ["#FFEDD5", "#9A3412"],
    red: ["#FEE2E2", "#991B1B"],
    gray: ["#F1F5F9", "#475569"],
  }[tone];
  return <span style={{ ...styles.badge, background: palette[0], color: palette[1] }}>{children}</span>;
}

function ScoreBar({ score }) {
  return (
    <div style={styles.scoreWrap}>
      <div style={{ ...styles.scoreBar, width: `${score}%`, background: score >= 80 ? COLORS.green : score >= 60 ? COLORS.amber : COLORS.gray }} />
      <span>{score}</span>
    </div>
  );
}

function transformBundle(bundle) {
  const cleanBundle = {
    plan: dedupeRows("plan", bundle.plan || []),
    spec: dedupeRows("spec", bundle.spec || []),
    bids: dedupeRows("bids", bundle.bids || []),
    awards: dedupeRows("awards", bundle.awards || []),
    contract: dedupeRows("contract", bundle.contract || []),
    price: dedupeRows("price", bundle.price || []),
    stats: dedupeRows("stats", bundle.stats || []),
    lofin: dedupeRows("lofin", bundle.lofin || []),
  };

  const plans = cleanBundle.plan.map((item, index) => ({
    id: `plan-${index}`,
    org: firstValue(item.dminsttNm, item.ntceInsttNm, item.orderInsttNm) || "기관 미상",
    product: item.prdctIdntfcNoNm || item.orderPlanNm || "품목 미상",
    amount: num(item.orderAmt),
    orderDate: item.orderDt,
    dday: item.orderDatePrecision === "month" ? 999 : dday(item.orderDt),
    noticeOrg: item.ntceInsttNm,
  }));

  const specs = cleanBundle.spec.map((item, index) => ({
    id: `spec-${index}`,
    org: firstValue(item.ntceInsttNm, item.dminsttNm, item.orderInsttNm, item.rlDminsttNm) || "기관 미상",
    product: item.prdctIdntfcNoNm || item.prdctNm || "품목 미상",
    releaseDate: formatDate(item.rlsDt),
    dueDate: item.opninRcptDt,
    dday: dday(item.opninRcptDt),
    summary: item.prdctStndNm || parseBracketList(item.specCn) || "규격 내용 없음",
    url: item.specDocFileUrl1 || item.specDocFileUrl2 || item.bidNtceDtlUrl || item.bidNtceUrl,
  }));

  const bids = filterActiveBids(cleanBundle.bids).map((item, index) => ({
    id: `bid-${index}`,
    bidNo: String(item.bidNtceNo || ""),
    name: item.bidNtceNm || "공고명 없음",
    item: firstValue(
      item.prdctIdntfcNoNm,
      parseBracketProductName(item.dtilPrdctClsfcNoNm),
      parseBracketProductName(item.prdctClsfcNoNm),
      item.bidNtceNm
    ) || "품목 미상",
    org: firstValue(item.ntceInsttNm, item.dminsttNm, item.cntrctInsttNm) || "기관 미상",
    budget: num(item.presmptPrce || item.asignBdgtAmt),
    openDate: item.opengDt,
    openDday: dday(item.opengDt),
    closeDate: formatDate(item.bidClseDt),
    region: item.bidprcPossblRgnNm,
    url: item.bidNtceDtlUrl || item.bidNtceUrl,
  })).filter((item) => item.openDday >= 0).sort((a, b) => a.openDday - b.openDday);

  const competitors = topCompetitors(cleanBundle.awards);
  const budgets = buildBudgetRows(cleanBundle.lofin, plans);
  const buyers = aggregateBuyers(cleanBundle.contract);
  const prices = normalizePrices(cleanBundle.price);
  const opportunities = scoreOpportunities({ buyers, plans, specs, prices, budgets });
  const specDueThisWeek = specs.filter((item) => item.dday >= 0 && item.dday <= 7).length;

  return {
    plans,
    specs,
    bids,
    competitors,
    budgets,
    buyers,
    opportunities,
    specDueThisWeek,
    awardsRaw: cleanBundle.awards,
    bidsRaw: cleanBundle.bids,
  };
}

function transformDeliverySnapshot(snapshot, companyKeywords = []) {
  const keywords = [...new Set(companyKeywords.map(normalizeText).filter(Boolean))];
  const rows = (Array.isArray(snapshot?.items) ? snapshot.items : [])
    .filter((item) => deliveryMatchesCompany(item, keywords))
    .map((item, index) => ({
      id: `delivery-${item.dlvr_req_no || index}-${item.dlvr_req_chg_ord || ""}-${item.item_seq || index}`,
      requestNo: String(item.dlvr_req_no || ""),
      changeOrder: String(item.dlvr_req_chg_ord || ""),
      itemSeq: String(item.item_seq || ""),
      date: String(item.dlvr_req_dt || ""),
      requestName: String(item.dlvr_req_nm || ""),
      org: String(item.dminstt_nm || "기관 미상"),
      region: String(item.dminstt_sgg || ""),
      corp: String(item.corp_nm || "업체 미상"),
      product: String(item.prdct_nm || item.dtl_prdct_nm || item.prdct_clsfc_nm || ""),
      amount: num(item.dlvr_amt),
      unitPrice: num(item.dlvr_uprc),
      quantity: Number(item.dlvr_qty) || 0,
      unit: String(item.unit || ""),
      keywords: String(item.keywords || ""),
    }));
  const suppliers = aggregateDeliverySuppliers(rows);
  const recent = [...rows]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.amount - a.amount)
    .slice(0, 20);
  return {
    rows,
    suppliers,
    recent,
    generatedAt: snapshot?.generatedAt || "",
    source: snapshot?.source || "조달청 종합쇼핑몰 납품요구 물품 내역",
  };
}

function deliveryMatchesCompany(item, normalizedKeywords) {
  if (!normalizedKeywords.length) return false;
  const collectedKeywords = String(item.keywords || "").split(",").map(normalizeText).filter(Boolean);
  if (collectedKeywords.some((keyword) => normalizedKeywords.includes(keyword))) return true;
  const haystack = normalizeText([
    item.dlvr_req_nm,
    item.prdct_clsfc_nm,
    item.dtl_prdct_nm,
    item.prdct_nm,
  ].filter(Boolean).join(" "));
  return normalizedKeywords.some((keyword) => haystack.includes(keyword));
}

function aggregateDeliverySuppliers(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const key = normalizeOrganizationName(row.corp) || row.corp;
    const current = map.get(key) || {
      name: row.corp,
      amount: 0,
      itemCount: 0,
      requestKeys: new Set(),
      orgs: {},
    };
    current.amount += row.amount;
    current.itemCount += 1;
    current.requestKeys.add(`${row.requestNo}|${row.changeOrder}`);
    current.orgs[row.org] = (current.orgs[row.org] || 0) + row.amount;
    map.set(key, current);
  });
  return [...map.values()]
    .map((item) => ({
      name: item.name,
      amount: item.amount,
      itemCount: item.itemCount,
      count: item.requestKeys.size,
      mainOrg: Object.entries(item.orgs).sort((a, b) => b[1] - a[1])[0]?.[0] || "",
      orgCount: Object.keys(item.orgs).length,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);
}

function mergeCompetitorSources(awards = [], deliveries = []) {
  const map = new Map();
  awards.forEach((row, index) => {
    const key = normalizeOrganizationName(row.name) || row.name;
    map.set(key, {
      name: row.name,
      awardCount: row.count,
      awardAmount: row.amount,
      avgRate: row.avgRate,
      awardMainOrg: row.mainOrg,
      awardRank: index + 1,
      deliveryCount: 0,
      deliveryAmount: 0,
      deliveryOrgCount: 0,
      deliveryMainOrg: "",
      deliveryRank: Number.MAX_SAFE_INTEGER,
    });
  });
  deliveries.forEach((row, index) => {
    const key = normalizeOrganizationName(row.name) || row.name;
    const current = map.get(key) || {
      name: row.name,
      awardCount: 0,
      awardAmount: 0,
      avgRate: 0,
      awardMainOrg: "",
      awardRank: Number.MAX_SAFE_INTEGER,
    };
    map.set(key, {
      ...current,
      deliveryCount: row.count,
      deliveryAmount: row.amount,
      deliveryOrgCount: row.orgCount,
      deliveryMainOrg: row.mainOrg,
      deliveryRank: index + 1,
    });
  });
  return [...map.values()]
    .map((row) => ({ ...row, totalAmount: row.awardAmount + row.deliveryAmount }))
    .sort((a, b) => Math.min(a.awardRank, a.deliveryRank) - Math.min(b.awardRank, b.deliveryRank)
      || a.awardRank - b.awardRank
      || a.deliveryRank - b.deliveryRank)
    .slice(0, 15);
}

function normalizeOrganizationName(value) {
  return normalizeText(value)
    .replace(/\(주\)|㈜|주식회사/g, "")
    .replace(/유한회사|합자회사|합명회사/g, "");
}

function normalizeText(value) {
  return String(value || "").replace(/\s/g, "").toLowerCase();
}

function formatQuantity(value) {
  return Number.isInteger(value) ? String(value) : Number(value || 0).toLocaleString("ko-KR");
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("ko-KR");
}

// 취소·변경공고 정리: 같은 공고번호는 최신 차수만 남기고, 최신 차수가 취소공고면 공고 자체를 숨긴다
// (취소공고가 원 공고와 나란히 내려와 같은 공고가 여러 줄로 보이는 문제)
function filterActiveBids(rows) {
  const latestByNo = new Map();
  const keyless = [];
  for (const row of rows) {
    const bidNo = String(row.bidNtceNo || "");
    if (!bidNo) {
      keyless.push(row);
      continue;
    }
    const current = latestByNo.get(bidNo);
    if (!current || num(row.bidNtceOrd) >= num(current.bidNtceOrd)) {
      latestByNo.set(bidNo, row);
    }
  }
  return [...latestByNo.values(), ...keyless].filter(
    (row) => !String(row.ntceKindNm || "").includes("취소")
  );
}

// ── 탭③ 예산 집행률 엔진 (v6 명세 4장) ──
function computeElapsedRate(now = new Date()) {
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearEnd = new Date(now.getFullYear(), 11, 31);
  return ((now - yearStart) / (yearEnd - yearStart)) * 100;
}

function buildBudgetRows(rows, plans = []) {
  const elapsedRate = computeElapsedRate();
  return rows
    .map((item, index) => {
      const org = firstValue(item.lofinOrgNm) || "기관 미상";
      const bizName = firstValue(item.lofinBizNm) || "사업명 미상";
      const budgetAmt = num(item.lofinBudgetAmt);
      const spentAmt = num(item.lofinSpentAmt);
      const remaining = budgetAmt - spentAmt;
      const execRate = budgetAmt > 0 ? (spentAmt / budgetAmt) * 100 : 0;
      const lagIndex = elapsedRate - execRate;
      return {
        id: `budget-${index}`,
        org,
        bizName,
        budgetAmt,
        spentAmt,
        remaining,
        execRate,
        lagIndex,
        // 지방재정365가 주는 지역명(wa_laf_hg_nm)이 가장 정확 — 없을 때만 기관명 파싱
        region: firstValue(item.lofinRegionNm) || parseRegion(org) || UNKNOWN_REGION,
        bizType: classifyBizType(bizName),
        grade: budgetGrade(lagIndex, remaining),
        planMatched: plans.some((plan) => orgsRoughlyMatch(plan.org, org) || orgsRoughlyMatch(plan.noticeOrg, org)),
        year: firstValue(item.lofinYear),
      };
    })
    .filter((row) => row.budgetAmt > 0)
    .sort((a, b) => b.lagIndex - a.lagIndex);
}

// 등급 판정 (v6 명세 4-3장): 즉시 영업 / 적극 접촉 / 관찰 / 보류
function budgetGrade(lagIndex, remaining) {
  if (lagIndex < 0 || remaining < GRADE_MIN_REMAINING) return "hold";
  if (lagIndex >= 40 && remaining >= GRADE_RED_REMAINING) return "now";
  if (lagIndex >= 20 && remaining >= GRADE_ORANGE_REMAINING) return "active";
  return "watch";
}

const BUDGET_GRADES = {
  now: { label: "즉시 영업", tone: "red" },
  active: { label: "적극 접촉", tone: "orange" },
  watch: { label: "관찰", tone: "amber" },
  hold: { label: "보류", tone: "gray" },
};

// 사업명 기반 물품/용역 분류 — lofin 데이터에 계약 구분 필드가 없어 휴리스틱으로 판별
// 물품 신호가 하나라도 있으면 물품성("클린하우스 설치 및 관리"처럼 혼합형 포함), 용역 신호만 있으면 용역성
const PRODUCT_SIGNALS = ["구매", "구입", "설치", "교체", "조성", "제작", "보급", "확충", "신설", "비치", "마련", "도입", "구축", "정비"];
const SERVICE_SIGNALS = ["운영", "관리", "위탁", "대행", "수거", "처리", "청소", "인건", "교육", "홍보", "점검", "유지보수", "임차", "임대", "수수료", "지원금", "보조금", "용역"];

function classifyBizType(bizName) {
  const name = String(bizName || "").replace(/\s/g, "");
  const hasProduct = PRODUCT_SIGNALS.some((signal) => name.includes(signal));
  const hasService = SERVICE_SIGNALS.some((signal) => name.includes(signal));
  if (hasProduct) return "product";
  if (hasService) return "service";
  return "etc"; // 애매하면 물품 후보로 남긴다
}

// 발주계획·수요기관 기관명 러프 매칭: "경기도 고양시" vs "고양시청" 같은 표기 차이를 흡수
function orgsRoughlyMatch(a, b) {
  const na = String(a || "").replace(/\s/g, "").replace(/청$/, "");
  const nb = String(b || "").replace(/\s/g, "").replace(/청$/, "");
  if (!na || !nb) return false;
  if (na.includes(nb) || nb.includes(na)) return true;
  const tokensA = na.match(/[가-힣]{1,6}(?:시|군|구)/g) || [];
  const tokensB = nb.match(/[가-힣]{1,6}(?:시|군|구)/g) || [];
  return tokensA.some((token) => token.length >= 3 && tokensB.includes(token));
}

function organizationsMatch(a, b) {
  if (!a || !b) return false;
  const left = normalizeOrganizationName(a).replace(/청$/, "");
  const right = normalizeOrganizationName(b).replace(/청$/, "");
  return left === right || left.includes(right) || right.includes(left) || orgsRoughlyMatch(a, b);
}

function awardRate(item) {
  const amount = num(item.sucsfbidAmt || item.cntrctAmt);
  const price = num(item.presmptPrce || item.plnprc);
  const rate = price ? amount / price * 100 : num(item.sucsfbidRate);
  return rate >= 50 && rate <= 110 ? rate : null;
}

function isWithinYears(value, years) {
  const date = parseDate(value);
  if (!date) return false;
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - years);
  return date >= cutoff;
}

function productTokens(value) {
  const stop = new Set(["구매", "설치", "제작", "납품", "조달", "공사", "사업", "물품", "및", "외", "건"]);
  return String(value || "").toLowerCase().match(/[가-힣a-z0-9]{2,}/g)?.filter((token) => !stop.has(token)) || [];
}

function productsMatch(a, b) {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) return false;
  if (left.includes(right) || right.includes(left)) return true;
  const leftTokens = productTokens(a);
  const rightTokens = new Set(productTokens(b));
  return leftTokens.some((token) => token.length >= 3 && rightTokens.has(token));
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function rateStatistics(rates) {
  if (!rates.length) return { n: 0, avg: 0, median: 0, min: 0, max: 0 };
  return { n: rates.length, avg: avg(rates), median: median(rates), min: Math.min(...rates), max: Math.max(...rates) };
}

function buildDecimalRateBuckets(rates) {
  const map = new Map();
  rates.forEach((rate) => {
    const bucket = Math.floor(rate * 10) / 10;
    map.set(bucket, (map.get(bucket) || 0) + 1);
  });
  const rows = [...map.entries()].sort((a, b) => a[0] - b[0]);
  const max = Math.max(1, ...rows.map(([, count]) => count));
  return rows.map(([rate, count]) => ({ label: rate.toFixed(1), count, width: Math.max(8, count / max * 100) }));
}

function analyzeBidOpportunity(bid, awards, floorRate) {
  const recent = awards.filter((item) => isWithinYears(item.opengDt, 3));
  const productHistory = recent.filter((item) => productsMatch(firstValue(item.prdctIdntfcNoNm, item.bidNtceNm), bid.item || bid.name));
  const orgHistory = productHistory.filter((item) => organizationsMatch(firstValue(item.ntceInsttNm, item.dminsttNm), bid.org));
  const orgRates = orgHistory.map(awardRate).filter(Number.isFinite);
  const productRates = productHistory.map(awardRate).filter(Number.isFinite);
  const displayRates = orgRates.length >= 5 ? orgRates : productRates;
  const stat = rateStatistics(displayRates);
  let confidenceLabel = "표본 부족";
  let confidenceTone = "amber";
  let scopeMessage = "기관 표본이 5건 미만이라 품목 전체 분포를 기준으로 계산합니다.";
  let showProductDistribution = true;
  if (orgRates.length >= 10) {
    confidenceLabel = "신뢰도 높음";
    confidenceTone = "green";
    scopeMessage = "최근 3년 기관별 유사 품목 분포를 기준으로 계산합니다.";
    showProductDistribution = false;
  } else if (orgRates.length >= 5) {
    confidenceLabel = "기관·품목 병행";
    scopeMessage = "기관 표본과 기관 무관 품목 전체 분포를 함께 표시합니다.";
  } else if (orgRates.length === 0) {
    confidenceLabel = "이 기관 첫 진입";
    confidenceTone = "blue";
    scopeMessage = "이 기관의 유사 품목 낙찰 이력이 없어 품목 전체 분포로 대체합니다.";
  }

  const validFloor = Number.isFinite(floorRate) && floorRate > 0 && floorRate < 100;
  const recommendations = validFloor ? {
    aggressive: Math.max(floorRate + 0.005, stat.n ? stat.min : floorRate + 0.005),
    standard: Math.max(floorRate + 0.02, stat.n ? stat.median : floorRate + 0.02),
    safe: Math.max(floorRate + 0.05, stat.n ? stat.avg : floorRate + 0.05),
  } : null;

  const competitorMap = new Map();
  orgHistory.forEach((item) => {
    const name = firstValue(item.sucsfbidCorpNm, item.bidwinnrNm, item.cntrctrNm) || "업체 미상";
    const rate = awardRate(item);
    if (!Number.isFinite(rate)) return;
    const current = competitorMap.get(name) || { name, rates: [], count: 0 };
    current.count += 1;
    current.rates.push(rate);
    competitorMap.set(name, current);
  });
  const competitors = [...competitorMap.values()]
    .map((item) => ({ ...item, avgRate: avg(item.rates) }))
    .sort((a, b) => b.count - a.count || a.avgRate - b.avgRate)
    .slice(0, 8);
  const collision = recommendations && competitors.find((item) => item.avgRate >= recommendations.aggressive && item.avgRate <= recommendations.safe);
  const below = collision ? Math.max(floorRate + 0.005, collision.avgRate - 0.005) : 0;
  const comment = collision
    ? `경쟁사 ${collision.name}가 ${collision.avgRate.toFixed(3)}%에 몰리므로 그 아래 ${below.toFixed(3)}% 부근을 검토하세요.`
    : "";
  return { orgRates, productRates, displayRates, competitors, recommendations, comment, confidenceLabel, confidenceTone, scopeMessage, showProductDistribution };
}

function analyzeStoredBid(bid, awards) {
  const awarded = awards.find((row) => String(row.bidNtceNo || "") === String(bid.bidNo || "") && bid.bidNo);
  const basePrice = num(awarded?.presmptPrce || awarded?.plnprc || bid.basePrice);
  if (!basePrice) return null;
  const awardedAmt = num(awarded?.sucsfbidAmt || awarded?.cntrctAmt);
  const awardedRate = awardedAmt ? awardedAmt / basePrice * 100 : null;
  const myRate = num(bid.myPrice) / basePrice * 100;
  if (!Number.isFinite(awardedRate)) return null;
  return { awardedRate, myRate, gap: myRate - awardedRate };
}

function maxLagFor(org, budgets = []) {
  let best = -Infinity;
  for (const row of budgets) {
    if (row.remaining >= GRADE_MIN_REMAINING && orgsRoughlyMatch(row.org, org) && row.lagIndex > best) {
      best = row.lagIndex;
    }
  }
  return best === -Infinity ? null : best;
}

function topCompetitors(rows) {
  const map = new Map();
  rows.forEach((item) => {
    const name = firstValue(item.sucsfbidCorpNm, item.cntrctrNm, item.bidwinnrNm) || "업체 미상";
    const amount = num(item.sucsfbidAmt || item.cntrctAmt);
    const price = num(item.presmptPrce || item.plnprc);
    const rate = price ? (amount / price) * 100 : num(item.sucsfbidRate);
    const current = map.get(name) || { name, count: 0, amount: 0, rates: [], orgs: {} };
    current.count += 1;
    current.amount += amount;
    if (rate) current.rates.push(rate);
    const org = firstValue(item.ntceInsttNm, item.dminsttNm, item.cntrctInsttNm) || "기관 미상";
    current.orgs[org] = (current.orgs[org] || 0) + 1;
    map.set(name, current);
  });
  return [...map.values()]
    .map((item) => ({
      ...item,
      avgRate: item.rates.length ? avg(item.rates) : 0,
      mainOrg: Object.entries(item.orgs).sort((a, b) => b[1] - a[1])[0]?.[0],
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);
}

function aggregateBuyers(rows) {
  const map = new Map();
  rows.forEach((item) => {
    const org = contractOrgName(item) || "기관 미상";
    const corp = contractCorpName(item) || "업체 미상";
    const current = map.get(org) || { org, amount: 0, count: 0, corps: {}, products: new Set() };
    current.amount += num(item.cntrctAmt || item.sucsfbidAmt);
    current.count += 1;
    current.corps[corp] = (current.corps[corp] || 0) + 1;
    const product = item.prdctIdntfcNoNm || item.prdctClsfcNoNm || item.cntrctNm || item.bidNtceNm;
    if (product) current.products.add(String(product));
    map.set(org, current);
  });
  return [...map.values()]
    .map((item) => {
      const total = Object.values(item.corps).reduce((sum, value) => sum + value, 0) || 1;
      const hhi = Object.values(item.corps).reduce((sum, value) => sum + (value / total) ** 2, 0);
      const topCorp = Object.entries(item.corps).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";
      return {
        ...item,
        topCorp,
        hhi,
        products: [...item.products],
        recommendation: hhi >= 0.72 && item.count >= 3 ? "텃세 주의" : hhi <= 0.45 && item.amount > 0 ? "진입 추천" : "관찰 필요",
      };
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 15);
}

function normalizePrices(rows) {
  return rows.map((item) => ({
    product: item.prdctIdntfcNoNm || item.prdctClsfcNoNm || item.prdctClsfcNoNm || item.krnPrdctNm || "",
    unitPrice: num(item.unitPrice || item.price || item.prce),
  })).filter((item) => item.product);
}

function scoreOpportunities({ buyers, plans, specs, prices, budgets }) {
  const maxBudget = Math.max(1, ...buyers.map((row) => row.amount));
  const planOrgs = new Set(plans.map((row) => row.org));
  const specOrgs = new Set(specs.map((row) => row.org));
  return buyers.map((buyer) => {
    const priceCount = countPriceMatches(buyer.products, prices);
    const lagIndex = maxLagFor(buyer.org, budgets);
    // v5 공식 (v6 명세 9장): 예산 25 + 지연지수 25 + 독점도 20 + 발주계획 20 + 사전규격 10
    const budgetScore = (buyer.amount / maxBudget) * 25;
    const lagScore = lagIndex === null ? 0 : (Math.max(0, Math.min(50, lagIndex)) / 50) * 25;
    const compScore = (1 - buyer.hhi) * 20;
    const planScore = planOrgs.has(buyer.org) ? 20 : 0;
    const specScore = specOrgs.has(buyer.org) ? 10 : 0;
    return {
      org: buyer.org,
      // 전국 단위 공공기관을 지역보다 먼저 검사 — "인천국제공항공사→인천" 오분류 방지 (v6 명세 3-5장)
      region: classifyPublicOrg(buyer.org) || parseRegion(buyer.org) || UNKNOWN_REGION,
      budget: buyer.amount,
      priceMatched: priceCount > 0,
      priceCount,
      lagIndex: lagIndex === null ? null : Math.round(lagIndex),
      score: Math.round(budgetScore + lagScore + compScore + planScore + specScore),
    };
  }).sort((a, b) => b.score - a.score).slice(0, 12);
}

function countPriceMatches(products = [], prices = []) {
  return prices.filter((price) =>
    products.some((product) => isTextMatch(product, price.product))
  ).length;
}

function isTextMatch(a, b) {
  const left = String(a || "").replace(/\s/g, "").toLowerCase();
  const right = String(b || "").replace(/\s/g, "").toLowerCase();
  return left && right && (left.includes(right) || right.includes(left));
}

function emptyBundle() {
  return {
    plan: [],
    spec: [],
    bids: [],
    awards: [],
    contract: [],
    price: [],
    stats: [],
    lofin: [],
  };
}

function dataCacheKey(companyId, keywords) {
  return `${DATA_CACHE_PREFIX}:${companyId}:${keywords.join("|")}`;
}

function readDataCache(key, { allowStale = false } = {}) {
  try {
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    if (!parsed?.cachedAt || !parsed?.bundle) return null;
    const isStale = Date.now() - parsed.cachedAt > DATA_CACHE_TTL_MS;
    if (isStale && !allowStale) return null;
    return { ...parsed, isStale };
  } catch {
    return null;
  }
}

// 정부 API 장애 시 만료 캐시 폴백에 쓰는 endpoint별 데이터 나이 표시
function formatDataAge(fetchedAt) {
  if (!fetchedAt) return "시점 미상";
  const hours = Math.floor((Date.now() - fetchedAt) / 3600000);
  if (hours < 1) return "1시간 이내";
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

function dataCacheKeys() {
  const keys = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key && key.startsWith(DATA_CACHE_FAMILY_PREFIX)) keys.push(key);
  }
  return keys;
}

function dataCacheAge(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "{}")?.cachedAt || 0;
  } catch {
    return 0;
  }
}

// 조달 데이터 캐시는 언제든 다시 받을 수 있다. 사용자가 직접 입력한 키워드·영업 메모가
// 저장 공간을 잃지 않도록 오래된 캐시부터 버린다.
function pruneDataCache(keep = "") {
  const survivors = [];
  for (const key of dataCacheKeys()) {
    if (key === keep) continue;
    if (!key.startsWith(DATA_CACHE_PREFIX)) {
      // 다른 버전의 캐시는 어차피 읽지 않는다
      localStorage.removeItem(key);
      continue;
    }
    survivors.push({ key, cachedAt: dataCacheAge(key) });
  }
  const budget = Math.max(0, MAX_DATA_CACHE_ENTRIES - (keep ? 1 : 0));
  survivors
    .sort((a, b) => b.cachedAt - a.cachedAt)
    .slice(budget)
    .forEach(({ key }) => localStorage.removeItem(key));
}

function dropAllDataCache() {
  try {
    dataCacheKeys().forEach((key) => localStorage.removeItem(key));
  } catch {
    // 정리에 실패해도 호출자가 할 수 있는 일은 없다
  }
}

function writeDataCache(key, value) {
  try {
    pruneDataCache(key);
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Cache writes are best-effort. The live data is already on screen.
    // 실패했다면 용량이 부족하다는 뜻이므로, 사용자 입력이 쓸 자리를 남겨두고 물러난다.
    dropAllDataCache();
  }
}

// 키워드·영업 메모처럼 사용자가 직접 넣은 값은 다시 만들 수 없다.
// 캐시가 용량을 다 써서 저장이 막히면 캐시를 버리고 다시 시도한다.
function persistUserState(key, value) {
  const payload = JSON.stringify(value);
  try {
    localStorage.setItem(key, payload);
    return true;
  } catch {
    dropAllDataCache();
    try {
      localStorage.setItem(key, payload);
      return true;
    } catch {
      return false;
    }
  }
}

function modeLabel(mode) {
  return {
    live: "실시간",
    cache: "캐시",
    stale: "이전 데이터",
    loading: "로딩",
    error: "오류",
    empty: "대기",
  }[mode] || "대기";
}

function formatLoadError(error) {
  if (error instanceof ApiResponseError) {
    if (error.status === 429) return `조달 API 호출 제한(429) · ${error.detail || "잠시 후 다시 시도하세요"}`;
    if (error.status === 401) return "Worker 인증 실패(401) · VITE_API_ACCESS_TOKEN 설정을 확인하세요";
    if (error.status === 502) return `조달 API 응답 오류(502) · ${error.detail || "공공데이터 응답 형식을 확인하세요"}`;
    return `Worker API 오류(${error.status}) · ${error.detail || error.endpoint}`;
  }

  const message = error instanceof Error ? error.message : "";
  if (message.includes("Failed to fetch")) return "Worker 연결 실패 · Worker dev 서버가 실행 중인지 확인하세요";
  return message || "Worker 연결 실패 · 표시할 실시간 데이터 없음";
}

function normalizeKeywordMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return COMPANIES;

  return Object.fromEntries(
    Object.entries(COMPANIES).map(([id, defaults]) => {
      const stored = value[id];
      // 저장된 목록을 그대로 신뢰한다 — 기본 키워드를 다시 합치면 삭제한 키워드가 되살아난다.
      // 빈 배열도 '전부 삭제한 상태'로 존중하고, 저장된 적이 없을 때만 기본 키워드를 쓴다.
      const keywords = Array.isArray(stored?.keywords)
        ? [...new Set(stored.keywords.filter(Boolean))]
        : defaults.keywords;
      return [id, { ...defaults, ...stored, keywords }];
    })
  );
}

function pipelineKeywordCompanies(keywordMap) {
  return Object.fromEntries(
    Object.entries(keywordMap).map(([companyId, company]) => [
      companyId,
      Array.isArray(company?.keywords) ? [...new Set(company.keywords.filter(Boolean))] : [],
    ])
  );
}

function mergeRemoteKeywordCompanies(current, companies) {
  const normalized = normalizeKeywordMap(current);
  return Object.fromEntries(
    Object.entries(normalized).map(([companyId, company]) => [
      companyId,
      {
        ...company,
        keywords: Array.isArray(companies?.[companyId])
          ? [...new Set(companies[companyId].map((keyword) => String(keyword || "").trim()).filter(Boolean))]
          : company.keywords,
      },
    ])
  );
}

async function syncPipelineKeywords(keywordMap, setStatus) {
  setStatus("저장 중…");
  try {
    const saved = await savePipelineKeywordConfig(pipelineKeywordCompanies(keywordMap));
    setStatus(`공유 저장됨${saved.updatedAt ? ` · ${formatDateTime(saved.updatedAt)}` : ""}`);
  } catch (error) {
    setStatus(`공유 저장 실패 · 이 브라우저에만 저장됨 · ${formatLoadError(error)}`);
  }
}

function dedupeRows(endpoint, rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = rowIdentity(endpoint, row);
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function rowIdentity(endpoint, row) {
  const candidates = {
    bids: [row.bidNtceNo, row.bidNtceOrd, row.bidNtceNm, row.ntceInsttNm, row.opengDt],
    awards: [row.bidNtceNo, row.bidNtceOrd, row.sucsfbidCorpNm, row.sucsfbidAmt, row.opengDt],
    contract: [row.cntrctNo, row.cntrctNm, row.cntrctDt, row.cntrctrNm, row.cntrctAmt],
    plan: [row.orderPlanNo, row.bizNm, row.prdctIdntfcNoNm, row.orderDt, row.dminsttNm],
    spec: [row.prdctClsfcNo, row.prdctIdntfcNoNm, row.opninRcptDt, row.ntceInsttNm],
    price: [row.prdctClsfcNo, row.prdctIdntfcNoNm, row.krnPrdctNm, row.unitPrice, row.region],
    stats: [row.prdctIdntfcNoNm, row.prdctClsfcNm, row.srchBssYm, row.cntrctAmt],
    lofin: [row.lofinOrgNm, row.lofinBizNm, row.lofinYear, row.lofinBudgetAmt],
  }[endpoint] || Object.values(row);

  return candidates.filter(Boolean).join("|");
}

function useStoredState(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : initialValue;
    } catch {
      return initialValue;
    }
  });
  useEffect(() => {
    persistUserState(key, value);
  }, [key, value]);
  return [value, setValue];
}

const EMPTY_NOTE = { status: "none", memo: "", lastContact: "" };
// 타자 한 글자마다 서버를 부르지 않는다. 입력이 멈추면 그때 한 번에 보낸다.
const NOTE_SYNC_DEBOUNCE_MS = 1000;

// 영업 메모는 접속한 모든 사람이 같이 본다.
// 화면 표시는 로컬 상태로 즉시 반영하고(끊겨도 입력은 남는다), 서버에는 바뀐 항목만 보낸다.
function useSharedSalesNotes() {
  const [notes, setNotes] = useStoredState("g2b-sales-notes", {});
  const [syncStatus, setSyncStatus] = useState("영업 메모 불러오는 중…");
  const pendingRef = useRef({}); // 아직 서버에 못 보낸 변경분
  const timerRef = useRef(null);
  const notesRef = useRef(notes);
  notesRef.current = notes;

  const flush = useCallback(async () => {
    const payload = pendingRef.current;
    pendingRef.current = {};
    if (!Object.keys(payload).length) return;
    try {
      const saved = await saveSalesNotes(payload);
      setSyncStatus(`공유 저장됨${saved.updatedAt ? ` · ${formatDateTime(saved.updatedAt)}` : ""}`);
    } catch (error) {
      // 실패한 변경분은 다시 줄 세운다. 로컬에는 이미 남아 있으니 입력이 사라지지는 않는다.
      pendingRef.current = { ...payload, ...pendingRef.current };
      setSyncStatus(`공유 저장 실패 · 이 브라우저에만 저장됨 · ${formatLoadError(error)}`);
    }
  }, []);

  // 접속할 때마다 서버의 최신 상태를 받아온다
  useEffect(() => {
    let active = true;
    fetchSalesNotes()
      .then((remote) => {
        if (!active) return;
        if (!remote.configured) {
          setSyncStatus("서버 미연결 · 이 브라우저에만 저장됩니다");
          return;
        }
        // 서버에 없는 로컬 메모는 아직 공유된 적 없는 것이다 — 살려두고 올려보낸다.
        // (이전 버전에서 이 브라우저에만 저장돼 있던 메모가 여기서 팀에 합류한다)
        const unsent = Object.entries(notesRef.current).filter(
          ([key, note]) => !remote.notes?.[key] && (note.memo || (note.status && note.status !== "none"))
        );
        setNotes((current) => ({ ...current, ...(remote.notes || {}) }));
        if (unsent.length) {
          pendingRef.current = { ...Object.fromEntries(unsent), ...pendingRef.current };
          flush();
        }
        setSyncStatus(`공유 중${remote.updatedAt ? ` · 최근 수정 ${formatDateTime(remote.updatedAt)}` : ""}`);
      })
      .catch((error) => {
        if (active) setSyncStatus(`서버 연결 실패 · 이 브라우저에만 저장됨 · ${formatLoadError(error)}`);
      });
    return () => {
      active = false;
    };
  }, [flush]);

  // 탭을 닫거나 숨길 때 아직 못 보낸 입력을 흘려보낸다
  useEffect(() => {
    const handle = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", handle);
    return () => {
      document.removeEventListener("visibilitychange", handle);
      flush();
    };
  }, [flush]);

  const saveNote = useCallback((key, patch, companyId) => {
    setNotes((current) => {
      const next = {
        ...(current[key] || EMPTY_NOTE),
        ...patch,
        company: companyId,
        lastContact: new Date().toISOString().slice(0, 10),
      };
      pendingRef.current = { ...pendingRef.current, [key]: next };
      return { ...current, [key]: next };
    });
    setSyncStatus("저장 중…");
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, NOTE_SYNC_DEBOUNCE_MS);
  }, [flush, setNotes]);

  return { notes, saveNote, syncStatus };
}

function parseRegion(text) {
  const input = String(text || "");
  if (!input) return "";

  for (const item of REGION_PATTERNS) {
    const fullPattern = item.patterns.find((pattern) => pattern.length > 2 && input.includes(pattern));
    if (fullPattern) return item.region;
  }

  const localRegion = parseRegionFromLocalName(input);
  if (localRegion) return localRegion;

  const prefix = input.replace(/^\s*\[[^\]]+\]\s*/, "").trim();
  return REGION_PATTERNS.find((item) =>
    item.patterns.some((pattern) => pattern.length <= 2 && prefix.startsWith(pattern))
  )?.region || "";
}

function parseRegionFromLocalName(input) {
  const compactInput = input.replace(/\s/g, "");
  return LOCAL_REGION_PATTERNS.find((item) =>
    item.patterns.some((pattern) => compactInput.includes(pattern))
  )?.region || "";
}

function classifyPublicOrg(orgName) {
  const input = String(orgName || "");
  if (!input) return "";
  return PUBLIC_ORG_CATEGORIES.find((item) => item.patterns.some((pattern) => input.includes(pattern)))?.category || "";
}

const PLACEHOLDER_ORG_NAMES = new Set(["각 수요기관", "수요기관 다수", "다수기관", "-"]);

function firstOrgValue(...values) {
  return values.find((value) => {
    const text = String(value ?? "").trim();
    return text && !PLACEHOLDER_ORG_NAMES.has(text);
  }) || "";
}

function contractOrgName(item) {
  const dminsttFields = firstBracketFields(item.dminsttList);
  return firstOrgValue(
    item.dminsttNm,
    item.ntceInsttNm,
    dminsttFields[2],
    dminsttFields[1],
    item.cntrctInsttNm,
    item.orderInsttNm,
    item.rlDminsttNm
  );
}

function contractCorpName(item) {
  const corpFields = firstBracketFields(item.corpList);
  return firstValue(
    item.cntrctrNm,
    item.sucsfbidCorpNm,
    corpFields[3],
    corpFields[2],
    item.crdtrNm,
    item.bidwinnrNm
  );
}

function firstBracketFields(value) {
  const text = String(value || "");
  const match = text.match(/\[([^\]]+)\]/);
  return (match?.[1] || "").split("^").map((field) => field.trim());
}

function parseBracketProductName(value) {
  const text = String(value ?? "").trim();
  if (!/^\[.*\]$/.test(text)) return text;
  const fields = firstBracketFields(text);
  return fields[fields.length - 1] || text;
}

function parseBracketList(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const matches = [...text.matchAll(/\[([^\]]*)\]/g)];
  if (matches.length === 0) return text;
  const names = matches
    .map((match) => {
      const fields = match[1].split("^").map((field) => field.trim());
      return fields[fields.length - 1] || "";
    })
    .filter(Boolean);
  return names.length ? names.join(", ") : text;
}

function firstValue(...values) {
  return values.find((value) => String(value ?? "").trim()) || "";
}

function num(value) {
  const parsed = Number(String(value || 0).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function avg(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function dday(value) {
  const date = parseDate(value);
  if (!date) return 999;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((date - today) / 86400000);
}

function parseDate(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  return new Date(`${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}T00:00:00`);
}

function formatDate(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 8) return "";
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function formatDday(value) {
  if (value === 999) return "-";
  if (value === 0) return "D-day";
  return value > 0 ? `D-${value}` : `D+${Math.abs(value)}`;
}

function ddayTone(value) {
  if (value <= 3) return "red";
  if (value <= 7) return "amber";
  return "blue";
}

function formatMoney(value) {
  const manwon = Math.round(num(value) / 10000);
  if (manwon >= 10000) return `${(manwon / 10000).toFixed(1)}억원`;
  return `${manwon.toLocaleString("ko-KR")}만원`;
}

function formatWon(value) {
  return `${Math.round(num(value)).toLocaleString("ko-KR")}원`;
}

const styles = {
  page: { minHeight: "100vh", background: COLORS.bg, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: "#0F172A" },
  shell: { maxWidth: 1160, margin: "0 auto", padding: "22px 16px 36px" },
  header: { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap" },
  h1: { fontSize: 24, margin: 0, letterSpacing: 0 },
  sub: { margin: "5px 0 0", color: COLORS.gray, fontSize: 13 },
  headerActions: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  segment: { display: "flex", background: "#E2E8F0", padding: 4, borderRadius: 8 },
  segmentButton: { border: 0, background: "transparent", padding: "8px 12px", borderRadius: 6, cursor: "pointer", color: COLORS.slate },
  segmentActive: { border: 0, background: "#fff", padding: "8px 12px", borderRadius: 6, cursor: "pointer", color: COLORS.blue, fontWeight: 700 },
  primaryButton: { border: 0, background: COLORS.blue, color: "#fff", borderRadius: 8, padding: "9px 14px", fontWeight: 700, cursor: "pointer" },
  secondaryButton: { border: `1px solid ${COLORS.border}`, background: "#fff", borderRadius: 8, padding: "8px 12px", cursor: "pointer" },
  analysisButton: { border: 0, background: COLORS.slate, color: "#fff", borderRadius: 7, padding: "7px 10px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" },
  statusBand: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", background: "#fff", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontSize: 13 },
  statusMeta: { marginLeft: "auto", color: COLORS.gray },
  keywordPanel: { display: "flex", justifyContent: "space-between", gap: 14, background: "#fff", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 14, marginBottom: 14, flexWrap: "wrap" },
  keywordList: { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 },
  keywordChip: { border: 0, borderRadius: 999, background: "#EFF6FF", color: "#1D4ED8", padding: "5px 9px", cursor: "pointer" },
  keywordInputWrap: { display: "flex", gap: 8, alignItems: "center" },
  input: { border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "9px 10px", minWidth: 180 },
  kpis: { display: "grid", gridTemplateColumns: "repeat(4, minmax(150px, 1fr))", gap: 10, marginBottom: 14 },
  kpi: { background: "#fff", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 14 },
  kpiLabel: { fontSize: 12, color: COLORS.gray },
  kpiValue: { fontSize: 24, fontWeight: 800, marginTop: 4 },
  kpiSub: { fontSize: 12, color: COLORS.gray, marginTop: 2 },
  tabs: { display: "flex", gap: 4, flexWrap: "wrap", background: "#fff", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 4, marginBottom: 14 },
  tab: { border: 0, background: "transparent", color: COLORS.slate, padding: "8px 10px", borderRadius: 6, cursor: "pointer", fontSize: 13 },
  activeTab: { border: 0, background: COLORS.blue, color: "#fff", padding: "8px 10px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 700 },
  panel: { background: "#fff", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 18 },
  loadingState: { display: "grid", gap: 5, background: "#EFF6FF", color: "#1E3A8A", border: "1px solid #BFDBFE", borderRadius: 8, padding: 12, marginBottom: 14, fontSize: 13 },
  errorState: { display: "grid", gap: 5, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 8, padding: 12, marginBottom: 14, fontSize: 13 },
  staleState: { display: "grid", gap: 5, background: "#FFFBEB", color: "#78350F", border: "1px solid #FDE68A", borderRadius: 8, padding: 12, marginBottom: 14, fontSize: 13 },
  h2: { fontSize: 16, margin: "0 0 14px", letterSpacing: 0 },
  twoCol: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 },
  cardGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 10, marginBottom: 16 },
  cardStack: { display: "grid", gap: 10 },
  card: { border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 13, background: "#fff" },
  activeCard: { border: `2px solid ${COLORS.blue}`, borderRadius: 8, padding: 12, background: "#EFF6FF" },
  cardTitle: { fontWeight: 800, fontSize: 14, marginBottom: 5 },
  cardMeta: { color: COLORS.gray, fontSize: 12, marginBottom: 10 },
  cardFooter: { display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", color: COLORS.gray, fontSize: 12, flexWrap: "wrap" },
  summary: { color: COLORS.slate, fontSize: 13, lineHeight: 1.5, margin: "8px 0" },
  memo: { width: "100%", minHeight: 54, marginTop: 10, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 8, resize: "vertical", boxSizing: "border-box" },
  link: { color: COLORS.blue, fontWeight: 700, textDecoration: "none" },
  badge: { display: "inline-flex", alignItems: "center", borderRadius: 999, padding: "3px 8px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" },
  tableWrap: { overflowX: "auto", border: `1px solid ${COLORS.border}`, borderRadius: 8 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 760 },
  th: { textAlign: "left", padding: "10px 12px", background: "#F8FAFC", color: COLORS.gray, borderBottom: `1px solid ${COLORS.border}`, whiteSpace: "nowrap" },
  tr: { borderBottom: `1px solid ${COLORS.border}` },
  td: { padding: "11px 12px", verticalAlign: "middle" },
  empty: { padding: 22, textAlign: "center", color: COLORS.gray },
  placeholder: { border: `1px dashed ${COLORS.border}`, borderRadius: 8, padding: 18, background: "#F8FAFC", color: COLORS.slate, display: "grid", gap: 14 },
  placeholderHeader: { display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" },
  placeholderRows: { display: "grid", gap: 8 },
  placeholderBar: { display: "block", height: 10, borderRadius: 999, background: "#E2E8F0" },
  refreshState: { minHeight: 240, display: "grid", placeItems: "center", color: COLORS.slate, fontSize: 16 },
  chart: { height: 280, marginTop: 8 },
  presetBar: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 },
  presetButton: { border: `1px solid ${COLORS.border}`, background: "#fff", color: COLORS.slate, borderRadius: 999, padding: "7px 12px", cursor: "pointer", fontSize: 12 },
  presetActive: { border: `1px solid ${COLORS.blue}`, background: "#EFF6FF", color: COLORS.blue, borderRadius: 999, padding: "7px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700 },
  select: { border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "7px 10px", background: "#fff", fontSize: 12 },
  toggleLabel: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: COLORS.slate, cursor: "pointer" },
  cellSub: { color: COLORS.gray, fontSize: 11, marginTop: 2 },
  noteButton: { border: 0, background: "transparent", padding: 0, cursor: "pointer" },
  notePanel: { display: "flex", gap: 10, alignItems: "flex-start", background: "#F8FAFC", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 10, flexWrap: "wrap" },
  myBidForm: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 },
  ourMarker: { color: COLORS.blue, fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" },
  histogram: { display: "grid", gap: 7 },
  histRow: { display: "grid", gridTemplateColumns: "48px 1fr 24px auto", gap: 8, alignItems: "center", fontSize: 12 },
  histBarWrap: { height: 8, background: "#E2E8F0", borderRadius: 999, overflow: "hidden" },
  histBar: { height: "100%", background: COLORS.teal, borderRadius: 999 },
  note: { background: "#FFFBEB", color: "#78350F", border: "1px solid #FDE68A", borderRadius: 8, padding: 12, marginBottom: 14, fontSize: 13 },
  scoreWrap: { display: "flex", alignItems: "center", gap: 8, width: 120 },
  scoreBar: { height: 8, borderRadius: 999 },
  drawerBackdrop: { position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.42)", zIndex: 1000, display: "flex", justifyContent: "flex-end" },
  drawer: { width: "min(680px, 94vw)", height: "100vh", overflowY: "auto", background: "#fff", boxShadow: "-12px 0 36px rgba(15, 23, 42, 0.18)", padding: 22, boxSizing: "border-box" },
  drawerHeader: { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", paddingBottom: 16, borderBottom: `1px solid ${COLORS.border}` },
  drawerEyebrow: { color: COLORS.blue, fontSize: 12, fontWeight: 800, marginBottom: 5 },
  drawerTitle: { fontSize: 20, margin: "0 0 7px", lineHeight: 1.35 },
  drawerClose: { border: 0, background: "#F1F5F9", color: COLORS.slate, borderRadius: 999, width: 34, height: 34, fontSize: 24, cursor: "pointer", flex: "0 0 auto" },
  drawerSection: { padding: "18px 0", borderBottom: `1px solid ${COLORS.border}` },
  drawerSectionTitle: { fontSize: 15, margin: "0 0 10px" },
  sectionHeadingRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10, flexWrap: "wrap" },
  floorLabel: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 },
  floorInputWrap: { display: "flex", alignItems: "center", gap: 6 },
  rateBlock: { background: "#F8FAFC", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 12, marginTop: 10 },
  decimalHistogram: { display: "grid", gap: 6, margin: "10px 0" },
  decimalHistRow: { display: "grid", gridTemplateColumns: "52px 1fr 24px", gap: 8, alignItems: "center", fontSize: 12 },
  statGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, fontSize: 12, color: COLORS.slate },
  compactCompetitor: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 12, flexWrap: "wrap" },
  recommendationGrid: { display: "grid", gap: 8 },
  recommendationRow: { display: "grid", gridTemplateColumns: "45px 80px minmax(130px, 1fr) auto", gap: 8, alignItems: "center", background: "#F8FAFC", borderRadius: 8, padding: "10px 12px", fontSize: 13 },
  autoComment: { marginTop: 10, background: "#EFF6FF", color: "#1E3A8A", border: "1px solid #BFDBFE", borderRadius: 8, padding: 11, fontSize: 13, lineHeight: 1.5 },
  bidRecordForm: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", background: "#F8FAFC", borderRadius: 8, padding: 10, marginBottom: 10 },
  warningList: { display: "grid", gap: 7, background: "#FFF7ED", color: "#9A3412", border: "1px solid #FED7AA", borderRadius: 8, padding: 12, marginTop: 18, fontSize: 12, lineHeight: 1.5 },
};

createRoot(document.getElementById("root")).render(<App />);
