// DELETE /api/projects/[id] — 프로젝트 삭제. 버전과 피드백은 외래 키(on delete cascade)로 함께 지워진다.
import { NextResponse } from 'next/server';
import { IMAGE_BUCKET, NOT_FOUND, fail, findProject, getSession } from '@/lib/api';
import type { Plan } from '@/lib/plan';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return fail(401, 'unauthorized', '로그인이 필요해요.');
  const { supabase } = session;

  const project = await findProject(supabase, (await params).id);
  if (!project) return NOT_FOUND();

  // 행을 지우면 경로를 알 수 없으므로 상세이미지 경로를 먼저 모아 둔다.
  const { data: versions } = await supabase.from('plan_versions').select('plan').eq('project_id', project.id);
  const images = ((versions ?? []) as { plan: Plan }[])
    .flatMap((v) => v.plan.detail_page?.sections.map((s) => s.image_path) ?? [])
    .filter((p): p is string => !!p);

  const { error } = await supabase.from('projects').delete().eq('id', project.id);
  if (error) return fail(500, 'db_error', '프로젝트를 지우지 못했어요.');

  // 이미지 삭제가 실패해도 프로젝트는 이미 지워졌다. 남은 파일은 어느 화면에서도 보이지 않는다.
  if (images.length > 0) await supabase.storage.from(IMAGE_BUCKET).remove(images);
  return NextResponse.json({ ok: true });
}
