// 리서처: 원료 DB에서 후보를 고르고(서버), 후보별 근거를 정리한다(AI).
import type { Criteria } from '../criteria';
import type { PlanProject, ResearchNote } from '../plan';
import { MIN_CANDIDATES, TOP_N, rankIngredients, type Candidate, type Ingredient } from '../scoring';
import { STRING, STRINGS, describeBrief, describeCandidates, isStringArray } from './prompt';

export class InsufficientCandidatesError extends Error {
  constructor(public found: number) {
    super(`조건에 맞는 원료 후보가 ${found}개뿐이에요. ${MIN_CANDIDATES}개 이상이어야 기획안을 만들 수 있어요.`);
  }
}

export function selectCandidates(ingredients: Ingredient[], criteria: Criteria, project: PlanProject) {
  const ranked = rankIngredients(ingredients, criteria, project);
  if (ranked.length < MIN_CANDIDATES) throw new InsufficientCandidatesError(ranked.length);
  // 지정한 원료를 먼저 싣고 남는 자리를 점수순으로 채운다. 순위 숫자는 전체 순위 그대로 둔다.
  const pinned = ranked.filter((c) => c.pinned).slice(0, TOP_N);
  const rest = ranked.filter((c) => !c.pinned).slice(0, TOP_N - pinned.length);
  const candidates = [...pinned, ...rest].sort((a, b) => a.rank - b.rank);
  return { passed: ranked.length, candidates, pinned: pinned.length };
}

export const RESEARCH_SCHEMA = {
  type: 'OBJECT',
  properties: {
    notes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { ingredient_id: STRING, summary: STRING, source_ids: STRINGS },
        required: ['ingredient_id', 'summary', 'source_ids'],
      },
    },
  },
  required: ['notes'],
};

export function buildResearchPrompt(project: PlanProject, criteria: Criteria, candidates: Candidate[]): string {
  return `당신은 화장품 원료 리서처입니다. 기획자가 쓸 수 있도록 원료 후보마다 근거를 한국어로 정리하세요.

${describeBrief(project, criteria)}

${describeCandidates(candidates)}

[규칙]
1. notes에는 후보마다 한 항목씩 쓰고, ingredient_id는 위 값을 그대로 쓰세요.
2. summary에는 이 시장·계절·제형에서 이 원료가 어떤 근거로 쓰일 수 있는지 2문장으로 쓰세요. 근거가 약한 부분은 약하다고 쓰세요.
3. 출처에 적힌 내용만 쓰세요. 출처에 없는 수치나 임상 결과를 만들지 마세요.
4. source_ids에는 summary의 근거로 쓴 그 원료의 출처 ID만 넣으세요.`;
}

// 리서치 메모는 기획자에게 넘기는 중간 자료다. 후보나 출처와 맞지 않는 부분은 버리고 맞는 것만 남긴다.
export function cleanResearchNotes(raw: unknown, candidates: Candidate[]): ResearchNote[] {
  const notes = (raw as { notes?: unknown })?.notes;
  if (!Array.isArray(notes)) return [];
  const byId = new Map(candidates.map((c) => [c.ingredient_id, c]));
  const seen = new Set<string>();
  const out: ResearchNote[] = [];
  for (const n of notes as Partial<ResearchNote>[]) {
    const candidate = typeof n?.ingredient_id === 'string' ? byId.get(n.ingredient_id) : undefined;
    if (!candidate || seen.has(candidate.ingredient_id) || typeof n.summary !== 'string') continue;
    seen.add(candidate.ingredient_id);
    const known = new Set(candidate.sources.map((s) => s.id));
    out.push({
      ingredient_id: candidate.ingredient_id,
      summary: n.summary,
      source_ids: isStringArray(n.source_ids) ? n.source_ids.filter((id) => known.has(id)) : [],
    });
  }
  return out;
}
