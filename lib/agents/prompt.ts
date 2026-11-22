// 에이전트 프롬프트가 함께 쓰는 설명 블록.
import { CLIMATES, CONCERNS, MARKETS, PRODUCT_TYPES } from '../domain';
import { WEIGHTS, WEIGHT_KEYS, type Criteria } from '../criteria';
import type { PlanProject } from '../plan';
import type { Candidate } from '../scoring';

export const STRING = { type: 'STRING' };
export const STRINGS = { type: 'ARRAY', items: STRING };

export function describeBrief(project: PlanProject, criteria: Criteria): string {
  return `[프로젝트]
- 프로젝트명: ${project.name}
- 출시 시장: ${MARKETS[project.market]}
- 출시 월: ${project.launch_month}월
- 제품 유형: ${PRODUCT_TYPES[project.product_type].label}

[평가 기준]
- 계절 조건: ${CLIMATES[criteria.season.climate]}
- 피부 고민: ${criteria.season.concerns.map((c) => CONCERNS[c]).join(', ')}
- 가중치: ${WEIGHT_KEYS.map((k) => `${WEIGHTS[k]} ${criteria.weights[k]}%`).join(', ')}`;
}

export function describeCandidates(candidates: Candidate[]): string {
  const list = candidates
    .map(
      (c) => `- ingredient_id: ${c.ingredient_id}
  원료: ${c.name} (${c.name_en}), 생약명 ${c.herbal_name}
  순위 ${c.rank}위, 총점 ${c.total}${c.pinned ? ' · 기획자가 꼭 넣도록 지정한 원료' : ''}
  지표 성분: ${c.actives.join(', ')}
  효능 분류: ${c.concerns.map((x) => CONCERNS[x]).join(', ')}
  출처:
${c.sources.map((s) => `    - ${s.id} | ${s.type} | ${s.title}`).join('\n')}`,
    )
    .join('\n');
  return `[원료 후보] 서버가 평가 기준으로 순위를 정했습니다. 순위를 바꾸지 마세요.\n${list}`;
}

export const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
