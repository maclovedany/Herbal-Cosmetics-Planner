'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CLIMATES, CONCERNS, MARKETS, PRODUCT_TYPES, seasonFor, type Market, type ProductType } from '@/lib/domain';

export function NewProjectForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [market, setMarket] = useState<Market>('KR');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [productType, setProductType] = useState<ProductType>('gel_cream');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const season = seasonFor(market, month);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setStatus('프로젝트를 만드는 중…');
    const created = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, market, launch_month: month, product_type: productType }),
    });
    const project = await created.json();
    if (!created.ok) {
      setStatus('');
      setError(project.message);
      return;
    }
    // 상세 화면으로 넘어가 첫 기획안 생성을 바로 시작한다. 진행 상황은 그 화면의 구조도에 나온다.
    router.push(`/projects/${project.id}?start=1`);
    router.refresh();
  }

  return (
    <form className="card stack fcard" onSubmit={submit}>
      <label>
        프로젝트명
        <input required maxLength={80} placeholder="여름용 진정 젤크림" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        출시 시장
        <select value={market} onChange={(e) => setMarket(e.target.value as Market)}>
          {Object.entries(MARKETS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        출시 월
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>
              {m}월
            </option>
          ))}
        </select>
      </label>
      <label>
        제품 유형
        <select value={productType} onChange={(e) => setProductType(e.target.value as ProductType)}>
          {Object.entries(PRODUCT_TYPES).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
      </label>
      <p className="small fhint">
        이 조건의 계절은 <strong>{CLIMATES[season.climate]}</strong>, 피부 고민은{' '}
        <strong>{season.concerns.map((c) => CONCERNS[c]).join(', ')}</strong>로 시작해요. 기획안을 본 뒤 피드백으로 바꿀 수 있어요.
      </p>
      {error && <p className="notice error">{error}</p>}
      {status && <p className="notice info">{status}</p>}
      <button className="cta" disabled={status !== ''}>프로젝트 만들고 첫 기획안 생성</button>
      <p className="small muted">만들면 프로젝트 화면으로 넘어가 첫 기획안 생성을 바로 시작해요.</p>
    </form>
  );
}
