// 실제 Gemini로 에이전트 흐름을 한 번 돌려 본다. 키와 비용이 필요해서 평소에는 건너뛴다.
//   set -a; source .env; set +a; LIVE=1 npx vitest run tests/live.test.ts
import { describe, expect, it } from 'vitest';
import { initialCriteria, sanitizeProposal, diffCriteria } from '../lib/criteria';
import { runPlanPipeline } from '../lib/generate';
import { FEEDBACK_SCHEMA, buildFeedbackPrompt, readInstruction } from '../lib/llm/feedback';
import { generateJson } from '../lib/llm/gemini';
import type { StepEvent } from '../lib/pipeline';
import type { Ingredient } from '../lib/scoring';
import { ingredients as seed } from '../supabase/seed/ingredients.mjs';

describe.skipIf(!process.env.LIVE)('실제 Gemini', () => {
  const brief = { market: 'KR', launch_month: 7, product_type: 'gel_cream' } as const;
  const criteria = initialCriteria(brief);

  it('기획안과 상세페이지 문안을 끝까지 만든다', async () => {
    const events: StepEvent[] = [];
    const started = Date.now();
    const r = await runPlanPipeline({
      project: { name: '여름용 진정 젤크림', ...brief },
      criteria,
      ingredients: seed as unknown as Ingredient[],
      emit: (e) => {
        events.push(e);
        if (e.status !== 'start') console.log(`${((Date.now() - started) / 1000).toFixed(1)}s`, e.step, e.status, e.note ?? '');
      },
    });
    console.log(JSON.stringify({ concept_name: r.plan.concept_name, review: r.plan.review, detail: r.plan.detail_page }, null, 1));
    expect(r.plan.ingredient_reasons).toHaveLength(5);
    expect(r.plan.detail_page!.sections).toHaveLength(3);
  }, 240_000);

  it('피드백을 기준 변경안으로 바꾼다', async () => {
    const catalog = (seed as unknown as Ingredient[]).map((i) => ({ id: i.id, name: i.name }));
    const plan = { concept_name: '쿨링 진정 젤크림', concept: '여름철 달아오른 피부를 가라앉히는 젤크림', target: '20~30대', key_claims: ['진정'], ingredient_reasons: [], cautions: [] };
    const raw = await generateJson(
      buildFeedbackPrompt(criteria, plan, catalog, '연구 근거를 훨씬 더 중요하게 봐 주세요. 자극 우려가 있는 원료는 빼 주세요. 인삼은 꼭 넣고, 콘셉트 문장은 더 고급스럽게 써 주세요.'),
      FEEDBACK_SCHEMA,
    );
    const next = sanitizeProposal(raw, criteria, catalog);
    console.log(JSON.stringify(raw), diffCriteria(criteria, next));
    expect(next.weights.research_evidence).toBeGreaterThan(25);
    expect(next.required).toContain('low_irritation');
    expect(next.include?.map((r) => r.id)).toContain('panax-ginseng');
    expect(readInstruction(raw)).not.toBe('');
  }, 60_000);
});
