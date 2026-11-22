'use client';

import { AGENTS, STAGES, STEPS, STEP_IDS, STORES, TOOLS, type AgentId, type StepEvent, type StepId, type StoreId, type ToolId } from '@/lib/pipeline';

type Status = 'idle' | 'active' | 'done' | 'error';
const OPS = { read: '읽기', insert: '행 추가', update: '값 변경' } as const;
const opLabel = (store: StoreId, op: keyof typeof OPS) => (store === 'storage' && op === 'insert' ? '파일 추가' : OPS[op]);

const stepsOf = (agent: AgentId) => STEP_IDS.filter((id) => STEPS[id].agent === agent);
const toolsOf = (agent: AgentId) => [...new Set(stepsOf(agent).flatMap((id) => STEPS[id].tools as readonly ToolId[]))];

// 처리 구조도. 서버가 보낸 진행 이벤트로 지금 움직이는 단계를 깜빡이게 하고, 아래에 한 일과 DB 기록을 쌓는다.
export function ProcessDiagram({ events, running }: { events: StepEvent[]; running: boolean }) {
  const status = Object.fromEntries(STEP_IDS.map((id) => [id, 'idle'])) as Record<StepId, Status>;
  const touched: Partial<Record<StoreId, string>> = {};
  for (const e of events) {
    status[e.step] = e.status === 'start' ? 'active' : e.status;
    for (const d of e.db ?? []) touched[d.store] = opLabel(d.store, d.op);
  }
  // 요청이 끝났는데 시작만 하고 끝나지 않은 단계는 실패로 본다.
  if (!running) for (const id of STEP_IDS) if (status[id] === 'active') status[id] = 'error';

  const active = STEP_IDS.find((id) => status[id] === 'active');
  const activeTools: readonly ToolId[] = active ? STEPS[active].tools : [];
  const agentState = (agent: AgentId): Status => (active && STEPS[active].agent === agent ? 'active' : 'idle');
  // 방금 한 일이 맨 위에 오도록 최신순으로 쌓는다.
  const log = events.filter((e) => e.status !== 'start').reverse();

  const Agent = ({ id }: { id: AgentId }) => (
    <div className={`pnode ${id === 'orchestrator' ? 'orch' : ''} ${agentState(id)}`}>
      <p className="pname">{AGENTS[id].label}</p>
      <p className="prole">{AGENTS[id].role}</p>
      <ul className="psteps">
        {stepsOf(id).map((s) => (
          <li key={s} className={status[s]}>
            <span className="pdot" />
            <span>{STEPS[s].label}</span>
            <span className={`pkind ${STEPS[s].ai ? 'ai' : ''}`}>{STEPS[s].ai ? 'AI' : '서버'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
  // 에이전트 상자 아래의 두 줄짜리 로그 칸. 그 에이전트가 방금 한 일이 위에 오고, 넘치면 칸 안에서 스크롤한다.
  const agentLog = (id: AgentId) => {
    const working = active && STEPS[active].agent === id ? active : null;
    const lines = events.filter((e) => STEPS[e.step].agent === id && e.status !== 'start').reverse();
    return (
      <div className={`palog ${working ? 'active' : ''}`} aria-live="polite">
        {working && <p className="now">▶ {STEPS[working].label} 중…</p>}
        {lines.map((e, i) => (
          <p key={lines.length - i} className={e.status}>
            <b>{STEPS[e.step].label}</b> {e.note ?? (e.status === 'error' ? '실패했어요.' : '끝냈어요.')}
          </p>
        ))}
        {!working && lines.length === 0 && <p className="muted">대기 중</p>}
      </div>
    );
  };
  const Tools = ({ id }: { id: AgentId }) => (
    <div className="ptools">
      {toolsOf(id).map((t) => (
        <span key={t} className={`ptool ${active && STEPS[active].agent === id && activeTools.includes(t) ? 'active' : ''}`}>
          {TOOLS[t]}
        </span>
      ))}
    </div>
  );

  return (
    <div className="proc">
      <div className="row between">
        <h2>프로세스 구조도</h2>
        <span className={`pstate ${running ? 'active' : ''}`}>
          {running && active ? `${AGENTS[STEPS[active].agent].label} · ${STEPS[active].label}` : running ? '처리 중' : events.length ? '완료' : '대기 중'}
        </span>
      </div>

      <div className="pmap">
        <div className="pleft">
          <div className="pnode user">
            <p className="prole">사용자</p>
            <p className="pname">기획자</p>
            <p className="prole">요청 → 기획안</p>
          </div>
          <Agent id="orchestrator" />
          {agentLog('orchestrator')}
          <Tools id="orchestrator" />
        </div>
        <div className="plane">
          {(['research', 'planner', 'reviewer', 'detail'] as AgentId[]).map((id) => (
            <div key={id} className="prow">
              <Agent id={id} />
              <Tools id={id} />
              {agentLog(id)}
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="eyebrow">저장소 (Supabase)</p>
        <div className="pstores">
          {(Object.keys(STORES) as StoreId[]).map((s) => {
            const live = events.findLast((e) => e.status !== 'start' && e.db?.some((d) => d.store === s));
            const isNow = running && live === events.findLast((e) => e.status !== 'start');
            return (
              <span key={s} className={`ptool store ${isNow ? 'active' : touched[s] ? 'done' : ''}`}>
                <code>{STORES[s]}</code>
                {touched[s] && <em>{touched[s]}</em>}
              </span>
            );
          })}
        </div>
      </div>

      <ol className="pstages">
        {STAGES.map((stage) => {
          const states = stage.steps.map((s) => status[s]);
          const state = states.includes('active') ? 'active' : states.includes('error') ? 'error' : states.includes('done') ? 'done' : 'idle';
          return (
            <li key={stage.label} className={state}>
              {stage.label}
            </li>
          );
        })}
      </ol>

      <div>
        <p className="eyebrow">작업 기록 · 최신순</p>
        {log.length === 0 ? (
          <p className="muted small">
            {running ? '첫 단계를 처리하고 있어요.' : '기획안을 만들거나 피드백을 보내면, 지금 일하는 에이전트가 형광색으로 깜빡이고 여기에 한 일이 쌓여요.'}
          </p>
        ) : (
          <ol className="plog">
            {log.map((e, i) => (
              <li key={log.length - i} className={e.status}>
                <p>
                  <span className={`pkind ${STEPS[e.step].ai ? 'ai' : ''}`}>{STEPS[e.step].ai ? 'AI' : '서버'}</span>{' '}
                  <strong>
                    {AGENTS[STEPS[e.step].agent].label} · {STEPS[e.step].label}
                  </strong>
                  {e.status === 'error' && <span className="perr"> 실패</span>}
                </p>
                {e.note && <p className="small">{e.note}</p>}
                {e.changes && e.changes.length > 0 && (
                  <ul className="pchanges">
                    {e.changes.map((c) => (
                      <li key={c.label}>
                        {c.label} <b>{c.from} → {c.to}</b>
                      </li>
                    ))}
                  </ul>
                )}
                {e.db?.map((d, j) => (
                  <p key={j} className="pdb small">
                    <code>{STORES[d.store]}</code> <em>{opLabel(d.store, d.op)}</em> {d.note}
                  </p>
                ))}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
