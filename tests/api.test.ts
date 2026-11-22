// 서버 API를 메모리 Postgres 위에서 끝까지 실행해 PRD 12절의 수용 기준을 확인한다.
// Supabase 클라이언트는 tests/helpers.ts의 흉내 클라이언트로, Gemini 호출은 고정 응답으로 바꾼다.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { USER_A, USER_B, asAdmin, createDb, fakeSupabase, uploadedFiles } from './helpers';
import { DETAIL_SCHEMA } from '../lib/agents/detail';
import { PLAN_SCHEMA } from '../lib/agents/planner';
import { RESEARCH_SCHEMA } from '../lib/agents/research';
import { REVIEW_SCHEMA } from '../lib/agents/reviewer';
import type { StepEvent } from '../lib/pipeline';

const state = vi.hoisted(() => ({
  client: null as unknown,
  plan: null as null | ((prompt: string) => unknown),
  proposal: {} as unknown,
  image: null as null | (() => Promise<Uint8Array>),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => state.client }));
vi.mock('@/lib/llm/gemini', async (original) => ({
  ...(await original<typeof import('../lib/llm/gemini')>()),
  generateJson: async (prompt: string, schema: object) => {
    if (schema === PLAN_SCHEMA) return state.plan!(prompt);
    if (schema === RESEARCH_SCHEMA) return { notes: [] };
    if (schema === REVIEW_SCHEMA) return { approved: true, issues: [] };
    if (schema === DETAIL_SCHEMA) {
      return { headline: '헤드라인', subcopy: '부제', sections: [1, 2, 3].map((n) => ({ title: `섹션 ${n}`, body: '본문', image_prompt: 'A jar' })) };
    }
    return state.proposal;
  },
}));
vi.mock('@/lib/llm/openai', () => ({ generateImage: () => state.image!() }));

import { POST as createProject } from '../app/api/projects/route';
import { DELETE as deleteProject } from '../app/api/projects/[id]/route';
import { POST as createVersion } from '../app/api/projects/[id]/versions/route';
import { POST as previewFeedback } from '../app/api/projects/[id]/feedback/route';
import { LlmError } from '../lib/llm/gemini';

