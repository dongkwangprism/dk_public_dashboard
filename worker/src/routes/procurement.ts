import { DATA_GO_KR_ENDPOINTS } from "../config/apiEndpoints";
import { fetchDataGoKrJson } from "../services/dataGoKrClient";
import type { Env } from "../types/api";

const DEFAULT_ROWS = 100;
const PLAN_LOOKBACK_DAYS = 90;
const SPEC_LOOKBACK_DAYS = 14;
// getScsbidListSttusThngPPSSrch rejects (error 07) any inqryBgnDt~inqryEndDt span over ~30 days
const AWARDS_LOOKBACK_DAYS = 30;
const CONTRACT_LOOKBACK_DAYS = 30;
const STATS_LOOKBACK_DAYS = 30;
const PRICE_LOOKBACK_DAYS = 30;
const PLAN_LOOKAHEAD_MONTHS = 3;

type JsonRecord = Record<string, unknown>;

export async function getOrderPlans(env: Env, searchParams = new URLSearchParams()) {
  const apiKey = getApiKey(env);
  const keyword = searchParams.get("keyword") || searchParams.get("bizNm") || "";
  const rows = searchParams.get("rows") || searchParams.get("numOfRows") || String(DEFAULT_ROWS);
  const pageNo = searchParams.get("pageNo") || "1";
  const from = searchParams.get("from") || dateBefore(PLAN_LOOKBACK_DAYS);
  const to = searchParams.get("to") || today();

  const payload = await fetchDataGoKrJson(
    `${DATA_GO_KR_ENDPOINTS.orderPlan}/getOrderPlanSttusListThngPPSSrch`,
    {
      orderBgnYm: searchParams.get("orderBgnYm") || currentYearMonth(),
      orderEndYm: searchParams.get("orderEndYm") || yearMonthAfter(PLAN_LOOKAHEAD_MONTHS),
      inqryBgnDt: toDateTime(from, "0000", PLAN_LOOKBACK_DAYS),
      inqryEndDt: toDateTime(to, "2359", 0),
      bizNm: keyword,
      pageNo,
      numOfRows: rows,
    },
    apiKey
  );

  return withMappedItems(payload, "plan", keyword, mapPlanItem, "getOrderPlanSttusListThngPPSSrch");
}

export async function getSpecs(env: Env, searchParams = new URLSearchParams()) {
  const apiKey = getApiKey(env);
  const keyword = searchParams.get("keyword") || searchParams.get("prdctClsfcNoNm") || "";
  const rows = searchParams.get("rows") || searchParams.get("numOfRows") || String(DEFAULT_ROWS);
  const pageNo = searchParams.get("pageNo") || "1";
  const from = searchParams.get("from") || dateBefore(SPEC_LOOKBACK_DAYS);
  const to = searchParams.get("to") || today();

  const payload = await fetchDataGoKrJson(
    `${DATA_GO_KR_ENDPOINTS.spec}/getPublicPrcureThngInfoThngPPSSrch`,
    {
      inqryDiv: searchParams.get("inqryDiv") || "1",
      inqryBgnDt: toDateTime(from, "0000", SPEC_LOOKBACK_DAYS),
      inqryEndDt: toDateTime(to, "2359", 0),
      prdctClsfcNoNm: keyword,
      pageNo,
      numOfRows: rows,
    },
    apiKey
  );

  return withMappedItems(payload, "spec", keyword, mapSpecItem, "getPublicPrcureThngInfoThngPPSSrch");
}

export async function getAwards(env: Env, searchParams = new URLSearchParams()) {
  const apiKey = getApiKey(env);
  const keyword = searchParams.get("keyword") || searchParams.get("bidNtceNm") || "";
  const rows = searchParams.get("rows") || searchParams.get("numOfRows") || String(DEFAULT_ROWS);
  const pageNo = searchParams.get("pageNo") || "1";
  const from = searchParams.get("from") || dateBefore(AWARDS_LOOKBACK_DAYS);
  const to = searchParams.get("to") || today();

  const payload = await fetchDataGoKrJson(
    `${DATA_GO_KR_ENDPOINTS.awards}/getScsbidListSttusThngPPSSrch`,
    {
      inqryDiv: searchParams.get("inqryDiv") || "2",
      inqryBgnDt: toDateTime(from, "0000", AWARDS_LOOKBACK_DAYS),
      inqryEndDt: toDateTime(to, "2359", 0),
      bidNtceNm: keyword,
      pageNo,
      numOfRows: rows,
    },
    apiKey
  );

  return withMappedItems(payload, "awards", keyword, mapAwardItem, "getScsbidListSttusThngPPSSrch");
}

