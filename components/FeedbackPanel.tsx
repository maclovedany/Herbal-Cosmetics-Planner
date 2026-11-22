'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { REQUIRED, REQUIRED_KEYS, WEIGHTS, WEIGHT_KEYS, diffCriteria, type Criteria } from '@/lib/criteria';
import { CONCERNS, type Concern } from '@/lib/domain';
import type { EndEvent } from '@/lib/pipeline';
import { createClient } from '@/lib/supabase/browser';

type Preview = { feedbackId: string; summary: string; criteria: Criteria };

function toggle<T>(list: T[], item: T, on: boolean): T[] {
  return on ? [...list, item] : list.filter((x) => x !== item);
}

export function FeedbackPanel(props: {
  projectId: string;
  baseVersionId: string;
  baseVersionNo: number;
  current: Criteria;
  run: (path: string, body: unknown) => Promise<EndEvent>;
  running: boolean;
  onCreated: (versionNo: number) => void;
}) {
  const { baseVersionId, baseVersionNo, current, run } = props;
  const router = useRouter();
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  function fail(end: EndEvent) {
    setError(end.message ?? '요청을 처리하지 못했어요.');
    if (end.status === 409) {
      setPreview(null);
      router.refresh();
    }
  }

  async function requestPreview(e: React.FormEvent) {
    e.preventDefault();
    setBusy('피드백을 평가 기준 변경안으로 바꾸는 중…');
    setError('');
    const end = await run('feedback', { base_version_id: baseVersionId, body: text });
    setBusy('');
    if (!end.ok) return fail(end);
    setPreview({ feedbackId: end.feedback_id as string, summary: end.summary as string, criteria: end.criteria as Criteria });
  }

  async function apply() {
    if (!preview) return;
    setBusy('새 기획안을 만드는 중… 위 구조도에서 진행 상황을 볼 수 있어요.');
    setError('');
    const end = await run('versions', {
      base_version_id: baseVersionId,
      feedback_id: preview.feedbackId,
      criteria: preview.criteria,
    });
    setBusy('');
    if (!end.ok) return fail(end);
    props.onCreated(end.version_no as number);
  }

  async function cancel() {
    if (!preview) return;
    await createClient().from('feedback').update({ status: 'discarded' }).eq('id', preview.feedbackId);
    setPreview(null);
    setError('');
  }

  if (!preview) {
    return (
      <form className="stack" onSubmit={requestPreview}>
        <label>
          v{baseVersionNo}에 대한 피드백
          <textarea
            required
            maxLength={2000}
            placeholder="예: 연구 근거를 더 중요하게 봐 주세요. 자극 우려가 있는 원료는 빼 주세요."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        {error && <p className="notice error">{error}</p>}
        {busy && <p className="notice info">{busy}</p>}
        <button disabled={busy !== '' || props.running}>기준 변경 미리보기</button>
        <p className="small muted">미리보기에서는 아무것도 바뀌지 않아요. 확인하고 적용해야 새 기획안이 만들어져요.</p>
      </form>
    );
  }

  const c = preview.criteria;
  const sum = WEIGHT_KEYS.reduce((s, k) => s + c.weights[k], 0);
  const changes = diffCriteria(current, c);
  const valid = sum === 100 && c.season.concerns.length > 0;
  const update = (next: Partial<Criteria>) => setPreview({ ...preview, criteria: { ...c, ...next } });

  return (
    <div className="stack">
      <div>
        <p className="eyebrow">기준 변경 미리보기</p>
        {preview.summary && <p className="small">{preview.summary}</p>}
      </div>

      {changes.length === 0 ? (
        <p className="notice warn">바뀌는 기준이 없어요. 아래에서 직접 고치거나 피드백을 다시 써 주세요.</p>
      ) : (
        <ul className="small">
          {changes.map((ch) => (
            <li key={ch.label}>
              {ch.label} <span className="changed">{ch.from} → {ch.to}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="weights">
        {WEIGHT_KEYS.map((k) => (
          <div key={k} style={{ display: 'contents' }}>
            <label htmlFor={`w-${k}`} style={{ fontWeight: 400, fontSize: 14 }}>
              {WEIGHTS[k]}
            </label>
            <span className="muted small">현재 {current.weights[k]}%</span>
            <input
              id={`w-${k}`}
              type="number"
              min={0}
              max={100}
              step={1}
              value={c.weights[k]}
              onChange={(e) => update({ weights: { ...c.weights, [k]: Math.round(Number(e.target.value)) || 0 } })}
            />
          </div>
        ))}
      </div>
      <p className={`small ${sum === 100 ? 'muted' : 'changed'}`}>
        가중치 합 {sum}%{sum === 100 ? '' : ' · 100%가 되어야 적용할 수 있어요.'}
      </p>

      <div>
        <p className="eyebrow">필수 조건</p>
        {REQUIRED_KEYS.map((k) => (
          <label key={k} className="check">
            <input
              type="checkbox"
              checked={c.required.includes(k)}
              onChange={(e) => update({ required: REQUIRED_KEYS.filter((x) => toggle(c.required, k, e.target.checked).includes(x)) })}
            />
            {REQUIRED[k]}
          </label>
        ))}
      </div>

      <div>
        <p className="eyebrow">피부 고민</p>
        <div className="row">
          {(Object.keys(CONCERNS) as Concern[]).map((k) => (
            <label key={k} className="check">
              <input
                type="checkbox"
                checked={c.season.concerns.includes(k)}
                onChange={(e) =>
                  update({ season: { ...c.season, concerns: toggle(c.season.concerns, k, e.target.checked) } })
                }
              />
              {CONCERNS[k]}
            </label>
          ))}
        </div>
      </div>

      {error && <p className="notice error">{error}</p>}
      {busy && <p className="notice info">{busy}</p>}
      <div className="row">
        <button onClick={apply} disabled={!valid || busy !== ''}>
          적용하고 새 기획안 생성
        </button>
        <button className="ghost" onClick={cancel} disabled={busy !== ''}>
          취소
        </button>
      </div>
    </div>
  );
}
