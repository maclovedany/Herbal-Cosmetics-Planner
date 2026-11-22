// 기획안 생성의 저장 직전까지. 오케스트레이터가 리서처 → 기획자 → 검토자 → 상세페이지 제작자 순으로 일을 넘긴다.
// plan_versions에는 쓰지 않는다. 상세이미지 파일만 images.store로 저장소에 올린다.
import type { Criteria } from './criteria';
import { runStep, type Emit } from './pipeline';
import type { Plan, PlanProject } from './plan';
import type { Candidate, Ingredient } from './scoring';
import { generateJson, type GenerateJson } from './llm/gemini';
import type { GenerateImage } from './llm/openai';
import { DETAIL_SCHEMA, buildDetailPrompt, cleanDetailPage } from './agents/detail';
import { PLAN_SCHEMA, buildPlanPrompt } from './agents/planner';
import { RESEARCH_SCHEMA, buildResearchPrompt, cleanResearchNotes, selectCandidates } from './agents/research';
import { REVIEW_SCHEMA, buildReviewPrompt, cleanReview, findOffListIngredients, verifyPlan } from './agents/reviewer';

export { InsufficientCandidatesError } from './agents/research';
export { PlanVerificationError } from './agents/reviewer';

const MAX_REVISIONS = 1;

export type ImageDeps = { generate: GenerateImage; store: (index: number, bytes: Uint8Array) => Promise<string> };

export async function runPlanPipeline(input: {
  project: PlanProject;
  criteria: Criteria;
  ingredients: Ingredient[];
  generate?: GenerateJson;
  images?: ImageDeps;
  emit?: Emit;
  // 피드백에서 온 기획안 수정 요청. 있으면 이전 버전 기획안을 고쳐 쓴다.
  edit?: { previous: Plan; instruction: string };
}): Promise<{ plan: Plan; candidates: Candidate[] }> {
  const { project, criteria, ingredients, edit } = input;
  const generate = input.generate ?? generateJson;
  const emit = input.emit ?? (() => {});

  // 리서처
  const candidates = await runStep(emit, 'research_query', async () => {
    const r = selectCandidates(ingredients, criteria, project);
    return {
      value: r.candidates,
      note: `원료 ${ingredients.length}건 중 ${criteria.exclude?.length ? `기준에서 뺀 ${criteria.exclude.length}건을 제외하고 ` : ''}조건에 맞는 ${r.passed}건을 점수순으로 세워 ${r.candidates.length}건을 골랐어요.${r.pinned ? ` 그중 ${r.pinned}건은 꼭 넣도록 지정한 원료예요.` : ''} 1위는 ${r.candidates[0].name}(${r.candidates[0].total}점)이에요.`,
      db: [{ store: 'ingredients' as const, op: 'read' as const, note: `원료 ${ingredients.length}건의 특성과 출처를 읽었어요.` }],
    };
  });
  const research = await runStep(emit, 'research_brief', async () => {
    const notes = cleanResearchNotes(await generate(buildResearchPrompt(project, criteria, candidates), RESEARCH_SCHEMA), candidates);
    return { value: notes, note: `후보 ${candidates.length}건 중 ${notes.length}건의 근거를 정리해 기획자에게 넘겼어요.` };
  });

  // 기획자 → 검토자. 검토자가 돌려보내면 한 번 고쳐 쓴다.
  let draft = await runStep(emit, 'plan_write', async () => ({
    value: await generate(buildPlanPrompt(project, criteria, candidates, research, undefined, edit), PLAN_SCHEMA),
    note: edit ? '수정 요청을 반영해 이전 버전 기획안을 고쳐 써서 검토자에게 넘겼어요.' : '콘셉트와 원료별 추천 이유를 써서 검토자에게 넘겼어요.',
  }));
  let plan: Plan;
  let review = { approved: false, issues: [] as string[] };
  for (let round = 1; ; round++) {
    plan = await runStep(emit, 'review_verify', async () => ({
      value: verifyPlan(draft, candidates),
      note: `추천 이유 ${candidates.length}건의 원료 ID와 출처 ID가 모두 원료 DB의 값과 일치해요.`,
    }));
    review = await runStep(emit, 'review_critique', async () => {
      const ai = cleanReview(await generate(buildReviewPrompt(project, criteria, candidates, plan), REVIEW_SCHEMA));
      const offList = findOffListIngredients(plan, candidates, ingredients);
      const issues = [...offList, ...ai.issues];
      const approved = ai.approved && offList.length === 0;
      return {
        value: { approved, issues },
        note: approved
          ? '고칠 점이 없어 통과시켰어요.'
          : round > MAX_REVISIONS
            ? `고친 뒤에도 의견 ${issues.length}건이 남았어요. 기획안에 검토 의견으로 함께 적어 둬요.`
            : `의견 ${issues.length}건을 달아 기획자에게 돌려보냈어요. ${issues.join(' ')}`,
      };
    });
    if (review.approved || round > MAX_REVISIONS) {
      plan = { ...plan, research, review: { ...review, rounds: round }, ...(edit ? { edit_request: edit.instruction } : {}) };
      break;
    }
    const previous = plan;
    draft = await runStep(emit, 'plan_revise', async () => ({
      value: await generate(buildPlanPrompt(project, criteria, candidates, research, { previous, issues: review.issues }, edit), PLAN_SCHEMA),
      note: `검토 의견 ${review.issues.length}건을 반영해 다시 썼어요.`,
    }));
  }

  // 상세페이지 제작자
  const detail = await runStep(emit, 'detail_copy', async () => {
    const page = cleanDetailPage(await generate(buildDetailPrompt(project, plan, candidates), DETAIL_SCHEMA));
    return { value: page, note: `"${page.headline}" 헤드라인과 섹션 ${page.sections.length}개의 문안, 이미지 지시문을 썼어요.` };
  });

  // 상세이미지는 실패해도 기획안 저장을 막지 않는다. 실패한 섹션은 문안만 남는다.
  emit({ type: 'step', step: 'detail_image', status: 'start' });
  const results = await Promise.allSettled(
    detail.sections.map(async (section, i) => {
      if (!input.images) throw new Error('이미지 생성이 연결되지 않았어요.');
      section.image_path = await input.images.store(i, await input.images.generate(section.image_prompt));
    }),
  );
  const made = results.filter((r) => r.status === 'fulfilled').length;
  const failure = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
  const reason = failure ? ` ${failure.reason instanceof Error ? failure.reason.message : ''}` : '';
  emit({
    type: 'step',
    step: 'detail_image',
    status: made === 0 ? 'error' : 'done',
    note:
      made === results.length
        ? `상세이미지 ${made}장을 만들어 저장소에 올렸어요.`
        : `상세이미지 ${results.length}장 중 ${made}장을 만들었어요. 나머지 섹션은 문안만 실어요.${reason}`,
    db: made > 0 ? [{ store: 'storage', op: 'insert', note: `detail-images 버킷에 이미지 ${made}장을 올렸어요.` }] : undefined,
  });

  return { plan: { ...plan, detail_page: detail }, candidates };
}
