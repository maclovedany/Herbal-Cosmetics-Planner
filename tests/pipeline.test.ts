// 오케스트레이터가 에이전트에게 일을 넘기는 순서, 검토 후 재작성, 상세페이지 산출을 고정 응답으로 확인한다.
import { describe, expect, it } from 'vitest';
import { initialCriteria } from '../lib/criteria';
import { InsufficientCandidatesError, PlanVerificationError, runPlanPipeline } from '../lib/generate';
import { DETAIL_SCHEMA } from '../lib/agents/detail';
import { PLAN_SCHEMA } from '../lib/agents/planner';
import { RESEARCH_SCHEMA } from '../lib/agents/research';
import { REVIEW_SCHEMA, verifyPlan } from '../lib/agents/reviewer';
import { LlmError, type GenerateJson } from '../lib/llm/gemini';
import { STEPS, type StepEvent } from '../lib/pipeline';
import { rankIngredients, type Ingredient } from '../lib/scoring';
import { ingredients as seed } from '../supabase/seed/ingredients.mjs';

const ingredients = seed as unknown as Ingredient[];
const brief = { market: 'KR', launch_month: 7, product_type: 'gel_cream' } as const;
const project = { name: '여름용 진정 젤크림', ...brief };
const criteria = initialCriteria(brief);
const top = rankIngredients(ingredients, criteria, brief).slice(0, 5);

const goodPlan = () => ({
  concept_name: '쿨링 진정 젤크림',
  concept: '콘셉트',
  target: '타깃',
  key_claims: ['a', 'b', 'c'],
  cautions: ['확인'],
  ingredient_reasons: top.map((c) => ({ ingredient_id: c.ingredient_id, reason: '이유', source_ids: [c.sources[0].id] })),
});
const detail = {
  headline: '여름 피부를 식히는 한 겹',
  subcopy: '부제',
  sections: [1, 2, 3, 4].map((n) => ({ title: `섹션 ${n}`, body: '본문', image_prompt: `A jar ${n}` })),
};

// 스키마로 어느 에이전트의 호출인지 가려 고정 응답을 돌려준다.
function fakeGemini(overrides: Partial<Record<'research' | 'plan' | 'review' | 'detail', (n: number) => unknown>> = {}) {
  const calls = { research: 0, plan: 0, review: 0, detail: 0 };
  const generate: GenerateJson = async (_prompt, schema) => {
    const kind = schema === RESEARCH_SCHEMA ? 'research' : schema === PLAN_SCHEMA ? 'plan' : schema === REVIEW_SCHEMA ? 'review' : schema === DETAIL_SCHEMA ? 'detail' : null;
    if (!kind) throw new Error('unknown schema');
    const n = ++calls[kind];
    if (overrides[kind]) return overrides[kind]!(n);
    if (kind === 'research') return { notes: top.map((c) => ({ ingredient_id: c.ingredient_id, summary: '근거', source_ids: [c.sources[0].id, 'made-up'] })) };
    if (kind === 'plan') return goodPlan();
    if (kind === 'review') return { approved: true, issues: [] };
    return detail;
  };
  return { generate, calls };
}
const images = () => {
  const stored: string[] = [];
  return {
    stored,
    deps: {
      generate: async () => new Uint8Array([1, 2, 3]),
      store: async (i: number) => {
        stored.push(`u/p/r/${i + 1}.png`);
        return `u/p/r/${i + 1}.png`;
      },
    },
  };
};
const collect = () => {
  const events: StepEvent[] = [];
  return { events, emit: (e: StepEvent) => void events.push(e), done: () => events.filter((e) => e.status !== 'start').map((e) => e.step) };
};

describe('에이전트 흐름', () => {
  it('리서처 → 기획자 → 검토자 → 상세페이지 제작자 순으로 일하고 결과를 한 문서로 묶는다', async () => {
    const g = fakeGemini();
    const img = images();
    const log = collect();
    const r = await runPlanPipeline({ project, criteria, ingredients, generate: g.generate, images: img.deps, emit: log.emit });

    expect(log.done()).toEqual(['research_query', 'research_brief', 'plan_write', 'review_verify', 'review_critique', 'detail_copy', 'detail_image']);
    expect(g.calls).toEqual({ research: 1, plan: 1, review: 1, detail: 1 });
    expect(r.candidates).toHaveLength(5);
    expect(r.plan.review).toEqual({ approved: true, issues: [], rounds: 1 });
    // 리서치 메모에서 원료 DB에 없는 출처는 버린다.
    expect(r.plan.research).toHaveLength(5);
    expect(r.plan.research![0].source_ids).toEqual([top[0].sources[0].id]);
    // 상세페이지는 섹션 3개로 자르고, 섹션마다 이미지 경로가 붙는다.
    expect(r.plan.detail_page!.sections.map((s) => s.image_path)).toEqual(['u/p/r/1.png', 'u/p/r/2.png', 'u/p/r/3.png']);
    expect(r.plan.detail_page!.sections[0].image_prompt).toContain('No text');
  });

  it('시작한 단계는 모두 끝나고, AI가 일하는 단계와 서버가 일하는 단계가 구분된다', async () => {
    const log = collect();
    await runPlanPipeline({ project, criteria, ingredients, generate: fakeGemini().generate, images: images().deps, emit: log.emit });
    const starts = log.events.filter((e) => e.status === 'start').map((e) => e.step);
    expect(starts).toEqual(log.done());
    expect(log.done().filter((s) => STEPS[s].ai)).toEqual(['research_brief', 'plan_write', 'review_critique', 'detail_copy', 'detail_image']);
    expect(log.events.find((e) => e.step === 'research_query' && e.status === 'done')!.db![0].store).toBe('ingredients');
  });

  it('검토자가 돌려보내면 기획자가 한 번 고쳐 쓰고 다시 검토받는다', async () => {
    const g = fakeGemini({ review: (n) => (n === 1 ? { approved: false, issues: ['"치료" 표현을 빼 주세요.'] } : { approved: true, issues: [] }) });
    const log = collect();
    const r = await runPlanPipeline({ project, criteria, ingredients, generate: g.generate, images: images().deps, emit: log.emit });
    expect(log.done().slice(2, 8)).toEqual(['plan_write', 'review_verify', 'review_critique', 'plan_revise', 'review_verify', 'review_critique']);
    expect(g.calls.plan).toBe(2);
    expect(r.plan.review).toEqual({ approved: true, issues: [], rounds: 2 });
  });

  it('고쳐 쓴 뒤에도 의견이 남으면 더 돌리지 않고 의견을 기획안에 남긴다', async () => {
    const g = fakeGemini({ review: () => ({ approved: false, issues: ['근거가 약해요.'] }) });
    const r = await runPlanPipeline({ project, criteria, ingredients, generate: g.generate, images: images().deps });
    expect(g.calls).toMatchObject({ plan: 2, review: 2 });
    expect(r.plan.review).toEqual({ approved: false, issues: ['근거가 약해요.'], rounds: 2 });
  });

  it('후보가 아닌 원료 이름이 글에 들어가면 서버가 잡아 돌려보낸다', async () => {
    const outsider = ingredients.find((i) => !top.some((c) => c.ingredient_id === i.id))!;
    const g = fakeGemini({ plan: (n) => (n === 1 ? { ...goodPlan(), concept: `${outsider.name}을 더했어요.` } : goodPlan()) });
    const r = await runPlanPipeline({ project, criteria, ingredients, generate: g.generate, images: images().deps });
    expect(g.calls.plan).toBe(2);
    expect(r.plan.concept).toBe('콘셉트');
    expect(r.plan.review!.rounds).toBe(2);
  });
});

