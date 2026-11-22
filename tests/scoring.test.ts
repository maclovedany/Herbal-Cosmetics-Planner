import { describe, expect, it } from 'vitest';
import { initialCriteria, type Criteria } from '../lib/criteria';
import { MARKETS, PRODUCT_TYPES, type Market, type ProductType } from '../lib/domain';
import { MIN_CANDIDATES, rankIngredients, type Ingredient } from '../lib/scoring';
import { ingredients as seed } from '../supabase/seed/ingredients.mjs';

const ingredients = seed as unknown as Ingredient[];
const brief = { market: 'KR', launch_month: 7, product_type: 'gel_cream' } as const;
const criteria = initialCriteria(brief);

describe('시드 데이터', () => {
  it('ID가 겹치지 않고 모든 원료에 출처가 있다', () => {
    expect(new Set(ingredients.map((i) => i.id)).size).toBe(ingredients.length);
    for (const i of ingredients) expect(i.sources.length).toBeGreaterThanOrEqual(2);
  });
  it('모든 시장·월·제품 유형 조합에서 초기 기준으로 후보가 충분하다', () => {
    for (const market of Object.keys(MARKETS) as Market[]) {
      for (let launch_month = 1; launch_month <= 12; launch_month++) {
        for (const product_type of Object.keys(PRODUCT_TYPES) as ProductType[]) {
          const b = { market, launch_month, product_type };
          const n = rankIngredients(ingredients, initialCriteria(b), b).length;
          expect(n, `${market} ${launch_month}월 ${product_type}`).toBeGreaterThanOrEqual(MIN_CANDIDATES);
        }
      }
    }
  });
});

describe('순위', () => {
  it('같은 입력이면 같은 순위가 나온다', () => {
    const a = rankIngredients(ingredients, criteria, brief);
    const b = rankIngredients([...ingredients].reverse(), criteria, brief);
    expect(a.map((c) => c.ingredient_id)).toEqual(b.map((c) => c.ingredient_id));
    expect(a.map((c) => c.rank)).toEqual(a.map((_, i) => i + 1));
  });
  it('필수 조건을 통과하지 못한 원료는 빠진다', () => {
    const strict: Criteria = { ...criteria, required: ['concern_match', 'evidence_strong', 'low_irritation'] };
    const byId = new Map(ingredients.map((i) => [i.id, i]));
    for (const c of rankIngredients(ingredients, strict, brief)) {
      const t = byId.get(c.ingredient_id)!.traits;
      expect(t.evidence).toBeGreaterThanOrEqual(4);
      expect(t.irritation).toBeLessThanOrEqual(2);
      expect(t.concerns.some((x) => strict.season.concerns.includes(x))).toBe(true);
    }
  });
  it('가중치를 한 기준에 몰면 그 기준 점수순이 된다', () => {
    const only: Criteria = {
      ...criteria,
      weights: { research_evidence: 100, season_fit: 0, formulation_fit: 0, market_appeal: 0 },
    };
    const r = rankIngredients(ingredients, only, brief);
    expect(r[0].total).toBe(r[0].scores.research_evidence);
    for (let i = 1; i < r.length; i++) expect(r[i - 1].total).toBeGreaterThanOrEqual(r[i].total);
  });
  it('여름 젤크림과 겨울 크림은 1위 원료가 다르다', () => {
    const winter = { market: 'KR', launch_month: 1, product_type: 'cream' } as const;
    const s = rankIngredients(ingredients, criteria, brief)[0].ingredient_id;
    const w = rankIngredients(ingredients, initialCriteria(winter), winter)[0].ingredient_id;
    expect(s).not.toBe(w);
  });
});
