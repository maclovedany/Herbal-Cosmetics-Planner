import { describe, expect, it } from 'vitest';
import { diffCriteria, initialCriteria, normalizeWeights, sanitizeProposal, validateCriteria } from '../lib/criteria';
import { climateFor } from '../lib/domain';

const base = initialCriteria({ market: 'KR', launch_month: 7, product_type: 'gel_cream' });

describe('초기 평가 기준', () => {
  it('한국 7월은 고온다습, 1월은 저온건조다', () => {
    expect(base.season.climate).toBe('hot_humid');
    expect(climateFor('KR', 1)).toBe('cold_dry');
  });
  it('남반구는 계절이 반대다', () => {
    expect(climateFor('ANZ', 1)).toBe('hot_dry');
    expect(climateFor('ANZ', 7)).toBe('cold_dry');
  });
  it('연구 근거 25%에서 시작하고 그대로 검증을 통과한다', () => {
    expect(base.weights.research_evidence).toBe(25);
    expect(validateCriteria(base).ok).toBe(true);
  });
});

describe('검증', () => {
  it('가중치 합이 100이 아니면 거절한다', () => {
    const r = validateCriteria({ ...base, weights: { ...base.weights, research_evidence: 40 } });
    expect(r.ok).toBe(false);
  });
  it('알 수 없는 가중치 키를 거절한다', () => {
    expect(validateCriteria({ ...base, weights: { ...base.weights, price: 0 } }).ok).toBe(false);
  });
  it('알 수 없는 필수 조건과 빈 피부 고민을 거절한다', () => {
    expect(validateCriteria({ ...base, required: ['vegan'] }).ok).toBe(false);
    expect(validateCriteria({ ...base, season: { ...base.season, concerns: [] } }).ok).toBe(false);
  });
  it('소수와 음수 가중치를 거절한다', () => {
    const w = { research_evidence: 25.5, season_fit: 29.5, formulation_fit: 25, market_appeal: 20 };
    expect(validateCriteria({ ...base, weights: w }).ok).toBe(false);
    const n = { research_evidence: -10, season_fit: 60, formulation_fit: 30, market_appeal: 20 };
    expect(validateCriteria({ ...base, weights: n }).ok).toBe(false);
  });
});

describe('변경안 정리', () => {
  it('합이 100이 아닌 제안을 비율대로 100으로 맞춘다', () => {
    const w = normalizeWeights({ research_evidence: 40, season_fit: 30, formulation_fit: 25, market_appeal: 20 });
    expect(Object.values(w).reduce((a, b) => a + b, 0)).toBe(100);
    expect(w.research_evidence).toBeGreaterThan(w.season_fit);
  });
  it('허용되지 않은 키를 버리고 기후는 유지한다', () => {
    const c = sanitizeProposal(
      {
        weights: { research_evidence: 40, season_fit: 25, formulation_fit: 20, market_appeal: 15, hack: 99 },
        required: ['concern_match', 'vegan', 'low_irritation'],
        concerns: ['soothing', 'nonsense'],
        season: { climate: 'cold_dry' },
      },
      base,
    );
    expect(validateCriteria(c).ok).toBe(true);
    expect(c.weights.research_evidence).toBe(40);
    expect(c.required).toEqual(['concern_match', 'low_irritation']);
    expect(c.season).toEqual({ climate: 'hot_humid', concerns: ['soothing'] });
  });
  it('엉뚱한 응답이면 현재 기준을 유지한다', () => {
    expect(sanitizeProposal('nope', base)).toEqual(base);
  });
});

describe('비교', () => {
  it('바뀐 항목만 25% → 40% 형식으로 보여 준다', () => {
    const next = { ...base, weights: { research_evidence: 40, season_fit: 25, formulation_fit: 20, market_appeal: 15 } };
    const d = diffCriteria(base, next);
    expect(d).toContainEqual({ label: '연구 근거', from: '25%', to: '40%' });
    expect(d).toHaveLength(4);
    expect(diffCriteria(base, base)).toEqual([]);
  });
});
