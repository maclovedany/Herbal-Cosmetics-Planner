// 처리 단계의 목록과 진행 이벤트. 서버가 이벤트를 흘려보내고 화면의 구조도가 그대로 받아 그린다.
import type { CriteriaChange } from './criteria';

export const AGENTS = {
  orchestrator: { label: '오케스트레이터', role: '요청 이해 · 위임 · 통합 · 저장' },
  research: { label: '리서처', role: '원료 조회 · 근거 정리' },
  planner: { label: '기획자', role: '콘셉트 · 추천 이유' },
  reviewer: { label: '검토자', role: '출처 대조 · 표현 검토' },
  detail: { label: '상세페이지 제작자', role: '상세페이지 문안 · 상세이미지' },
} as const;
export type AgentId = keyof typeof AGENTS;

export const STORES = {
  projects: 'projects',
  feedback: 'feedback',
  plan_versions: 'plan_versions',
  ingredients: 'ingredients',
  storage: 'storage · detail-images',
} as const;
export type StoreId = keyof typeof STORES;

export const TOOLS = {
  gemini: 'Gemini',
  gpt_image: 'GPT 이미지 API',
  ingredients_db: '원료 DB',
  rules: '대조 규칙',
  storage: '이미지 저장소',
} as const;
export type ToolId = keyof typeof TOOLS;

type StepDef = { agent: AgentId; ai: boolean; label: string; tools: ToolId[] };

export const STEPS = {
  receive: { agent: 'orchestrator', ai: false, label: '요청 접수 · 소유권 확인', tools: [] },
  criteria: { agent: 'orchestrator', ai: false, label: '평가 기준 확인', tools: [] },
  interpret: { agent: 'orchestrator', ai: true, label: '피드백 해석', tools: ['gemini'] },
  propose: { agent: 'orchestrator', ai: false, label: '변경안 검증 · 저장', tools: [] },
  research_query: { agent: 'research', ai: false, label: '원료 조회 · 점수 계산', tools: ['ingredients_db'] },
  research_brief: { agent: 'research', ai: true, label: '근거 정리', tools: ['gemini'] },
  plan_write: { agent: 'planner', ai: true, label: '기획안 작성', tools: ['gemini'] },
  plan_revise: { agent: 'planner', ai: true, label: '검토 의견 반영', tools: ['gemini'] },
  review_verify: { agent: 'reviewer', ai: false, label: '원료 · 출처 대조', tools: ['rules'] },
  review_critique: { agent: 'reviewer', ai: true, label: '표현 · 근거 검토', tools: ['gemini'] },
  detail_copy: { agent: 'detail', ai: true, label: '상세페이지 문안 작성', tools: ['gemini'] },
  detail_image: { agent: 'detail', ai: true, label: '상세이미지 생성', tools: ['gpt_image', 'storage'] },
  save: { agent: 'orchestrator', ai: false, label: '새 버전 저장', tools: [] },
} as const satisfies Record<string, StepDef>;
export type StepId = keyof typeof STEPS;
export const STEP_IDS = Object.keys(STEPS) as StepId[];

export const STAGES: { label: string; steps: StepId[] }[] = [
  { label: '요청 접수', steps: ['receive'] },
  { label: '기준 확인', steps: ['criteria', 'interpret', 'propose'] },
  { label: '리서치', steps: ['research_query', 'research_brief'] },
  { label: '기획', steps: ['plan_write', 'plan_revise'] },
  { label: '검토', steps: ['review_verify', 'review_critique'] },
  { label: '상세페이지', steps: ['detail_copy', 'detail_image'] },
  { label: '저장', steps: ['save'] },
];

export type DbNote = { store: StoreId; op: 'read' | 'insert' | 'update'; note: string };
export type StepInfo = { note?: string; db?: DbNote[]; changes?: CriteriaChange[] };
export type StepEvent = { type: 'step'; step: StepId; status: 'start' | 'done' | 'error' } & StepInfo;
export type EndEvent = { type: 'end'; ok: boolean; status: number; error?: string; message?: string } & Record<string, unknown>;
export type Emit = (event: StepEvent) => void;

// 단계 하나를 실행하면서 시작·완료·실패 이벤트를 보낸다.
export async function runStep<T>(emit: Emit, step: StepId, fn: () => Promise<{ value: T } & StepInfo>): Promise<T> {
  emit({ type: 'step', step, status: 'start' });
  try {
    const { value, ...info } = await fn();
    emit({ type: 'step', step, status: 'done', ...info });
    return value;
  } catch (e) {
    emit({ type: 'step', step, status: 'error', note: e instanceof Error ? e.message : '알 수 없는 오류' });
    throw e;
  }
}

// 브라우저에서 서버 API를 부르고, 한 줄씩 오는 진행 이벤트를 받는다. 마지막 이벤트를 돌려준다.
export async function requestPipeline(url: string, body: unknown, onEvent: (e: StepEvent) => void): Promise<EndEvent> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.body || !res.headers.get('content-type')?.includes('ndjson')) {
    const data = await res.json().catch(() => ({}));
    return { type: 'end', ok: false, status: res.status, message: '요청을 처리하지 못했어요.', ...data };
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let end: EndEvent | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as StepEvent | EndEvent;
      if (event.type === 'end') end = event;
      else onEvent(event);
    }
  }
  return end ?? { type: 'end', ok: false, status: 500, message: '연결이 중간에 끊겼어요.' };
}
