const REGION_PATTERNS = [
  { region: "서울", patterns: ["서울특별시", "서울시", "서울"] },
  { region: "경기", patterns: ["경기도", "경기"] },
  { region: "인천", patterns: ["인천광역시", "인천"] },
  { region: "부산", patterns: ["부산광역시", "부산"] },
  { region: "대구", patterns: ["대구광역시", "대구"] },
  { region: "광주", patterns: ["광주광역시", "광주"] },
  { region: "대전", patterns: ["대전광역시", "대전"] },
  { region: "울산", patterns: ["울산광역시", "울산"] },
  { region: "세종", patterns: ["세종특별자치시", "세종"] },
  { region: "강원", patterns: ["강원특별자치도", "강원도", "강원"] },
  { region: "충북", patterns: ["충청북도", "충북"] },
  { region: "충남", patterns: ["충청남도", "충남"] },
  { region: "전북", patterns: ["전북특별자치도", "전라북도", "전북"] },
  { region: "전남", patterns: ["전라남도", "전남"] },
  { region: "경북", patterns: ["경상북도", "경북"] },
  { region: "경남", patterns: ["경상남도", "경남"] },
  { region: "제주", patterns: ["제주특별자치도", "제주"] },
];

export function parseRegion(input?: string): string {
  if (!input) return "미분류";

  for (const item of REGION_PATTERNS) {
    if (item.patterns.some((pattern) => input.includes(pattern))) {
      return item.region;
    }
  }

  return "미분류";
}