export async function getContracts(env: Env, searchParams = new URLSearchParams()) {
  const apiKey = getApiKey(env);
  const keyword = searchParams.get("keyword") || searchParams.get("prdctClsfcNoNm") || "";
  const rows = searchParams.get("rows") || searchParams.get("numOfRows") || String(DEFAULT_ROWS);
  const pageNo = searchParams.get("pageNo") || "1";
  const from = searchParams.get("from") || dateBefore(CONTRACT_LOOKBACK_DAYS);
  const to = searchParams.get("to") || today();

  const payload = await fetchDataGoKrJson(
    `${DATA_GO_KR_ENDPOINTS.contracts}/getCntrctInfoListThngPPSSrch`,
    {
      inqryDiv: searchParams.get("inqryDiv") || "1",
      inqryBgnDate: toDate(from, CONTRACT_LOOKBACK_DAYS),
      inqryEndDate: toDate(to, 0),
      insttDivCd: searchParams.get("insttDivCd") || undefined,
      insttNm: searchParams.get("insttNm") || undefined,
      prdctClsfcNoNm: keyword,
      pageNo,
      numOfRows: rows,
    },
    apiKey
  );

  return withMappedItems(payload, "contract", keyword, mapContractItem, "getCntrctInfoListThngPPSSrch");
}

export async function getStats(env: Env, searchParams = new URLSearchParams()) {
  const apiKey = getApiKey(env);
  const keyword = searchParams.get("keyword") || searchParams.get("prdctClsfcNm") || "";
  const rows = searchParams.get("rows") || searchParams.get("numOfRows") || String(DEFAULT_ROWS);
  const pageNo = searchParams.get("pageNo") || "1";
  const from = searchParams.get("from") || dateBefore(STATS_LOOKBACK_DAYS);
  const to = searchParams.get("to") || today();

  const payload = await fetchDataGoKrJson(
    `${DATA_GO_KR_ENDPOINTS.stats}/getPrdctIdntNoServcAccotArslt`,
    {
      srchBssYmBgn: toYearMonth(from, STATS_LOOKBACK_DAYS),
      srchBssYmEnd: toYearMonth(to, 0),
      prdctClsfcNm: keyword,
      pageNo,
      numOfRows: rows,
    },
    apiKey
  );

  return withMappedItems(payload, "stats", keyword, mapStatsItem, "getPrdctIdntNoServcAccotArslt");
}

export async function getPrices(env: Env, searchParams = new URLSearchParams()) {
  const apiKey = getApiKey(env);
  const rows = searchParams.get("rows") || searchParams.get("numOfRows") || String(DEFAULT_ROWS);
  const pageNo = searchParams.get("pageNo") || "1";
  const from = searchParams.get("from") || dateBefore(PRICE_LOOKBACK_DAYS);
  const to = searchParams.get("to") || today();

  const payload = await fetchDataGoKrJson(
    `${DATA_GO_KR_ENDPOINTS.price}/getPriceInfoListFcltyCmmnMtrilTotal`,
    {
      inqryDiv: searchParams.get("inqryDiv") || "1",
      inqryBgnDate: toDate(from, PRICE_LOOKBACK_DAYS),
      inqryEndDate: toDate(to, 0),
      prdctClsfcNoNm: searchParams.get("prdctClsfcNoNm") || searchParams.get("keyword") || undefined,
      krnPrdctNm: searchParams.get("krnPrdctNm") || searchParams.get("keyword") || undefined,
      pageNo,
      numOfRows: rows,
    },
    apiKey
  );

  const keyword = searchParams.get("keyword") || "";

  return withMappedItems(
    payload,
    "price",
    keyword,
    (item) => mapPriceItem(item, keyword),
    "getPriceInfoListFcltyCmmnMtrilTotal"
  );
}

