// 실제 Gemini로 에이전트 흐름을 한 번 돌려 본다. 키와 비용이 필요해서 평소에는 건너뛴다.
//   set -a; source .env; set +a; LIVE=1 npx vitest run tests/live.test.ts
import { describe, expect, it } from 'vitest';
import { initialCriteria, sanitizeProposal, diffCriteria } from '../lib/criteria';
import { runPlanPipeline } from '../lib/generate';
import { FEEDBACK_SCHEMA, buildFeedbackPrompt } from '../lib/llm/feedback';
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
    const raw = await generateJson(buildFeedbackPrompt(criteria, '쿨링 진정 젤크림', '연구 근거를 훨씬 더 중요하게 봐 주세요. 자극 우려가 있는 원료는 빼 주세요.'), FEEDBACK_SCHEMA);
    const next = sanitizeProposal(raw, criteria);
    console.log(JSON.stringify(raw), diffCriteria(criteria, next));
    expect(next.weights.research_evidence).toBeGreaterThan(25);
    expect(next.required).toContain('low_irritation');
  }, 60_000);
});
