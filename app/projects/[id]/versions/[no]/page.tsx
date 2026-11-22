import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { CriteriaView } from '@/components/CriteriaView';
import { PlanView } from '@/components/PlanView';
import { VersionCompare } from '@/components/VersionCompare';
import { findProject, getSession, signDetailImages, type VersionRow } from '@/lib/api';

// 버전 하나를 보여 준다. 이전 버전이 있으면 두 기획안을 좌우로 나란히 놓고 비교한다.
export default async function VersionPage(props: { params: Promise<{ id: string; no: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');
  const { supabase } = session;

  const { id, no } = await props.params;
  const project = await findProject(supabase, id);
  const versionNo = Number(no);
  if (!project || !Number.isInteger(versionNo) || versionNo < 1) notFound();

  const { data } = await supabase
    .from('plan_versions')
    .select('*')
    .eq('project_id', project.id)
    .in('version_no', [versionNo, versionNo - 1]);
  const rows = (data ?? []) as VersionRow[];
  const version = rows.find((v) => v.version_no === versionNo);
  const previous = rows.find((v) => v.version_no === versionNo - 1);
  if (!version) notFound();

  const images = await signDetailImages(supabase, [version.plan, previous?.plan]);

  return (
    <div className="project-bg">
      <main className="wide stack lg">
        <div className="stack">
          <Link href={`/projects/${project.id}`} className="small">
            ← {project.name}
          </Link>
          <h1>{previous ? `v${previous.version_no}과 v${version.version_no} 비교` : `v${version.version_no} 기획안`}</h1>
        </div>

        {previous ? (
          <VersionCompare previous={previous} version={version} images={images} />
        ) : (
          <div className="grid2">
            <div className="card">
              <PlanView plan={version.plan} candidates={version.candidates} images={images} />
            </div>
            <div className="card stack">
              <h2>이 버전의 평가 기준</h2>
              <CriteriaView criteria={version.criteria} />
              <p className="muted small">첫 버전이라 비교할 이전 버전이 없어요.</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
