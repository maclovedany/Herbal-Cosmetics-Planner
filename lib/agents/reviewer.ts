// 검토자: 기획안의 원료·출처를 후보와 대조하고(서버), 표현과 근거를 검토한다(AI).
import type { Criteria } from '../criteria';
import type { Plan, PlanProject } from '../plan';
import type { Candidate, Ingredient } from '../scoring';
import { STRINGS, describeBrief, describeCandidates, isStringArray } from './prompt';

export class PlanVerificationError extends Error {}

// 원료 ID와 출처 ID가 서버가 정한 후보와 하나라도 어긋나면 저장하지 않는다.
export function verifyPlan(raw: unknown, candidates: Candidate[]): Plan {
  const p = raw as Partial<Plan> | null;
  if (
    !p ||
    typeof p.concept_name !== 'string' ||
    typeof p.concept !== 'string' ||
    typeof p.target !== 'string' ||
    !isStringArray(p.key_claims) ||
    !isStringArray(p.cautions) ||
    !Array.isArray(p.ingredient_reasons)
  ) {
    throw new PlanVerificationError('기획안 형식이 맞지 않아요.');
  }
  const byId = new Map(candidates.map((c) => [c.ingredient_id, c]));
  const seen = new Set<string>();
  for (const r of p.ingredient_reasons) {
    if (!r || typeof r.ingredient_id !== 'string' || typeof r.reason !== 'string' || !isStringArray(r.source_ids)) {
      throw new PlanVerificationError('원료 추천 이유의 형식이 맞지 않아요.');
    }
    const candidate = byId.get(r.ingredient_id);
    if (!candidate) throw new PlanVerificationError(`후보에 없는 원료예요: ${r.ingredient_id}`);
    if (seen.has(r.ingredient_id)) throw new PlanVerificationError(`원료가 중복됐어요: ${r.ingredient_id}`);
    seen.add(r.ingredient_id);
    if (r.source_ids.length === 0) throw new PlanVerificationError(`출처가 없는 원료예요: ${r.ingredient_id}`);
    const known = new Set(candidate.sources.map((s) => s.id));
    const unknown = r.source_ids.find((id) => !known.has(id));
    if (unknown) throw new PlanVerificationError(`원료 DB에 없는 출처예요: ${unknown}`);
  }
  if (seen.size !== candidates.length) {
    throw new PlanVerificationError('추천 이유가 빠진 원료 후보가 있어요.');
  }
  return {
    concept_name: p.concept_name,
    concept: p.concept,
    target: p.target,
    key_claims: p.key_claims,
    ingredient_reasons: p.ingredient_reasons,
    cautions: p.cautions,
  };
}

// 기획안 글에 후보가 아닌 원료의 이름이 들어 있으면 고칠 점으로 돌려준다.
export function findOffListIngredients(plan: Plan, candidates: Candidate[], ingredients: Ingredient[]): string[] {
  const text = [plan.concept_name, plan.concept, plan.target, ...plan.key_claims, ...plan.cautions, ...plan.ingredient_reasons.map((r) => r.reason)].join('\n');
  const allowed = new Set(candidates.map((c) => c.ingredient_id));
  return ingredients
    .filter((i) => !allowed.has(i.id) && text.includes(i.name))
    .map((i) => `후보에 없는 원료 "${i.name}"을 언급했어요. 빼 주세요.`);
}

export const REVIEW_SCHEMA = {
  type: 'OBJECT',
  properties: { approved: { type: 'BOOLEAN' }, issues: STRINGS },
  required: ['approved', 'issues'],
};

export function buildReviewPrompt(project: PlanProject, criteria: Criteria, candidates: Candidate[], plan: Plan): string {
  return `당신은 화장품 기획안 검토자입니다. 기획자가 쓴 기획안을 점검하고 한국어로 의견을 내세요.

${describeBrief(project, criteria)}

${describeCandidates(candidates)}

[기획안]
${JSON.stringify(plan, null, 1)}

[점검 항목]
1. 의약품으로 오인할 표현이 있는가 (치료, 완치, 염증 제거, 재생 등)
2. 출처에 없는 효능이나 수치를 단정했는가
3. 원료 후보 목록에 없는 원료를 언급했는가
4. 설명이 출시 시장·계절·제품 유형과 맞지 않는가

[규칙]
- 고쳐야 할 문제가 없으면 approved를 true로, issues를 빈 배열로 쓰세요.
- 문제가 있으면 approved를 false로 하고, issues에 무엇을 어떻게 고칠지 한 문장씩 최대 5개 쓰세요.
- 문체 취향이나 사소한 표현은 지적하지 마세요.`;
}

export function cleanReview(raw: unknown): { approved: boolean; issues: string[] } {
  const r = raw as { approved?: unknown; issues?: unknown } | null;
  const issues = isStringArray(r?.issues) ? r.issues.filter((i) => i.trim()).slice(0, 5) : [];
  return { approved: r?.approved !== false, issues };
}
