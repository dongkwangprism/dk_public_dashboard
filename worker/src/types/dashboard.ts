export interface CompanySummary {
  rank: number;
  companyName: string;
  contractCount: number;
  totalAmount: number;
  winRate?: number;
  activeRegionCount: number;
  mainRegion: string;
  itemCount: number;
  mainItem: string;
}

export interface RegionSummary {
  region: string;
  estimatedBudget: number;
  contractCount: number;
  totalAmount: number;
  companyCount: number;
  topCompanyName: string;
  topCompanyAmount: number;
  topCompanyShare: number;
  companies: {
    companyName: string;
    contractCount: number;
    totalAmount: number;
    share: number;
  }[];
}

export interface ItemSummary {
  itemName: string;
  contractCount: number;
  totalAmount: number;
  averagePrice: number;
  companyCount: number;
  topCompanies: {
    rank: number;
    companyName: string;
    totalAmount: number;
  }[];
}