describe('실패', () => {
  it('후보가 3개 미만이면 AI를 부르지 않고 멈춘다', async () => {
    const g = fakeGemini();
    const p = runPlanPipeline({ project, criteria, ingredients: ingredients.slice(0, 2), generate: g.generate });
    await expect(p).rejects.toBeInstanceOf(InsufficientCandidatesError);
    expect(g.calls).toEqual({ research: 0, plan: 0, review: 0, detail: 0 });
  });

  it('어느 에이전트든 Gemini 호출이 실패하면 예외가 나고 실패한 단계가 기록된다', async () => {
    for (const kind of ['research', 'plan', 'review', 'detail'] as const) {
      const log = collect();
      const g = fakeGemini({ [kind]: () => { throw new LlmError('down'); } });
      await expect(runPlanPipeline({ project, criteria, ingredients, generate: g.generate, images: images().deps, emit: log.emit })).rejects.toBeInstanceOf(LlmError);
      expect(log.events.at(-1)!.status).toBe('error');
    }
  });

  it('상세이미지 생성이 실패해도 기획안은 나오고, 그 섹션은 문안만 남는다', async () => {
    const log = collect();
    const img = images();
    let n = 0;
    const r = await runPlanPipeline({
      project, criteria, ingredients, emit: log.emit, generate: fakeGemini().generate,
      images: { ...img.deps, generate: async () => { if (++n === 2) throw new LlmError('OpenAI 이미지 API가 오류를 돌려줬어요. (500)'); return new Uint8Array([1]); } },
    });
    expect(r.plan.detail_page!.sections.filter((s) => s.image_path)).toHaveLength(2);
    expect(log.events.at(-1)).toMatchObject({ step: 'detail_image', status: 'done' });
    expect(log.events.at(-1)!.note).toContain('3장 중 2장');

    const none = collect();
    const r2 = await runPlanPipeline({ project, criteria, ingredients, emit: none.emit, generate: fakeGemini().generate });
    expect(r2.plan.detail_page!.sections.every((s) => s.image_path === null)).toBe(true);
    expect(none.events.at(-1)).toMatchObject({ step: 'detail_image', status: 'error' });
  });
});

describe('원료·출처 대조', () => {
  const good = goodPlan();
  it('후보에 없는 원료를 쓰면 거절한다', () => {
    const bad = { ...good, ingredient_reasons: [...good.ingredient_reasons.slice(1), { ingredient_id: 'retinol', reason: 'x', source_ids: ['retinol:s1'] }] };
    expect(() => verifyPlan(bad, top)).toThrow(PlanVerificationError);
  });
  it('원료 DB에 없는 출처나 다른 원료의 출처를 쓰면 거절한다', () => {
    const made = structuredClone(good);
    made.ingredient_reasons[0].source_ids = ['doi:10.1000/fake'];
    expect(() => verifyPlan(made, top)).toThrow(PlanVerificationError);
    const crossed = structuredClone(good);
    crossed.ingredient_reasons[0].source_ids = [top[1].sources[0].id];
    expect(() => verifyPlan(crossed, top)).toThrow(PlanVerificationError);
  });
  it('출처가 없거나 후보가 빠지거나 형식이 틀리면 거절한다', () => {
    const empty = structuredClone(good);
    empty.ingredient_reasons[0].source_ids = [];
    expect(() => verifyPlan(empty, top)).toThrow(PlanVerificationError);
    expect(() => verifyPlan({ ...good, ingredient_reasons: good.ingredient_reasons.slice(1) }, top)).toThrow(PlanVerificationError);
    expect(() => verifyPlan({ concept: 1 }, top)).toThrow(PlanVerificationError);
    expect(() => verifyPlan(null, top)).toThrow(PlanVerificationError);
  });
});
