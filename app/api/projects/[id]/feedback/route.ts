// POST /api/projects/[id]/feedback — 피드백 미리보기. 기준은 바꾸지 않고 변경안만 저장해 돌려준다.
// 입력 확인까지는 일반 JSON 오류로 답하고, 그 뒤로는 단계별 진행 이벤트를 흘려보낸다.
import { CONFLICT, NOT_FOUND, fail, findLatestVersion, findProject, getSession, readJson } from '@/lib/api';
import { diffCriteria, sanitizeProposal } from '@/lib/criteria';
import { FEEDBACK_SCHEMA, buildFeedbackPrompt } from '@/lib/llm/feedback';
import { LlmError, generateJson } from '@/lib/llm/gemini';
import { runStep } from '@/lib/pipeline';
import { PipelineError, streamPipeline } from '@/lib/stream';

export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return fail(401, 'unauthorized', '로그인이 필요해요.');
  const { supabase } = session;

  const project = await findProject(supabase, (await params).id);
  if (!project) return NOT_FOUND();

  const body = await readJson(request);
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  if (text.length < 1 || text.length > 2000) return fail(422, 'invalid', '피드백을 1~2000자로 입력해 주세요.');

  const latest = await findLatestVersion(supabase, project.id);
  if (!latest || latest.id !== body.base_version_id) return CONFLICT();

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
      note: `v${latest.version_no}의 기준이 이 프로젝트의 현재 기준이에요.`,
      db: [{ store: 'plan_versions', op: 'read', note: `v${latest.version_no} 행의 criteria 열에서 현재 기준을 읽었어요.` }],
    });

    const raw = await runStep(emit, 'interpret', async () => {
      try {
        const value = await generateJson(buildFeedbackPrompt(latest.criteria, latest.plan.concept_name, text), FEEDBACK_SCHEMA);
        const summary = typeof (value as { summary?: unknown })?.summary === 'string' ? (value as { summary: string }).summary : '';
        return { value, note: summary || '피드백을 평가 기준 변경안으로 바꿨어요.' };
      } catch (e) {
        if (e instanceof LlmError) throw new PipelineError(502, 'llm_error', `피드백을 해석하지 못했어요. ${e.message}`);
        throw e;
      }
    });
    const summary = typeof (raw as { summary?: unknown })?.summary === 'string' ? (raw as { summary: string }).summary : '';

    return runStep(emit, 'propose', async () => {
      const criteria = sanitizeProposal(raw, latest.criteria);
      const changes = diffCriteria(latest.criteria, criteria);
      const { data, error } = await supabase
        .from('feedback')
        .insert({ project_id: project.id, base_version_id: latest.id, body: text, proposed_changes: { criteria, summary } })
        .select('id')
        .single();
      if (error) throw new PipelineError(500, 'db_error', '피드백을 저장하지 못했어요.');
      return {
        value: { status: 201, feedback_id: data.id as string, criteria, summary },
        note:
          changes.length > 0
            ? `허용된 항목만 남기고 가중치 합을 100으로 맞췄어요. 바뀌는 항목은 ${changes.length}개예요. 아직 기준은 바뀌지 않았어요.`
            : '바뀌는 항목이 없어요. 현재 기준 그대로예요.',
        changes,
        db: [
          {
            store: 'feedback' as const,
            op: 'insert' as const,
            note: '피드백 원문과 변경안을 proposed_changes 열에 저장했어요 (status = proposed). plan_versions는 건드리지 않았어요.',
          },
        ],
      };
    });
  });
}