let db: PGlite;
const login = (id: string | null) => {
  state.client = fakeSupabase(db, id ? { id, email: `${id.slice(-1)}@example.com` } : null);
};
const req = (body: unknown) => new Request('http://test', { method: 'POST', body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
// 진행 이벤트를 흘려보낸 응답이면 마지막 줄의 status를 결과로 본다.
const call = async (res: Promise<Response>) => {
  const r = await res;
  if (!r.headers.get('content-type')?.includes('ndjson')) return { status: r.status, body: await r.json(), events: [] as StepEvent[] };
  const lines = (await r.text()).trim().split('\n').map((l) => JSON.parse(l));
  const end = lines.at(-1);
  expect(end.type).toBe('end');
  return { status: end.status as number, body: end, events: lines.slice(0, -1) as StepEvent[] };
};

// 프롬프트에 실린 후보와 출처 ID만 써서 기획안을 쓰는 정상 응답.
function goodPlan(prompt: string) {
  const ids = [...prompt.matchAll(/^- ingredient_id: (\S+)$/gm)].map((m) => m[1]);
  return {
    concept_name: '테스트 콘셉트',
    concept: '콘셉트',
    target: '타깃',
    key_claims: ['a', 'b', 'c'],
    cautions: ['확인'],
    ingredient_reasons: ids.map((id) => ({ ingredient_id: id, reason: '이유', source_ids: [`${id}:s1`] })),
  };
}

const WEIGHTS_40 = { research_evidence: 40, season_fit: 25, formulation_fit: 20, market_appeal: 15 };
const propose = (weights: object) => {
  state.proposal = { summary: '연구 근거를 올렸어요.', weights, required: ['concern_match'], concerns: ['soothing', 'sebum', 'antioxidant'] };
};

async function newProject(name: string, month = 7, product_type = 'gel_cream') {
  const r = await call(createProject(req({ name, market: 'KR', launch_month: month, product_type })));
  expect(r.status).toBe(201);
  return r.body.id as string;
}
async function firstVersion(projectId: string) {
  const r = await call(createVersion(req({ base_version_id: null }), ctx(projectId)));
  expect(r.status).toBe(201);
  return r.body as { id: string; version_no: number };
}
async function rows<T>(sql: string, params: unknown[] = []) {
  await asAdmin(db);
  return (await db.query<T>(sql, params)).rows;
}
const versionCount = async (projectId: string) =>
  (await rows<{ n: number }>(`select count(*)::int as n from plan_versions where project_id = $1`, [projectId]))[0].n;

beforeAll(async () => {
  db = await createDb();
});
beforeEach(() => {
  login(USER_A);
  state.plan = goodPlan;
  state.image = async () => new Uint8Array([1, 2, 3]);
  uploadedFiles.clear();
  propose(WEIGHTS_40);
});

describe('프로젝트 생성', () => {
  it('브리프에서 초기 평가 기준을 정해 저장한다', async () => {
    const id = await newProject('여름용 진정 젤크림');
    const [p] = await rows<{ owner_id: string; initial_criteria: { season: { climate: string }; weights: { research_evidence: number } } }>(
      `select owner_id, initial_criteria from projects where id = $1`,
      [id],
    );
    expect(p.owner_id).toBe(USER_A);
    expect(p.initial_criteria.season.climate).toBe('hot_humid');
    expect(p.initial_criteria.weights.research_evidence).toBe(25);
  });
  it('잘못된 브리프는 422, 로그인하지 않으면 401', async () => {
    expect((await call(createProject(req({ name: '', market: 'KR', launch_month: 7, product_type: 'cream' })))).status).toBe(422);
    expect((await call(createProject(req({ name: 'x', market: 'MARS', launch_month: 7, product_type: 'cream' })))).status).toBe(422);
    expect((await call(createProject(req({ name: 'x', market: 'KR', launch_month: 13, product_type: 'cream' })))).status).toBe(422);
    login(null);
    expect((await call(createProject(req({ name: 'x', market: 'KR', launch_month: 7, product_type: 'cream' })))).status).toBe(401);
  });
});

describe('수용 기준', () => {
  it('1. 다른 사용자의 프로젝트 ID로 요청하면 404', async () => {
    const id = await newProject('A의 프로젝트');
    const v1 = await firstVersion(id);
    login(USER_B);
    expect((await call(createVersion(req({ base_version_id: v1.id }), ctx(id)))).status).toBe(404);
    expect((await call(previewFeedback(req({ base_version_id: v1.id, body: '바꿔 줘' }), ctx(id)))).status).toBe(404);
    expect((await call(createVersion(req({ base_version_id: null }), ctx('not-a-uuid')))).status).toBe(404);
    expect(await versionCount(id)).toBe(1);
  });

  it('2·3. 한 프로젝트의 기준 변경은 다른 프로젝트에 번지지 않고, 이전 버전은 당시 기준을 유지한다', async () => {
    const summer = await newProject('여름용 진정 젤크림', 7, 'gel_cream');
    const winter = await newProject('겨울용 보습 크림', 1, 'cream');
    const s1 = await firstVersion(summer);
    const w1 = await firstVersion(winter);

    const preview = await call(previewFeedback(req({ base_version_id: s1.id, body: '연구 근거를 더 중요하게' }), ctx(summer)));
    expect(preview.status).toBe(201);
    expect(preview.body.criteria.weights.research_evidence).toBe(40);
    // 미리보기만으로는 아무것도 바뀌지 않는다.
    expect(await versionCount(summer)).toBe(1);

    const s2 = await call(
      createVersion(req({ base_version_id: s1.id, feedback_id: preview.body.feedback_id, criteria: preview.body.criteria }), ctx(summer)),
    );
    expect(s2.status).toBe(201);
    expect(s2.body.version_no).toBe(2);

    const w = (id: string) =>
      rows<{ w: number }>(`select (criteria->'weights'->>'research_evidence')::int as w from plan_versions where id = $1`, [id]);
    expect((await w(s2.body.id))[0].w).toBe(40);
    expect((await w(s1.id))[0].w).toBe(25);
    expect((await w(w1.id))[0].w).toBe(25);

    // 다음 피드백은 여름 프로젝트에서는 40에서, 겨울 프로젝트에서는 25에서 시작한다.
    state.proposal = 'AI가 엉뚱한 답을 하면 현재 기준이 그대로 온다';
    const nextSummer = await call(previewFeedback(req({ base_version_id: s2.body.id, body: '확인' }), ctx(summer)));
    const nextWinter = await call(previewFeedback(req({ base_version_id: w1.id, body: '확인' }), ctx(winter)));
    expect(nextSummer.body.criteria.weights.research_evidence).toBe(40);
    expect(nextWinter.body.criteria.weights.research_evidence).toBe(25);
    expect(nextWinter.body.criteria.season.climate).toBe('cold_dry');

    const [fb] = await rows<{ status: string; result_version_id: string }>(`select status, result_version_id from feedback where id = $1`, [preview.body.feedback_id]);
    expect(fb).toEqual({ status: 'applied', result_version_id: s2.body.id });
  });

  it('4. LLM 호출이 실패하면 버전이 생기지 않고, 다시 시도할 수 있다', async () => {
    const id = await newProject('실패 후 재시도');
    state.plan = () => {
      throw new LlmError('down');
    };
    expect((await call(createVersion(req({ base_version_id: null }), ctx(id)))).status).toBe(502);
    expect(await versionCount(id)).toBe(0);

    state.plan = goodPlan;
    const v1 = await firstVersion(id);
    const preview = await call(previewFeedback(req({ base_version_id: v1.id, body: '연구 근거' }), ctx(id)));

    state.plan = () => {
      throw new LlmError('down');
    };
    const apply = () =>
      call(createVersion(req({ base_version_id: v1.id, feedback_id: preview.body.feedback_id, criteria: preview.body.criteria }), ctx(id)));
    expect((await apply()).status).toBe(502);
    expect(await versionCount(id)).toBe(1);
    const [fb] = await rows<{ status: string }>(`select status from feedback where id = $1`, [preview.body.feedback_id]);
    expect(fb.status).toBe('proposed');

    state.plan = goodPlan;
    expect((await apply()).status).toBe(201);
    expect(await versionCount(id)).toBe(2);
  });

  it('5. 같은 v1을 기준으로 두 번 적용하면 하나만 v2가 되고 다른 하나는 409', async () => {
    const id = await newProject('두 탭');
    const v1 = await firstVersion(id);
    const tab1 = await call(previewFeedback(req({ base_version_id: v1.id, body: '탭 1' }), ctx(id)));
    const tab2 = await call(previewFeedback(req({ base_version_id: v1.id, body: '탭 2' }), ctx(id)));
    const apply = (p: typeof tab1) =>
      call(createVersion(req({ base_version_id: v1.id, feedback_id: p.body.feedback_id, criteria: p.body.criteria }), ctx(id)));

    expect((await apply(tab1)).status).toBe(201);
    const late = await apply(tab2);
    expect(late.status).toBe(409);
    expect(late.body.error).toBe('version_conflict');
    expect(await versionCount(id)).toBe(2);
    // 늦은 탭은 미리보기도 다시 받아야 한다. 첫 생성 요청을 다시 보내도 409다.
    expect((await call(previewFeedback(req({ base_version_id: v1.id, body: '탭 2' }), ctx(id)))).status).toBe(409);
    expect((await call(createVersion(req({ base_version_id: null }), ctx(id)))).status).toBe(409);
  });

  it('6. 저장된 버전의 원료와 출처는 모두 원료 DB에 있고, 아니면 저장하지 않는다', async () => {
    const id = await newProject('출처 대조');
    state.plan = (prompt) => {
      const plan = goodPlan(prompt);
      plan.ingredient_reasons[0].ingredient_id = 'retinol';
      return plan;
    };
    expect((await call(createVersion(req({ base_version_id: null }), ctx(id)))).status).toBe(502);
    state.plan = (prompt) => {
      const plan = goodPlan(prompt);
      plan.ingredient_reasons[0].source_ids = ['doi:10.1000/made-up'];
      return plan;
    };
    const rejected = await call(createVersion(req({ base_version_id: null }), ctx(id)));
    expect(rejected.status).toBe(502);
    expect(rejected.body.error).toBe('plan_rejected');
    expect(await versionCount(id)).toBe(0);

    state.plan = goodPlan;
    const v1 = await firstVersion(id);
    const [saved] = await rows<{
      plan: { ingredient_reasons: { ingredient_id: string; source_ids: string[] }[] };
      candidates: { ingredient_id: string }[];
    }>(`select plan, candidates from plan_versions where id = $1`, [v1.id]);
    expect(saved.candidates).toHaveLength(5);
    for (const r of saved.plan.ingredient_reasons) {
      const [ing] = await rows<{ sources: { id: string }[] }>(`select sources from ingredients where id = $1`, [r.ingredient_id]);
      expect(ing, r.ingredient_id).toBeDefined();
      const known = ing.sources.map((s) => s.id);
      for (const s of r.source_ids) expect(known).toContain(s);
    }
  });

  it('7. 가중치 합이 100이 아니거나 허용되지 않은 기준이면 422', async () => {
    const id = await newProject('검증');
    const v1 = await firstVersion(id);
    const preview = await call(previewFeedback(req({ base_version_id: v1.id, body: '연구 근거' }), ctx(id)));
    const apply = (criteria: unknown, feedback_id: unknown = preview.body.feedback_id) =>
      call(createVersion(req({ base_version_id: v1.id, feedback_id, criteria }), ctx(id)));
    const good = preview.body.criteria;

    expect((await apply({ ...good, weights: { ...good.weights, research_evidence: 50 } })).status).toBe(422);
    expect((await apply({ ...good, weights: { ...good.weights, price: 0 } })).status).toBe(422);
    expect((await apply({ ...good, required: ['vegan'] })).status).toBe(422);
    expect((await apply({ ...good, season: { ...good.season, climate: 'cold_dry' } })).status).toBe(422);
    expect((await apply(good, null)).status).toBe(422);
    expect((await apply(good, '00000000-0000-0000-0000-0000000000ff')).status).toBe(422);
    expect(await versionCount(id)).toBe(1);

    expect((await apply(good)).status).toBe(201);
  });
});

describe('피드백으로 기획안 고치기', () => {
  const editProposal = (extra: object) => {
    state.proposal = { summary: '요청을 나눴어요.', weights: { research_evidence: 25, season_fit: 30, formulation_fit: 25, market_appeal: 20 }, required: ['concern_match'], concerns: ['soothing', 'sebum', 'antioxidant'], include_ids: [], exclude_ids: [], plan_instruction: '', ...extra };
  };

  it('기준이 그대로여도 수정 요청만으로 새 버전을 만들고, 기획자는 이전 기획안과 요청을 받는다', async () => {
    const id = await newProject('문장 수정');
    const v1 = await firstVersion(id);
    editProposal({ plan_instruction: '콘셉트 문장을 더 고급스럽게 고쳐 주세요.' });
    const preview = await call(previewFeedback(req({ base_version_id: v1.id, body: '콘셉트를 더 고급스럽게' }), ctx(id)));
    expect(preview.status).toBe(201);
    expect(preview.body.plan_instruction).toBe('콘셉트 문장을 더 고급스럽게 고쳐 주세요.');
    expect(preview.events.at(-1)!.changes).toEqual([]);
    expect(await versionCount(id)).toBe(1);

    const prompts: string[] = [];
    state.plan = (prompt) => {
      prompts.push(prompt);
      return goodPlan(prompt);
    };
    // 브라우저가 수정 요청을 바꿔 보내도 feedback 행에 저장한 요청을 쓴다.
    const r = await call(
      createVersion(req({ base_version_id: v1.id, feedback_id: preview.body.feedback_id, criteria: preview.body.criteria, plan_instruction: '무시될 요청' }), ctx(id)),
    );
    expect(r.status).toBe(201);
    expect(prompts[0]).toContain('콘셉트 문장을 더 고급스럽게 고쳐 주세요.');
    expect(prompts[0]).toContain('[이전 버전 기획안]');
    expect(prompts[0]).not.toContain('무시될 요청');
    const [saved] = await rows<{ plan: { edit_request: string } }>(`select plan from plan_versions where id = $1`, [r.body.id]);
    expect(saved.plan.edit_request).toBe('콘셉트 문장을 더 고급스럽게 고쳐 주세요.');
    const [old] = await rows<{ plan: { edit_request?: string } }>(`select plan from plan_versions where id = $1`, [v1.id]);
    expect(old.plan.edit_request).toBeUndefined();
  });

  it('피드백으로 지정한 원료는 후보에 들어가고, 뺀 원료는 빠지고, 그 목록이 버전의 기준에 남는다', async () => {
    const id = await newProject('원료 지정');
    const v1 = await firstVersion(id);
    const [before] = await rows<{ candidates: { ingredient_id: string }[] }>(`select candidates from plan_versions where id = $1`, [v1.id]);
    const drop = before.candidates[0].ingredient_id;
    const all = await rows<{ id: string; name: string }>(`select id, name from ingredients order by id`);
    const add = all.find((i) => !before.candidates.some((c) => c.ingredient_id === i.id))!;

    editProposal({ include_ids: [add.id, 'unicorn-horn'], exclude_ids: [drop] });
    const preview = await call(previewFeedback(req({ base_version_id: v1.id, body: `${add.name}은 넣고 1위 원료는 빼 주세요` }), ctx(id)));
    expect(preview.body.criteria.include).toEqual([{ id: add.id, name: add.name }]);
    expect(preview.body.criteria.exclude.map((r: { id: string }) => r.id)).toEqual([drop]);

    const r = await call(createVersion(req({ base_version_id: v1.id, feedback_id: preview.body.feedback_id, criteria: preview.body.criteria }), ctx(id)));
    expect(r.status).toBe(201);
    const [saved] = await rows<{ criteria: { include: { id: string }[] }; candidates: { ingredient_id: string; pinned?: boolean }[] }>(
      `select criteria, candidates from plan_versions where id = $1`,
      [r.body.id],
    );
    const ids = saved.candidates.map((c) => c.ingredient_id);
    expect(ids).toContain(add.id);
    expect(ids).not.toContain(drop);
    expect(saved.candidates.find((c) => c.ingredient_id === add.id)!.pinned).toBe(true);
    expect(saved.criteria.include).toEqual([{ id: add.id, name: add.name }]);
  });

  it('원료 DB에 없는 원료를 지정해 적용하면 422이고 저장하지 않는다', async () => {
    const id = await newProject('없는 원료');
    const v1 = await firstVersion(id);
    editProposal({});
    const preview = await call(previewFeedback(req({ base_version_id: v1.id, body: '그대로' }), ctx(id)));
    const r = await call(
      createVersion(
        req({ base_version_id: v1.id, feedback_id: preview.body.feedback_id, criteria: { ...preview.body.criteria, include: [{ id: 'unicorn-horn', name: '유니콘 뿔' }] } }),
        ctx(id),
      ),
    );
    expect(r.status).toBe(422);
    expect(await versionCount(id)).toBe(1);
  });
});

describe('프로젝트 삭제', () => {
  const del = (id: string) => call(deleteProject(new Request('http://test', { method: 'DELETE' }), ctx(id)));
  const count = async (table: string, id: string) =>
    (await rows<{ n: number }>(`select count(*)::int as n from ${table} where ${table === 'projects' ? 'id' : 'project_id'} = $1`, [id]))[0].n;

  it('소유자가 지우면 프로젝트와 버전, 피드백, 상세이미지가 함께 지워진다', async () => {
    const id = await newProject('지울 프로젝트');
    const keep = await newProject('남길 프로젝트');
    const v1 = await firstVersion(id);
    await firstVersion(keep);
    await call(previewFeedback(req({ base_version_id: v1.id, body: '연구 근거' }), ctx(id)));
    const mine = [...uploadedFiles].filter((p) => p.includes(`/${id}/`));
    expect(mine).toHaveLength(3);

    expect((await del(id)).status).toBe(200);
    expect(await count('projects', id)).toBe(0);
    expect(await count('plan_versions', id)).toBe(0);
    expect(await count('feedback', id)).toBe(0);
    for (const p of mine) expect(uploadedFiles.has(p)).toBe(false);
    // 다른 프로젝트는 그대로다.
    expect(await count('plan_versions', keep)).toBe(1);
    expect([...uploadedFiles].filter((p) => p.includes(`/${keep}/`))).toHaveLength(3);
    expect((await del(id)).status).toBe(404);
  });

  it('다른 사용자는 지울 수 없고 404를 받는다', async () => {
    const id = await newProject('남의 프로젝트');
    await firstVersion(id);
    login(USER_B);
    expect((await del(id)).status).toBe(404);
    login(null);
    expect((await del(id)).status).toBe(401);
    expect(await count('projects', id)).toBe(1);
    expect(await count('plan_versions', id)).toBe(1);
  });
});

describe('진행 이벤트와 상세페이지', () => {
  it('피드백 미리보기는 feedback 테이블에만 쓰고, 기준이 어떤 값에서 어떤 값으로 바뀌는지 알려 준다', async () => {
    const id = await newProject('이벤트');
    const v1 = await firstVersion(id);
    const r = await call(previewFeedback(req({ base_version_id: v1.id, body: '연구 근거를 더 중요하게' }), ctx(id)));
    expect(r.events.filter((e) => e.status !== 'start').map((e) => e.step)).toEqual(['receive', 'criteria', 'interpret', 'propose']);
    const propose = r.events.at(-1)!;
    expect(propose.changes).toContainEqual({ label: '연구 근거', from: '25%', to: '40%' });
    expect(propose.db).toEqual([expect.objectContaining({ store: 'feedback', op: 'insert' })]);
    expect(r.events.flatMap((e) => e.db ?? []).some((d) => d.store === 'plan_versions' && d.op !== 'read')).toBe(false);
  });

  it('새 버전 저장은 plan_versions에 행을 추가하고 feedback의 상태를 바꾼다고 알려 준다', async () => {
    const id = await newProject('저장 이벤트');
    const v1 = await firstVersion(id);
    const preview = await call(previewFeedback(req({ base_version_id: v1.id, body: '연구 근거' }), ctx(id)));
    const r = await call(
      createVersion(req({ base_version_id: v1.id, feedback_id: preview.body.feedback_id, criteria: preview.body.criteria }), ctx(id)),
    );
    expect(r.status).toBe(201);
    expect(r.events.filter((e) => e.status !== 'start').map((e) => e.step)).toEqual([
      'receive', 'criteria', 'research_query', 'research_brief', 'plan_write', 'review_verify', 'review_critique', 'detail_copy', 'detail_image', 'save',
    ]);
    const save = r.events.at(-1)!;
    expect(save.changes).toContainEqual({ label: '연구 근거', from: '25%', to: '40%' });
    expect(save.db!.map((d) => `${d.store}:${d.op}`)).toEqual(['plan_versions:insert', 'feedback:update']);
  });

  it('상세페이지가 기획안과 함께 저장되고, 상세이미지는 자기 폴더에 올라간다', async () => {
    const id = await newProject('상세페이지');
    const v1 = await firstVersion(id);
    const [saved] = await rows<{ plan: { detail_page: { headline: string; sections: { image_path: string }[] }; review: { approved: boolean } } }>(
      `select plan from plan_versions where id = $1`,
      [v1.id],
    );
    expect(saved.plan.detail_page.headline).toBe('헤드라인');
    expect(saved.plan.review.approved).toBe(true);
    const paths = saved.plan.detail_page.sections.map((s) => s.image_path);
    expect(paths).toHaveLength(3);
    for (const p of paths) {
      expect(p.startsWith(`${USER_A}/${id}/`)).toBe(true);
      expect(uploadedFiles.has(p)).toBe(true);
    }
  });

  it('이미지 생성이 실패해도 기획안은 저장된다', async () => {
    const id = await newProject('이미지 실패');
    state.image = async () => {
      throw new Error('OPENAI_API_KEY가 설정되지 않았어요.');
    };
    const r = await call(createVersion(req({ base_version_id: null }), ctx(id)));
    expect(r.status).toBe(201);
    expect(r.events.find((e) => e.step === 'detail_image' && e.status === 'error')!.note).toContain('OPENAI_API_KEY');
    expect(uploadedFiles.size).toBe(0);
  });

  it('저장 단계에서 409가 나면 이미 올린 상세이미지를 지운다', async () => {
    const id = await newProject('저장 실패 정리');
    // 기획안을 쓰는 사이에 다른 탭이 먼저 v1을 저장한 상황.
    state.plan = async (prompt: string) => {
      await asAdmin(db);
      await db.query(`insert into plan_versions (project_id, version_no, criteria, plan, candidates) values ($1, 1, '{}', '{}', '[]')`, [id]);
      return goodPlan(prompt);
    };
    const r = await call(createVersion(req({ base_version_id: null }), ctx(id)));
    expect(r.status).toBe(409);
    expect(r.events.at(-1)).toMatchObject({ step: 'save', status: 'error' });
    expect(uploadedFiles.size).toBe(0);
    expect(await versionCount(id)).toBe(1);
  });
});

describe('그 밖의 경계', () => {
  it('조건에 맞는 원료 후보가 3개 미만이면 422로 멈추고 저장하지 않는다', async () => {
    const id = await newProject('후보 부족', 1, 'cream');
    const v1 = await firstVersion(id);
    state.proposal = {
      summary: '조건을 강화했어요.',
      weights: WEIGHTS_40,
      required: ['concern_match', 'evidence_strong', 'low_irritation'],
      concerns: ['sebum'],
    };
    const preview = await call(previewFeedback(req({ base_version_id: v1.id, body: '근거 강하고 순한 피지 원료만' }), ctx(id)));
    const r = await call(
      createVersion(req({ base_version_id: v1.id, feedback_id: preview.body.feedback_id, criteria: preview.body.criteria }), ctx(id)),
    );
    expect(r.status).toBe(422);
    expect(r.body.error).toBe('insufficient_candidates');
    expect(await versionCount(id)).toBe(1);
  });

  it('빈 피드백은 422, 버전이 없는 프로젝트의 피드백은 409', async () => {
    const id = await newProject('피드백 경계');
    expect((await call(previewFeedback(req({ base_version_id: null, body: '첫 버전 전' }), ctx(id)))).status).toBe(409);
    const v1 = await firstVersion(id);
    expect((await call(previewFeedback(req({ base_version_id: v1.id, body: '   ' }), ctx(id)))).status).toBe(422);
  });
});
