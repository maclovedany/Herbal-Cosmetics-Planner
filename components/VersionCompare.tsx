import { CriteriaView } from '@/components/CriteriaView';
import { PlanCandidates, PlanCautions, PlanConcept, PlanDetail, PlanReasons, PlanReview } from '@/components/PlanView';
import { diffCriteria, type Criteria } from '@/lib/criteria';
import type { Plan } from '@/lib/plan';
import type { Candidate } from '@/lib/scoring';

type Version = { version_no: number; created_at: string; criteria: Criteria; plan: Plan; candidates: Candidate[] };

const date = (iso: string) => new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' });
const none = (what: string) => <p className="muted small">이 버전에는 {what} 없어요.</p>;

// 두 버전의 기획안을 부분별로 좌우에 나란히 놓는다. 왼쪽이 이전 버전, 오른쪽이 이 버전.
export function VersionCompare({ previous, version, images }: { previous: Version; version: Version; images: Record<string, string> }) {
  const changes = diffCriteria(previous.criteria, version.criteria);
  const row = (title: string, left: React.ReactNode, right: React.ReactNode) => (
    <section className="stack">
      <h2>{title}</h2>
      <div className="grid2 cmp">
        <div className="card stack">
          <p className="eyebrow">v{previous.version_no}</p>
          {left}
        </div>
        <div className="card stack now">
          <p className="eyebrow">v{version.version_no}</p>
          {right}
        </div>
      </div>
    </section>
  );

  return (
    <div className="stack lg">
      <div className="card stack">
        <h2>
          v{previous.version_no} → v{version.version_no}에서 바뀐 기준
        </h2>
        {changes.length === 0 ? (
          <p className="muted small">기준은 그대로예요.</p>
        ) : (
          <ul className="pchanges">
            {changes.map((c) => (
              <li key={c.label}>
                {c.label} <b>{c.from} → {c.to}</b>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid2 cmphead">
        <p>
          <strong>v{previous.version_no}</strong> <span className="muted small">이전 버전 · {date(previous.created_at)}</span>
        </p>
        <p>
          <strong>v{version.version_no}</strong> <span className="muted small">이 버전 · {date(version.created_at)}</span>
        </p>
      </div>

      {row('평가 기준', <CriteriaView criteria={previous.criteria} />, <CriteriaView criteria={version.criteria} previous={previous.criteria} />)}
      {row('콘셉트', <PlanConcept plan={previous.plan} />, <PlanConcept plan={version.plan} />)}
      {row(
        '원료 후보',
        <PlanCandidates candidates={previous.candidates} other={version.candidates} side="old" />,
        <PlanCandidates candidates={version.candidates} other={previous.candidates} side="new" />,
      )}
      {row(
        '추천 이유와 근거',
        <PlanReasons plan={previous.plan} candidates={previous.candidates} />,
        <PlanReasons plan={version.plan} candidates={version.candidates} />,
      )}
      {row('출시 전 확인할 점', <PlanCautions plan={previous.plan} />, <PlanCautions plan={version.plan} />)}
      {row(
        '검토 결과',
        previous.plan.review ? <PlanReview review={previous.plan.review} /> : none('검토 결과가'),
        version.plan.review ? <PlanReview review={version.plan.review} /> : none('검토 결과가'),
      )}
      {row(
        '상세페이지 시안',
        previous.plan.detail_page ? <PlanDetail detail={previous.plan.detail_page} images={images} /> : none('상세페이지가'),
        version.plan.detail_page ? <PlanDetail detail={version.plan.detail_page} images={images} /> : none('상세페이지가'),
      )}
    </div>
  );
}
