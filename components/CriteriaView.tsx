import { REQUIRED, WEIGHTS, WEIGHT_KEYS, type Criteria } from '@/lib/criteria';
import { CLIMATES, CONCERNS } from '@/lib/domain';

// 평가 기준 표시. previous를 주면 그 버전에서 바뀐 가중치를 "25% → 40%"로 보여 준다.
export function CriteriaView({ criteria, previous }: { criteria: Criteria; previous?: Criteria }) {
  return (
    <div className="stack">
      <div className="row">
        <span className="chip plain">{CLIMATES[criteria.season.climate]}</span>
        {criteria.season.concerns.map((c) => (
          <span key={c} className="chip">
            {CONCERNS[c]}
          </span>
        ))}
      </div>
      <div className="weights">
        {WEIGHT_KEYS.map((k) => {
          const before = previous?.weights[k];
          const changed = before !== undefined && before !== criteria.weights[k];
          return (
            <div key={k} style={{ display: 'contents' }}>
              <span>{WEIGHTS[k]}</span>
              <div className="bar">
                <span style={{ width: `${criteria.weights[k]}%` }} />
              </div>
              <span className={changed ? 'changed' : undefined}>
                {changed ? `${before}% → ` : ''}
                {criteria.weights[k]}%
              </span>
            </div>
          );
        })}
      </div>
      <div>
        <p className="eyebrow">필수 조건</p>
        {criteria.required.length === 0 ? (
          <p className="muted small">없음</p>
        ) : (
          <ul className="small">
            {criteria.required.map((k) => (
              <li key={k}>{REQUIRED[k]}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
