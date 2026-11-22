import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ProjectWorkspace } from '@/components/ProjectWorkspace';
import { findLatestVersion, findProject, getSession, signDetailImages } from '@/lib/api';
import { MARKETS, PRODUCT_TYPES } from '@/lib/domain';

export default async function ProjectPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ start?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  const { supabase } = session;

  const project = await findProject(supabase, (await props.params).id);
  if (!project) notFound();
  const { start } = await props.searchParams;

  const latest = await findLatestVersion(supabase, project.id);
  const { data: history } = await supabase
    .from('plan_versions')
    .select('version_no, created_at')
    .eq('project_id', project.id)
    .order('version_no', { ascending: false });
  const images = await signDetailImages(supabase, [latest?.plan]);

  return (
    <div className="project-bg">
      <main className="wide stack lg">
        <div className="stack">
          <Link href="/projects" className="small">
            ← 내 프로젝트
          </Link>
          <h1>{project.name}</h1>
          <div className="row">
            <span className="chip plain">{MARKETS[project.market]}</span>
            <span className="chip plain">{project.launch_month}월 출시</span>
            <span className="chip plain">{PRODUCT_TYPES[project.product_type].label}</span>
          </div>
        </div>
        <ProjectWorkspace
          projectId={project.id}
          initialCriteria={project.initial_criteria}
          latest={latest}
          history={history ?? []}
          images={images}
          autoStart={start === '1'}
        />
      </main>
    </div>
  );
}
