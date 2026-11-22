import { WEIGHTS, WEIGHT_KEYS } from '@/lib/criteria';
import type { Plan } from '@/lib/plan';
import type { Candidate } from '@/lib/scoring';

// 기획안 문서의 각 부분. PlanView는 한 버전을 통째로 보여 주고, VersionCompare는 부분별로 두 버전을 나란히 놓는다.

export function PlanConcept({ plan }: { plan: Plan }) {
  return (
    <div className="stack">
      <h2>{plan.concept_name}</h2>
      <p>{plan.concept}</p>
      <p className="small">
        <span className="eyebrow">타깃 </span>
        {plan.target}
      </p>
      <ul>
        {plan.key_claims.map((c, i) => (
          <li key={i}>{c}</li>
        ))}
      </ul>
    </div>
  );
}

// other를 주면 다른 버전의 후보와 견줘 표시를 붙인다. side가 new면 새로 들어옴·순위 변동, old면 빠짐.
export function PlanCandidates(props: { candidates: Candidate[]; other?: Candidate[]; side?: 'old' | 'new' }) {
  const other = props.other && new Map(props.other.map((c) => [c.ingredient_id, c]));
  const mark = (c: Candidate) => {
    if (!other) return null;
    const o = other.get(c.ingredient_id);
    if (props.side === 'old') return o ? null : <span className="chip warn">다음 버전에서 빠짐</span>;
    if (!o) return <span className="chip">새로 들어옴</span>;
    return o.rank === c.rank ? null : (
      <span className="changed small">
        {o.rank}위 → {c.rank}위
      </span>
    );
  };
  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            <th>순위</th>
            <th>원료</th>
            {WEIGHT_KEYS.map((k) => (
              <th key={k} className="num">
                {WEIGHTS[k]}
              </th>
            ))}
            <th className="num">총점</th>
          </tr>
        </thead>
        <tbody>
          {props.candidates.map((c) => (
            <tr key={c.ingredient_id}>
              <td>{c.rank}</td>
              <td>
                {c.name} {c.pinned && <span className="chip gold">지정</span>} {mark(c)}
                <div className="muted small">{c.name_en}</div>
              </td>
              {WEIGHT_KEYS.map((k) => (
                <td key={k} className="num">
                  {c.scores[k]}
                </td>
              ))}
              <td className="num">
                <strong>{c.total}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PlanReasons({ plan, candidates }: { plan: Plan; candidates: Candidate[] }) {
  const research = new Map((plan.research ?? []).map((n) => [n.ingredient_id, n.summary]));
  const byId = new Map(candidates.map((c) => [c.ingredient_id, c]));
  const reasons = [...plan.ingredient_reasons].sort(
    (a, b) => (byId.get(a.ingredient_id)?.rank ?? 0) - (byId.get(b.ingredient_id)?.rank ?? 0),
  );
  return (
    <div>
      {reasons.map((r) => {
        const c = byId.get(r.ingredient_id);
        if (!c) return null;
        return (
          <div key={r.ingredient_id} className="reason">
            <p>
              <strong>
                {c.rank}. {c.name}
              </strong>{' '}
              <span className="muted small">
                {c.herbal_name} · {c.actives.join(', ')}
              </span>
            </p>
            <p>{r.reason}</p>
            {research.get(r.ingredient_id) && (
              <p className="small muted">
                <span className="eyebrow">리서처 메모 </span>
                {research.get(r.ingredient_id)}
              </p>
            )}
            <ul className="sources">
              {c.sources
                .filter((s) => r.source_ids.includes(s.id))
                .map((s) => (
                  <li key={s.id}>
                    [{s.type}] {s.title}
                    {s.note ? ` (${s.note})` : ''}
                  </li>
                ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function PlanCautions({ plan }: { plan: Plan }) {
  return (
    <ul>
      {plan.cautions.map((c, i) => (
        <li key={i}>{c}</li>
      ))}
    </ul>
  );
}

export function PlanReview({ review }: { review: NonNullable<Plan['review']> }) {
  return (
    <div className="stack">
      <p className={`notice ${review.approved ? 'info' : 'warn'}`}>
        {review.approved
          ? `검토자가 통과시켰어요.${review.rounds > 1 ? ' 의견을 반영해 한 번 고쳐 쓴 기획안이에요.' : ''}`
          : `고쳐 쓴 뒤에도 검토 의견 ${review.issues.length}건이 남았어요. 확인하고 피드백으로 다듬어 주세요.`}
      </p>
      {!review.approved && (
        <ul className="small">
          {review.issues.map((issue, i) => (
            <li key={i}>{issue}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// images는 상세이미지 경로 → 볼 수 있는 주소.
export function PlanDetail({ detail, images = {} }: { detail: NonNullable<Plan['detail_page']>; images?: Record<string, string> }) {
  return (
    <div className="detail">
      <div className="detail-hero">
        <p className="detail-headline">{detail.headline}</p>
        <p>{detail.subcopy}</p>
      </div>
      {detail.sections.map((s, i) => {
        const url = s.image_path ? images[s.image_path] : undefined;
        return (
          <div key={i} className="detail-section">
            {url ? (
              <img src={url} alt={s.title} loading="lazy" />
            ) : (
              <div className="detail-noimage">
                <p className="eyebrow">상세이미지 없음</p>
                <p className="small">{s.image_path ? '이미지 주소를 만들지 못했어요.' : '이미지를 만들지 못해 문안만 실었어요.'}</p>
              </div>
            )}
            <p className="detail-title">{s.title}</p>
            <p>{s.body}</p>
          </div>
        );
      })}
    </div>
  );
}

export function PlanView({ plan, candidates, images }: { plan: Plan; candidates: Candidate[]; images?: Record<string, string> }) {
  return (
    <div className="stack lg">
      {plan.edit_request && (
        <p className="notice info small">
          <strong>이 버전에 반영한 수정 요청</strong> {plan.edit_request}
        </p>
      )}
      <PlanConcept plan={plan} />
      <section className="stack">
        <h3>원료 후보</h3>
        <PlanCandidates candidates={candidates} />
      </section>
      <section>
        <h3>추천 이유와 근거</h3>
        <PlanReasons plan={plan} candidates={candidates} />
      </section>
      {plan.cautions.length > 0 && (
        <section className="stack">
          <h3>출시 전 확인할 점</h3>
          <PlanCautions plan={plan} />
        </section>
      )}
      {plan.review && (
        <section className="stack">
          <h3>검토 결과</h3>
          <PlanReview review={plan.review} />
        </section>
      )}
      {plan.detail_page && (
        <section className="stack">
          <h3>상세페이지 시안</h3>
          <PlanDetail detail={plan.detail_page} images={images} />
        </section>
      )}
    </div>
  );
}
