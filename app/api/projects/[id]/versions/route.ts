// POST /api/projects/[id]/versions — 첫 기획안 생성 또는 피드백 적용 후 새 버전 생성.
// 입력 확인까지는 일반 JSON 오류로 답하고, 그 뒤로는 단계별 진행 이벤트를 흘려보낸다.
import { randomUUID } from 'node:crypto';
import { CONFLICT, IMAGE_BUCKET, NOT_FOUND, fail, findLatestVersion, findProject, getSession, isUuid, readJson } from '@/lib/api';
import { diffCriteria, resolveRefs, validateCriteria, type Criteria, type IngredientRef } from '@/lib/criteria';
import { readInstruction } from '@/lib/llm/feedback';
import { climateFor } from '@/lib/domain';
import { InsufficientCandidatesError, PlanVerificationError, runPlanPipeline } from '@/lib/generate';
import { LlmError } from '@/lib/llm/gemini';
import { generateImage } from '@/lib/llm/openai';
import type { Ingredient } from '@/lib/scoring';
import { PipelineError, streamPipeline } from '@/lib/stream';

export const maxDuration = 300;

const CONFLICT_MESSAGE = '다른 곳에서 새 버전이 만들어졌어요. 최신 버전을 확인해 주세요.';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return fail(401, 'unauthorized', '로그인이 필요해요.');
  const { supabase, user } = session;

  const project = await findProject(supabase, (await params).id);
  if (!project) return NOT_FOUND();

  const body = await readJson(request);
  const baseVersionId = (body.base_version_id ?? null) as string | null;
  const latest = await findLatestVersion(supabase, project.id);
  if ((latest?.id ?? null) !== baseVersionId) return CONFLICT();

  // 첫 생성은 프로젝트의 초기 기준을 쓴다. 그 뒤로는 피드백 미리보기에서 확인한 기준만 받는다.
  let criteria: Criteria;
  let feedbackId: string | null = null;
  // 피드백 미리보기에서 저장해 둔 기획안 수정 요청. 브라우저가 보낸 값이 아니라 feedback 행에서 읽는다.
  let instruction = '';
  if (!latest) {
    criteria = project.initial_criteria;
  } else {
    if (!isUuid(body.feedback_id)) return fail(422, 'invalid', '적용할 피드백이 없어요.');
    feedbackId = body.feedback_id;
    const checked = validateCriteria(body.criteria);
    if (!checked.ok) return fail(422, 'invalid_criteria', checked.error);
    if (checked.criteria.season.climate !== climateFor(project.market, project.launch_month)) {
      return fail(422, 'invalid_criteria', '계절 조건은 출시 시장과 출시 월로 정해져요.');
    }
    // 지정·제외 원료는 원료 DB에 있는 것만 받는다.
    const { data: catalog } = await supabase.from('ingredients').select('id, name');
    const resolved = resolveRefs(checked.criteria, (catalog ?? []) as IngredientRef[]);
    if (!resolved) return fail(422, 'invalid_criteria', '원료 DB에 없는 원료는 지정하거나 뺄 수 없어요.');
    criteria = resolved;
    const { data: feedback } = await supabase
      .from('feedback')
      .select('id, proposed_changes')
      .eq('id', feedbackId)
      .eq('project_id', project.id)
      .eq('base_version_id', latest.id)
      .eq('status', 'proposed')
      .maybeSingle();
    if (!feedback) return fail(422, 'invalid', '이 피드백은 이미 적용했거나 취소했어요.');
    instruction = readInstruction(feedback.proposed_changes);
  }

  const changes = latest ? diffCriteria(latest.criteria, criteria) : [];
  const nextNo = (latest?.version_no ?? 0) + 1;
  const folder = `${user.id}/${project.id}/${randomUUID()}`;
  const uploaded: string[] = [];

  return streamPipeline(async (emit) => {
    emit({
      type: 'step',
      step: 'receive',
      status: 'done',
      note: `"${project.name}" 프로젝트의 소유자인지 확인했어요.`,
      db: [{ store: 'projects', op: 'read', note: '로그인한 사용자의 프로젝트인지 확인했어요.' }],
    });
    emit({
      type: 'step',
      step: 'criteria',
      status: 'done',
      note: latest
        ? `v${latest.version_no}의 기준에서 ${changes.length}개 항목을 바꿔 v${nextNo}을 만들어요.${instruction ? ' 피드백의 기획안 수정 요청도 기획자에게 넘겨요.' : ''}`
        : '프로젝트의 초기 평가 기준으로 v1을 만들어요.',
      changes,
      db: latest
        ? [
            { store: 'plan_versions', op: 'read', note: `v${latest.version_no} 행의 criteria 열에서 현재 기준을 읽었어요.` },
            { store: 'feedback', op: 'read', note: 'proposed_changes 열에서 기획안 수정 요청을 읽었어요.' },
          ]
        : [{ store: 'projects', op: 'read', note: 'initial_criteria 열에서 초기 기준을 읽었어요.' }],
    });

    try {
      const { data: ingredients, error: readError } = await supabase.from('ingredients').select('id, name, traits, sources');
      if (readError) throw new PipelineError(500, 'db_error', '원료를 불러오지 못했어요.');

      const prepared = await runPlanPipeline({
        project,
        criteria,
        ingredients: ingredients as Ingredient[],
        emit,
        edit: latest && instruction ? { previous: latest.plan, instruction } : undefined,
        images: {
          generate: generateImage,
          async store(index, bytes) {
            const path = `${folder}/${index + 1}.png`;
            const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, bytes, { contentType: 'image/png' });
            if (error) {
              throw new Error(
                /bucket not found/i.test(error.message)
                  ? '이미지는 만들었지만 올릴 저장소(detail-images 버킷)가 없어요. Supabase SQL Editor에서 supabase/migrations/0002_detail_images.sql을 실행해 주세요.'
                  : `이미지를 저장소에 올리지 못했어요. (${error.message})`,
              );
            }
            uploaded.push(path);
            return path;
          },
        },
      });

      emit({ type: 'step', step: 'save', status: 'start' });
      const { data: saved, error } = await supabase.rpc('create_plan_version', {
        p_project_id: project.id,
        p_base_version_id: baseVersionId,
        p_feedback_id: feedbackId,
        p_criteria: criteria,
        p_plan: prepared.plan,
        p_candidates: prepared.candidates,
      });
      if (error) {
        const failure =
          error.code === 'PV409' || error.code === '23505'
            ? new PipelineError(409, 'version_conflict', CONFLICT_MESSAGE)
            : error.code === 'PJ404'
              ? new PipelineError(404, 'not_found', '프로젝트를 찾을 수 없어요.')
              : error.code === 'PF422'
                ? new PipelineError(422, 'invalid', '이 피드백은 이미 적용했거나 취소했어요.')
                : new PipelineError(500, 'db_error', '기획안을 저장하지 못했어요.');
        emit({ type: 'step', step: 'save', status: 'error', note: failure.message });
        throw failure;
      }
      emit({
        type: 'step',
        step: 'save',
        status: 'done',
        note: `v${saved.version_no}을 저장했어요.${latest ? ` v${latest.version_no} 행은 고치지 않고 그대로 남아요.` : ''}`,
        changes,
        db: [
          {
            store: 'plan_versions',
            op: 'insert',
            note: `v${saved.version_no} 행을 추가했어요. criteria 열에 이 버전의 기준, plan 열에 기획안과 상세페이지, candidates 열에 원료 후보가 들어가요.`,
          },
          ...(feedbackId
            ? [{ store: 'feedback' as const, op: 'update' as const, note: `status를 proposed → applied로 바꾸고 result_version_id에 v${saved.version_no}을 연결했어요.` }]
            : []),
        ],
      });
      return { status: 201, id: saved.id, version_no: saved.version_no };
    } catch (e) {
      // 저장하지 못했으면 이미 올린 상세이미지를 지운다.
      if (uploaded.length > 0) await supabase.storage.from(IMAGE_BUCKET).remove(uploaded);
      if (e instanceof InsufficientCandidatesError) throw new PipelineError(422, 'insufficient_candidates', e.message);
      if (e instanceof LlmError) throw new PipelineError(502, 'llm_error', `기획안을 만들지 못했어요. ${e.message}`);
      if (e instanceof PlanVerificationError) {
        throw new PipelineError(502, 'plan_rejected', `AI가 쓴 기획안이 원료 DB와 맞지 않아 저장하지 않았어요. ${e.message}`);
      }
      throw e;
    }
  });
}