function getApiKey(env: Env) {
  const apiKey = env.DATA_GO_KR_API_KEY || env.API_KEY;

  if (!apiKey) {
    throw new Error("DATA_GO_KR_API_KEY is not configured");
  }

  return apiKey;
}

function withMappedItems(
  payload: unknown,
  endpoint: "plan" | "spec" | "awards" | "contract" | "stats" | "price",
  keyword: string,
  mapper: (item: JsonRecord) => JsonRecord,
  operation: string
) {
  const response = ((payload as { response?: unknown }).response ?? payload) as JsonRecord;
  const body = ((response as { body?: unknown }).body ?? {}) as JsonRecord;
  const items = normalizeItems((body as { items?: unknown }).items);
  const mappedItems = items.map(mapper).filter(isRecord);

  return {
    ok: true,
    mode: "live",
    endpoint,
    operation,
    keyword,
    response: {
      ...response,
      body: {
        ...body,
        items: mappedItems,
      },
    },
  };
}

function normalizeItems(items: unknown): JsonRecord[] {
  if (Array.isArray(items)) return items.filter(isRecord);
  if (isRecord(items) && Array.isArray(items.item)) return items.item.filter(isRecord);
  if (isRecord(items) && isRecord(items.item)) return [items.item];
  if (isRecord(items)) return [items];
  return [];
}

function mapPlanItem(item: JsonRecord) {
  const orderDate = orderDateFromPlan(item);
  const orderDatePrecision = orderDateFromPlanPrecision(item);

  return {
    ...item,
    dminsttNm: firstValue(item.orderInsttNm, item.dminsttNm, item.ntceInsttNm),
    ntceInsttNm: firstValue(item.orderInsttNm, item.ntceInsttNm, item.dminsttNm),
    prdctIdntfcNoNm: firstValue(
      item.bizNm,
      parseBracketProductName(item.prdctClsfcNoNm),
      parseBracketProductName(item.dtilPrdctClsfcNoNm),
      item.prdctIdntfcNoNm
    ),
    orderAmt: firstValue(item.sumOrderAmt, item.orderContrctAmt, item.orderThtmContrctAmt, item.orderAmt),
    orderDt: orderDate,
    orderDatePrecision,
  };
}

function mapSpecItem(item: JsonRecord) {
  const product = parseBracketProductName(item.prdctClsfcNoNm) || parseBracketProductName(item.prdctDtlList);
  const summary = firstValue(parseBracketList(item.prdctDtlList), item.prdctStndNm);

  return {
    ...item,
    dminsttNm: firstValue(item.rlDminsttNm, item.dminsttNm, item.ntceInsttNm),
    ntceInsttNm: firstValue(item.orderInsttNm, item.ntceInsttNm, item.dminsttNm),
    prdctIdntfcNoNm: firstValue(product, item.prdctIdntfcNoNm),
    rlsDt: firstValue(item.rgstDt, item.rcptDt, item.rlsDt),
    opninRcptDt: firstValue(item.opninRgstClseDt, item.opninRcptDt),
    prdctStndNm: summary,
  };
}

function mapAwardItem(item: JsonRecord) {
  return {
    ...item,
    sucsfbidCorpNm: firstValue(item.bidwinnrNm, item.sucsfbidCorpNm, item.cntrctrNm),
    ntceInsttNm: firstValue(item.dminsttNm, item.ntceInsttNm),
    prdctIdntfcNoNm: firstValue(item.bidNtceNm, item.prdctIdntfcNoNm),
    opengDt: firstValue(item.rlOpengDt, item.opengDt),
    presmptPrce: firstValue(item.presmptPrce, item.plnprc),
  };
}

