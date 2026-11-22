// 원료 필터링, 점수 계산, 순위. 같은 입력이면 항상 같은 결과가 나오는 순수 함수다.
import { PRODUCT_TYPES, type Base, type Climate, type Concern, type Market, type ProductType } from './domain';
import { WEIGHT_KEYS, type Criteria, type RequiredKey, type WeightKey } from './criteria';

export type Source = { id: string; type: string; title: string; note?: string };

export type Traits = {
  name_en: string;
  herbal_name: string;
  actives: string[];
  concerns: Concern[];
  evidence: number; // 1~5
  irritation: number; // 1(낮음)~5(높음)
  climate: Record<Climate, number>; // 1~5
  formulation: Record<Base, number>; // 1~5
  market: Record<Market, number>; // 1~5
};

export type Ingredient = { id: string; name: string; traits: Traits; sources: Source[] };

export type Candidate = {
  ingredient_id: string;
  name: string;
  name_en: string;
  herbal_name: string;
  actives: string[];
  concerns: Concern[];
  rank: number;
  total: number;
  scores: Record<WeightKey, number>;
  sources: Source[];
};

export const MIN_CANDIDATES = 3;
export const TOP_N = 5;

const REQUIRED_CHECKS: Record<RequiredKey, (t: Traits, c: Criteria) => boolean> = {
  concern_match: (t, c) => t.concerns.some((x) => c.season.concerns.includes(x)),
  evidence_strong: (t) => t.evidence >= 4,
  low_irritation: (t) => t.irritation <= 2,
};

const pct = (v: number) => (v / 5) * 100;
const round1 = (v: number) => Math.round(v * 10) / 10;

export function scoreIngredient(
  t: Traits,
  criteria: Criteria,
  brief: { market: Market; product_type: ProductType },
): Record<WeightKey, number> {
  const wanted = criteria.season.concerns;
  const matched = wanted.filter((c) => t.concerns.includes(c)).length;
  return {
    research_evidence: round1(pct(t.evidence)),
    season_fit: round1(pct(t.climate[criteria.season.climate]) * 0.5 + (matched / wanted.length) * 100 * 0.5),
    formulation_fit: round1(pct(t.formulation[PRODUCT_TYPES[brief.product_type].base])),
    market_appeal: round1(pct(t.market[brief.market])),
  };
}

// 필수 조건을 통과한 원료를 총점순으로 정렬해 돌려준다. 동점이면 ID순이다.
export function rankIngredients(
  ingredients: Ingredient[],
  criteria: Criteria,
  brief: { market: Market; product_type: ProductType },
): Candidate[] {
  return ingredients
    .filter((i) => criteria.required.every((k) => REQUIRED_CHECKS[k](i.traits, criteria)))
    .map((i) => {
      const scores = scoreIngredient(i.traits, criteria, brief);
      const total = round1(WEIGHT_KEYS.reduce((s, k) => s + (scores[k] * criteria.weights[k]) / 100, 0));
      return { i, scores, total };
    })
    .sort((a, b) => b.total - a.total || a.i.id.localeCompare(b.i.id))
    .map(({ i, scores, total }, idx) => ({
      ingredient_id: i.id,
      name: i.name,
      name_en: i.traits.name_en,
      herbal_name: i.traits.herbal_name,
      actives: i.traits.actives,
      concerns: i.traits.concerns,
      rank: idx + 1,
      total,
      scores,
      sources: i.sources,
    }));
}
