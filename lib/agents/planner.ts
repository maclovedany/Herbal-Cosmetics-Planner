// 기획자: 리서치 메모를 받아 기획안을 쓰고, 검토 의견이 오면 고쳐 쓴다(AI).
import type { Criteria } from '../criteria';
import type { Plan, PlanProject, ResearchNote } from '../plan';
import type { Candidate } from '../scoring';
import { STRING, STRINGS, describeBrief, describeCandidates } from './prompt';

export const PLAN_SCHEMA = {
  type: 'OBJECT',
  properties: {
    concept_name: STRING,
    concept: STRING,
    target: STRING,
    key_claims: STRINGS,
    ingredient_reasons: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { ingredient_id: STRING, reason: STRING, source_ids: STRINGS },
        required: ['ingredient_id', 'reason', 'source_ids'],
      },
    },
    cautions: STRINGS,
  },
  required: ['concept_name', 'concept', 'target', 'key_claims', 'ingredient_reasons', 'cautions'],
};

export function buildPlanPrompt(
  project: PlanProject,
  criteria: Criteria,
  candidates: Candidate[],
  notes: ResearchNote[],
  revision?: { previous: Plan; issues: string[] },
  edit?: { previous: Plan; instruction: string },
): string {
  const body = (p: Plan) =>
    JSON.stringify(
      { concept_name: p.concept_name, concept: p.concept, target: p.target, key_claims: p.key_claims, ingredient_reasons: p.ingredient_reasons, cautions: p.cautions },
      null,
      1,
    );
  // 피드백으로 온 수정 요청. 검토 의견으로 다시 쓸 때도 계속 함께 준다.
  const request = edit
    ? `${revision ? '' : `[이전 버전 기획안] 새로 쓰지 말고 이 기획안을 고쳐 쓰세요.\n${body(edit.previous)}\n\n`}[기획자 수정 요청]
"""
${edit.instruction}
"""
수정 요청을 반영하고, 요청하지 않은 부분은 이전 기획안의 내용과 어조를 유지하세요. 원료 후보가 이전과 달라졌으면 ingredient_reasons는 위 원료 후보에 맞춰 쓰세요. 수정 요청이 아래 규칙과 어긋나면 규칙을 따르세요.

`
    : '';
  const research = notes.length
    ? `[리서처 메모]\n${notes.map((n) => `- ${n.ingredient_id}: ${n.summary}`).join('\n')}\n\n`
    : '';
  const fix = revision
    ? `[이전 기획안] 검토자가 아래 의견을 냈습니다. 의견을 반영해 기획안 전체를 다시 쓰세요.
${body(revision.previous)}

[검토 의견]
${revision.issues.map((i) => `- ${i}`).join('\n')}

`
    : '';

  return `당신은 글로벌 화장품 브랜드의 상품 기획자입니다. 한방 유래 원료를 쓰는 제품 기획안을 한국어로 작성하세요.

${describeBrief(project, criteria)}

${describeCandidates(candidates)}

${research}${fix}${request}[규칙]
1. 위 원료 후보만 사용하세요. 목록에 없는 원료를 언급하지 마세요.
2. ingredient_reasons에는 후보마다 한 항목씩 쓰고, ingredient_id는 위 값을 그대로 쓰세요.
3. source_ids에는 그 원료의 출처 ID만 넣고, 원료마다 하나 이상 넣으세요.
4. reason에는 이 시장·계절·제형에 이 원료가 맞는 이유를 출처와 리서처 메모에 있는 내용 안에서 2~3문장으로 쓰세요.
5. 의약품처럼 들리는 효능(치료, 완치 등)을 쓰지 마세요.
6. concept은 3~4문장, key_claims는 3개, cautions에는 출시 시장의 규제·표시 광고에서 확인할 점을 1~3개 쓰세요.`;
}