function mapContractItem(item: JsonRecord) {
  return {
    ...item,
    dminsttNm: firstValue(parseDminsttName(item.dminsttList), item.dminsttNm, item.ntceInsttNm, item.cntrctInsttNm),
    cntrctrNm: firstValue(parseCorpName(item.corpList), item.cntrctrNm, item.sucsfbidCorpNm, item.crdtrNm),
    cntrctAmt: firstValue(item.thtmCntrctAmt, item.totCntrctAmt, item.cntrctAmt, item.sucsfbidAmt),
    cntrctDt: firstValue(item.cntrctDate, item.cntrctCnclsDate, item.cntrctDt),
    prdctIdntfcNoNm: firstValue(item.prdctClsfcNoNm, item.pubPrcrmntClsfcNm, item.cntrctNm, item.prdctIdntfcNoNm),
    isMasContract: isMasStyleContract(item.dminsttList),
  };
}

function isMasStyleContract(value: unknown) {
  const fields = firstBracketFields(value);
  return PLACEHOLDER_INSTITUTION_NAMES.has((fields[2] || "").trim());
}

function mapStatsItem(item: JsonRecord) {
  return {
    ...item,
    prdctIdntfcNoNm: item.prdctClsfcNm,
    cntrctAmt: item.arsltSumAmt,
    cntrctCnt: item.arsltSumNum,
  };
}

function mapPriceItem(item: JsonRecord, keyword: string) {
  return {
    ...item,
    keyword,
    prdctIdntfcNoNm: item.prdctClsfcNoNm || item.krnPrdctNm,
    unitPrice: item.prce,
    price: item.prce,
    region: item.splyJrsdctRgnNm,
  };
}

const PLACEHOLDER_INSTITUTION_NAMES = new Set(["각 수요기관", "수요기관 다수", "다수기관", "-"]);

function parseDminsttName(value: unknown) {
  const fields = firstBracketFields(value);
  const name = (fields[2] || "").trim();
  return PLACEHOLDER_INSTITUTION_NAMES.has(name) ? "" : name;
}

function parseCorpName(value: unknown) {
  const fields = firstBracketFields(value);
  return fields[3] || "";
}

function firstBracketFields(value: unknown) {
  const text = String(value || "");
  const match = text.match(/\[([^\]]+)\]/);
  return (match?.[1] || "").split("^").map((field) => field.trim());
}

function parseBracketProductName(value: unknown) {
  const text = String(value ?? "").trim();
  if (!/^\[.*\]$/.test(text)) return text;
  const fields = firstBracketFields(text);
  return fields[fields.length - 1] || text;
}

function parseBracketList(value: unknown) {
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

function firstValue(...values: unknown[]) {
  return values.find((value) => String(value ?? "").trim()) || undefined;
}

function orderDateFromPlan(item: JsonRecord) {
  const year = String(item.orderYear || "").replace(/\D/g, "");
  const month = String(item.orderMnth || "").replace(/\D/g, "").padStart(2, "0");

  if (year.length === 4 && month.length === 2) {
    return `${year}${month}01`;
  }

  return item.nticeDt;
}

function orderDateFromPlanPrecision(item: JsonRecord) {
  const year = String(item.orderYear || "").replace(/\D/g, "");
  const month = String(item.orderMnth || "").replace(/\D/g, "").padStart(2, "0");
  return year.length === 4 && month.length === 2 ? "month" : "day";
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toDateTime(value: string, suffix: string, fallbackDays: number) {
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 12) return digits.slice(0, 12);
  if (digits.length >= 8) return `${digits.slice(0, 8)}${suffix}`;
  return `${dateBefore(fallbackDays)}${suffix}`;
}

function toDate(value: string, fallbackDays: number) {
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 8) return digits.slice(0, 8);
  return dateBefore(fallbackDays);
}

function toYearMonth(value: string, fallbackDays: number) {
  return toDate(value, fallbackDays).slice(0, 6);
}

function today() {
  return formatKstDate(new Date());
}

function dateBefore(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return formatKstDate(date);
}

function currentYearMonth() {
  return today().slice(0, 6);
}

function yearMonthAfter(months: number) {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return formatKstDate(date).slice(0, 6);
}

function formatKstDate(date: Date) {
  return formatDate(new Date(date.getTime() + 9 * 60 * 60 * 1000));
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}
