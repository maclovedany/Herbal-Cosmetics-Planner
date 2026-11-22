// 출시 시장, 제품 유형, 기후, 피부 고민의 고정 목록과 브리프 → 계절 조건 변환.

export const MARKETS = {
  KR: '한국',
  JP: '일본',
  CN: '중국',
  US: '미국',
  EU: '유럽',
  SEA: '동남아시아',
  ME: '중동',
  ANZ: '호주·뉴질랜드',
} as const;
export type Market = keyof typeof MARKETS;

export const CLIMATES = {
  hot_humid: '고온다습',
  hot_dry: '고온건조',
  temperate: '온화',
  cold_dry: '저온건조',
} as const;
export type Climate = keyof typeof CLIMATES;

export const CONCERNS = {
  soothing: '진정',
  sebum: '피지·모공',
  hydration: '보습',
  barrier: '장벽 강화',
  brightening: '톤 개선',
  antiaging: '탄력·주름',
  antioxidant: '항산화',
} as const;
export type Concern = keyof typeof CONCERNS;

export const BASES = {
  watery: '수분 제형',
  emulsion: '유화 제형',
  oil: '오일 제형',
  rinse_off: '씻어내는 제형',
} as const;
export type Base = keyof typeof BASES;

export const PRODUCT_TYPES = {
  toner: { label: '토너', base: 'watery' },
  serum: { label: '세럼·에센스', base: 'watery' },
  gel_cream: { label: '젤크림', base: 'watery' },
  sheet_mask: { label: '시트 마스크', base: 'watery' },
  cream: { label: '크림', base: 'emulsion' },
  sunscreen: { label: '선케어', base: 'emulsion' },
  facial_oil: { label: '페이스 오일·밤', base: 'oil' },
  cleanser: { label: '클렌저', base: 'rinse_off' },
  wash_off_mask: { label: '워시오프 마스크', base: 'rinse_off' },
} as const satisfies Record<string, { label: string; base: Base }>;
export type ProductType = keyof typeof PRODUCT_TYPES;

// 시장별 1~12월 기후. H 고온다습, D 고온건조, T 온화, C 저온건조.
// 시장을 대표 도시권 기준으로 단순화한 값이다. 남반구(ANZ)는 계절이 반대다.
const CLIMATE_BY_MONTH: Record<Market, string> = {
  KR: 'CCTTTHHHTTCC',
  JP: 'CCTTTHHHTTCC',
  CN: 'CCTTTHHHTTCC',
  US: 'CCTTTHHHTTTC',
  EU: 'CCTTTDDDTTCC',
  SEA: 'HHHHHHHHHHHH',
  ME: 'TTTTDDDDDTTT',
  ANZ: 'DDTTTCCCTTTD',
};
const CLIMATE_CODE: Record<string, Climate> = {
  H: 'hot_humid',
  D: 'hot_dry',
  T: 'temperate',
  C: 'cold_dry',
};

const CONCERNS_BY_CLIMATE: Record<Climate, Concern[]> = {
  hot_humid: ['soothing', 'sebum', 'antioxidant'],
  hot_dry: ['soothing', 'hydration', 'antioxidant'],
  temperate: ['hydration', 'brightening', 'antioxidant'],
  cold_dry: ['hydration', 'barrier', 'antiaging'],
};

export type Brief = { market: Market; launch_month: number; product_type: ProductType };

export function isMarket(v: unknown): v is Market {
  return typeof v === 'string' && v in MARKETS;
}
export function isProductType(v: unknown): v is ProductType {
  return typeof v === 'string' && v in PRODUCT_TYPES;
}
export function isMonth(v: unknown): v is number {
  return Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 12;
}

export function climateFor(market: Market, month: number): Climate {
  return CLIMATE_CODE[CLIMATE_BY_MONTH[market][month - 1]];
}

export function seasonFor(market: Market, month: number): { climate: Climate; concerns: Concern[] } {
  const climate = climateFor(market, month);
  return { climate, concerns: [...CONCERNS_BY_CLIMATE[climate]] };
}
