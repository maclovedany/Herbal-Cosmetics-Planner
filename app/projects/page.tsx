import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DeleteProjectButton } from '@/components/DeleteProjectButton';
import { getSession, type ProjectRow } from '@/lib/api';
import { MARKETS, PRODUCT_TYPES } from '@/lib/domain';

type ListRow = ProjectRow & { plan_versions: { version_no: number }[] };
const date = (iso: string) => new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' });

export default async function ProjectsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const { data, error } = await session.supabase
    .from('projects')
    .select('id, name, market, launch_month, product_type, created_at, plan_versions(version_no)')
    .order('created_at', { ascending: false });
  const projects = (data ?? []) as unknown as ListRow[];

  return (
    <div className="projects-bg">
      <main className="stack lg">
        <div className="row between">
          <h1>내 프로젝트</h1>
          <Link className="btn shine" href="/projects/new">
            새 프로젝트
          </Link>
        </div>
        {error && <p className="notice error">프로젝트를 불러오지 못했어요. Supabase에 SQL을 실행했는지 확인해 주세요.</p>}
        {!error && projects.length === 0 && (
          <div className="card stack">
            <p>아직 프로젝트가 없어요.</p>
            <p className="muted small">출시 시장, 출시 월, 제품 유형을 정하면 계절에 맞는 한방 유래 원료로 첫 기획안을 만들어요.</p>
          </div>
        )}
        <div className="cards">
          {projects.map((p) => {
            const latest = Math.max(0, ...p.plan_versions.map((v) => v.version_no));
            return (
              <article key={p.id} className="card pcard">
                <div className="row between">
                  <span className="eyebrow">
                    {MARKETS[p.market]} · {p.launch_month}월 출시
                  </span>
                  <span className={`pbadge ${latest > 0 ? 'on' : ''}`}>{latest > 0 ? `v${latest}` : '준비 중'}</span>
                </div>
                <h2>
                  {/* 카드 전체가 이 링크로 눌린다. 삭제 버튼만 그 위에 올라온다. */}
                  <Link href={`/projects/${p.id}`} className="plink">
                    {p.name}
                  </Link>
                </h2>
                <div className="row">
                  <span className="chip gold">{PRODUCT_TYPES[p.product_type].label}</span>
                  <span className="small muted">{latest > 0 ? `최신 기획안 v${latest}` : '첫 기획안을 아직 만들지 않았어요'}</span>
                </div>
                <div className="row between pfoot">
                  <span className="small muted">생성일 {date(p.created_at)}</span>
                  <span className="row">
                    <DeleteProjectButton id={p.id} name={p.name} />
                    <span className="pgo">열기 →</span>
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      </main>
    </div>
  );
}
