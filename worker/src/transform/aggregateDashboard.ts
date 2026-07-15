import { ITEM_KEYWORDS } from "../config/items";

const REGIONS = ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"];
const COMPANIES = ["우진부스텍", "그린부스", "클린114", "제일테크", "동광프리즘"];

export function createMockDashboard(now = new Date()) {
  const regionBudget = REGIONS.map((region, index) => ({
    region,
    budget: 240 + index * 37,
    contracts: 8 + (index % 7) * 4,
    opportunity: index % 3 === 0 ? "high" : index % 3 === 1 ? "mid" : "low",
  }));

  const competitorData = COMPANIES.map((name, index) => ({
    name,
    contracts: 14 + index * 9,
    amount: 120 + index * 85,
    regions: REGIONS.filter((_, regionIndex) => (regionIndex + index) % 3 === 0),
    products: ITEM_KEYWORDS.filter((_, itemIndex) => (itemIndex + index) % 2 === 0),
    winRate: 62 + index * 5.5,
  }));

  const categoryData = ITEM_KEYWORDS.map((name, index) => ({
    name,
    total: 18 + index * 6,
    amount: 150 + index * 72,
    topCompetitor: COMPANIES[index % COMPANIES.length],
    avgPrice: 650 + index * 280,
  }));

  const trendData = Array.from({ length: 12 }, (_, index) => ({
    month: `${index + 1}월`,
    contracts: 7 + (index % 5) * 5,
    amount: 70 + index * 18,
  }));

  const opportunities = regionBudget
    .filter((region) => region.opportunity === "high")
    .map((region, index) => ({
      region: region.region,
      budget: region.budget,
      competitorCount: 1 + (index % 3),
      score: 88 - index * 4,
    }));

  const companies = competitorData.map((company, index) => ({
    rank: index + 1,
    companyName: company.name,
    contractCount: company.contracts,
    totalAmount: company.amount,
    winRate: company.winRate,
    activeRegionCount: company.regions.length,
    mainRegion: company.regions[0] ?? "미분류",
    itemCount: company.products.length,
    mainItem: company.products[0] ?? "미분류",
  }));

  const regions = regionBudget.map((region) => ({
    region: region.region,
    estimatedBudget: region.budget,
    contractCount: region.contracts,
    totalAmount: region.budget,
    companyCount: 3,
    topCompanyName: COMPANIES[0],
    topCompanyAmount: Math.round(region.budget * 0.35),
    topCompanyShare: 35,
    companies: COMPANIES.slice(0, 3).map((companyName, index) => ({
      companyName,
      contractCount: 3 + index,
      totalAmount: Math.round(region.budget * (0.35 - index * 0.08)),
      share: 35 - index * 8,
    })),
  }));

  const items = categoryData.map((item) => ({
    itemName: item.name,
    contractCount: item.total,
    totalAmount: item.amount,
    averagePrice: item.avgPrice,
    companyCount: 4,
    topCompanies: COMPANIES.slice(0, 3).map((companyName, index) => ({
      rank: index + 1,
      companyName,
      totalAmount: Math.round(item.amount * (0.4 - index * 0.1)),
    })),
  }));

  const topCompany = companies.slice().sort((a, b) => b.totalAmount - a.totalAmount)[0];

  return {
    ok: true,
    mode: "mock",
    lastUpdated: now.toISOString(),
    keywords: ITEM_KEYWORDS,
    kpis: {
      totalCompanies: companies.length,
      totalContractAmount: companies.reduce((sum, company) => sum + company.totalAmount, 0),
      topCompanyName: topCompany.companyName,
      topCompanyMainRegion: topCompany.mainRegion,
    },
    companies,
    regions,
    items,
    opportunities,
    rawMeta: {
      contractsCount: 0,
      bidsCount: 0,
      masCount: 0,
    },
    dashboardData: {
      regionBudget,
      competitorData,
      categoryData,
      trendData,
      opportunities,
    },
  };
}
