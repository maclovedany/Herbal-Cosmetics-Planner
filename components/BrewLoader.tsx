'use client';

import { useEffect, useState } from 'react';
import { STAGES, STEPS, type StepEvent } from '@/lib/pipeline';

// 단계 묶음(STAGES)마다 기다리는 동안 보여 줄 한 줄. 순서는 STAGES와 같다.
const STAGE_LINES = [
  '요청을 받아 프로젝트를 확인하고 있어요.',
  '평가 기준을 확인하고 있어요.',
  '계절과 피부 고민에 맞는 한방 유래 원료를 고르고 있어요.',
  '고른 원료를 담아 콘셉트를 빚고 있어요.',
  '원료와 출처, 표현을 꼼꼼히 살펴보고 있어요.',
  '상세페이지 문안과 이미지를 만들고 있어요.',
  '새 버전을 저장하고 있어요.',
];

// 처리 중에 보여 주는 화면. 약재가 화장품 용기에 담기는 그림과 진행 막대를 그린다.
// 진행률은 서버가 보낸 진행 이벤트가 STAGES의 몇 번째 묶음까지 왔는지로 계산한다.
export function BrewLoader({ events }: { events: StepEvent[] }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const last = events.at(-1);
  const stage = last ? STAGES.findIndex((s) => s.steps.includes(last.step)) : 0;
  const progress = last ? (stage + (last.status === 'start' ? 0.5 : 1)) / STAGES.length : 0.04;
  const percent = Math.round(progress * 100);
  // 용기 안쪽 높이 78 중 진행률만큼 차오른다.
  const level = 170 - 78 * progress;

  return (
    <div className="card brew" aria-live="polite">
      <svg className="brewart" viewBox="0 0 320 200" role="img" aria-label="한방 약재가 화장품 용기에 담기는 그림">
        <defs>
          <linearGradient id="brew-liquid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f6d58a" />
            <stop offset="1" stopColor="#d98b3a" />
          </linearGradient>
          <linearGradient id="brew-gold" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#b8862f" />
            <stop offset="0.5" stopColor="#f3d68b" />
            <stop offset="1" stopColor="#b8862f" />
          </linearGradient>
          <clipPath id="brew-jar">
            <rect x="104" y="90" width="112" height="82" rx="16" />
          </clipPath>
        </defs>

        {/* 받침 */}
        <ellipse cx="160" cy="180" rx="118" ry="9" fill="#ead9bd" />
        <rect x="60" y="172" width="200" height="8" rx="4" fill="#8a5a34" />

        {/* 용기 안: 차오르는 액체와 기포 */}
        <g clipPath="url(#brew-jar)">
          <rect x="104" y="90" width="112" height="82" fill="#fffaf0" />
          <g style={{ transform: `translateY(${level}px)`, transition: 'transform 0.8s ease' }}>
            <path className="brewwave" d="M40 0 q14 -7 28 0 t28 0 t28 0 t28 0 t28 0 t28 0 t28 0 t28 0 t28 0 t28 0 V100 H40 Z" fill="url(#brew-liquid)" />
          </g>
          <circle className="brewbubble b1" cx="128" cy="168" r="3" />
          <circle className="brewbubble b2" cx="158" cy="168" r="2" />
          <circle className="brewbubble b3" cx="186" cy="168" r="3.5" />
          <circle className="brewbubble b4" cx="144" cy="168" r="1.8" />
        </g>
        {/* 용기 테두리와 입구 */}
        <rect x="104" y="90" width="112" height="82" rx="16" fill="none" stroke="url(#brew-gold)" strokeWidth="3" />
        <rect x="100" y="84" width="120" height="10" rx="5" fill="url(#brew-gold)" />
        <path d="M118 104 v44" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity="0.7" />

        {/* 옆에 놓인 뚜껑과 스포이트 병 */}
        <g className="brewlid">
          <rect x="228" y="150" width="56" height="20" rx="6" fill="url(#brew-gold)" />
          <rect x="246" y="144" width="20" height="8" rx="4" fill="#b8862f" />
        </g>
        <g>
          <rect x="44" y="128" width="26" height="44" rx="7" fill="#fff6e2" stroke="url(#brew-gold)" strokeWidth="2" />
          <rect x="50" y="116" width="14" height="13" rx="2" fill="url(#brew-gold)" />
          <rect x="53" y="100" width="8" height="17" rx="4" fill="#fff" stroke="#d9c39a" />
          <rect x="46" y="150" width="22" height="20" rx="5" fill="#f1c26f" opacity="0.8" />
        </g>

        {/* 떨어지는 약재: 인삼, 대추, 구기자, 국화, 잎 */}
        <g transform="translate(160 0)">
          <g className="brewherb h1">
            <path d="M-3 -14 q3 -4 6 0 l2 12 q0 6 -2 10 l3 9 l-3 -1 l-2 -6 l-2 6 l-3 1 l3 -9 q-3 -4 -2 -10 z" fill="#e6c08a" stroke="#b98a52" strokeWidth="0.8" />
            <path d="M0 -14 q-6 -8 -12 -6 q4 6 12 6 q6 -8 12 -6 q-4 6 -12 6" fill="#7a9a4a" />
          </g>
        </g>
        <g transform="translate(136 0)">
          <g className="brewherb h2">
            <ellipse rx="7" ry="9.5" fill="#9c2f2a" />
            <path d="M-3 -4 q2 4 0 9" stroke="#c9605a" strokeWidth="1.2" fill="none" strokeLinecap="round" />
          </g>
        </g>
        <g transform="translate(184 0)">
          <g className="brewherb h3">
            <ellipse cx="-5" rx="3.2" ry="5" fill="#d8432e" />
            <ellipse cx="3" cy="3" rx="3.2" ry="5" fill="#e2562f" transform="rotate(24 3 3)" />
            <ellipse cx="7" cy="-5" rx="2.8" ry="4.4" fill="#d8432e" transform="rotate(-20 7 -5)" />
          </g>
        </g>
        <g transform="translate(148 0)">
          <g className="brewherb h4">
            {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
              <ellipse key={a} cy="-7" rx="2.6" ry="5" fill="#fffdf2" stroke="#e8d9a8" strokeWidth="0.6" transform={`rotate(${a})`} />
            ))}
            <circle r="3.6" fill="#f0b93a" />
          </g>
        </g>
        <g transform="translate(174 0)">
          <g className="brewherb h5">
            <path d="M0 -10 q9 4 0 20 q-9 -16 0 -20 z" fill="#6f9a52" />
            <path d="M0 -8 v16" stroke="#4f7a3a" strokeWidth="0.8" />
          </g>
        </g>

        {/* 반짝임 */}
        <path className="brewspark s1" d="M84 70 l2 6 l6 2 l-6 2 l-2 6 l-2 -6 l-6 -2 l6 -2 z" />
        <path className="brewspark s2" d="M238 96 l1.5 4.5 l4.5 1.5 l-4.5 1.5 l-1.5 4.5 l-1.5 -4.5 l-4.5 -1.5 l4.5 -1.5 z" />
        <path className="brewspark s3" d="M222 44 l2 6 l6 2 l-6 2 l-2 6 l-2 -6 l-6 -2 l6 -2 z" />
      </svg>

      <div className="stack brewinfo">
        <p className="brewline">{STAGE_LINES[stage]}</p>
        <div className="brewbar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="기획안 생성 진행률">
          <span style={{ width: `${percent}%` }} />
        </div>
        <p className="row between small muted">
          <span>
            {STAGES.length}단계 중 {stage + 1}단계 · {last ? STEPS[last.step].label : '시작하는 중'}
          </span>
          <span>
            {percent}% · {seconds}초 지났어요
          </span>
        </p>
      </div>
    </div>
  );
}
