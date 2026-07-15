export interface Env {
  API_KEY?: string;
  DATA_GO_KR_API_KEY?: string;
  LOFIN_KEY?: string;
  LOFIN_API_PATH?: string;
  API_ACCESS_TOKEN?: string;
  CACHE_TTL_SECONDS?: string;
  DASHBOARD_CACHE?: KVNamespace;
}

export interface NormalizedContract {
  id: string;
  companyName: string;
  contractAmount: number;
  demandOrgName: string;
  productName: string;
  keyword: string;
  region: string;
  contractDate?: string;
  source: "contracts";
  raw: unknown;
}

export interface NormalizedBid {
  id: string;
  successBidAmount: number;
  participantCount?: number;
  openDate?: string;
  productName?: string;
  keyword: string;
  source: "bids";
  raw: unknown;
}

export interface NormalizedMasItem {
  id: string;
  companyName: string;
  productName: string;
  keyword: string;
  unitPrice?: number;
  companyRegion?: string;
  isExcellentProduct?: boolean;
  isMas?: boolean;
  source: "mas";
  raw: unknown;
}
