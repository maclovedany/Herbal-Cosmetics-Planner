'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BrewLoader } from '@/components/BrewLoader';
import { CriteriaView } from '@/components/CriteriaView';
import { FeedbackPanel } from '@/components/FeedbackPanel';
import { PlanView } from '@/components/PlanView';
import { ProcessDiagram } from '@/components/ProcessDiagram';
import type { Criteria } from '@/lib/criteria';
import { requestPipeline, type EndEvent, type StepEvent } from '@/lib/pipeline';
import type { Plan } from '@/lib/plan';
import type { Candidate } from '@/lib/scoring';

type Latest = { id: string; version_no: number; created_at: string; criteria: Criteria; plan: Plan; candidates: Candidate[] };

const date = (iso: string) => new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' });

// 프로젝트 상세의 두 칸. 왼쪽은 기획안, 오른쪽은 프로세스 구조도와 피드백.
// 서버 API가 흘려보내는 진행 이벤트를 여기서 모아 구조도에 넘긴다.
export function ProjectWorkspace(props: {
  projectId: string;
  initialCriteria: Criteria;
  latest: Latest | null;
  history: { version_no: number; created_at: string }[];
  images: Record<string, string>;
  autoStart: boolean;
}) {
  const { projectId, latest } = props;
  const router = useRouter();
  const [events, setEvents] = useState<StepEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<number | null>(null);
  const started = useRef(false);

  const run = useCallback(async (path: string, body: unknown): Promise<EndEvent> => {
    setEvents([]);
    setRunning(true);
    setCreated(null);
    const end = await requestPipeline(`/api/projects/${projectId}/${path}`, body, (e) => setEvents((prev) => [...prev, e]));
    setRunning(false);
    return end;
  }, [projectId]);

  const generateFirst = useCallback(async () => {
    setError('');
    const end = await run('versions', { base_version_id: null });
    if (!end.ok) setError(end.message ?? '기획안을 만들지 못했어요.');
    // 다른 탭에서 이미 만들었을 때(409)도 새로 읽으면 그 버전이 보인다.
    router.replace(`/projects/${projectId}`);
    router.refresh();
  }, [run, router, projectId]);

  // 새 프로젝트를 만들고 넘어왔으면 첫 기획안 생성을 바로 시작한다.
  useEffect(() => {
    if (props.autoStart && !latest && !started.current) {
      started.current = true;
      void generateFirst();
    }
  }, [props.autoStart, latest, generateFirst]);

  return (
    <div className="grid2">
      <div className="stack">
        {running && <BrewLoader events={events} />}
        {created && (
          <p className="notice info">
            v{created}을 만들었어요. <Link href={`/projects/${projectId}/versions/${created}`}>v{created - 1}과 비교해 보기</Link>
          </p>
        )}
        {latest ? (
          <div className="card">
            <p className="eyebrow">
              최신 기획안 · v{latest.version_no} · {date(latest.created_at)}
            </p>
            <PlanView plan={latest.plan} candidates={latest.candidates} images={props.images} />
          </div>
        ) : (
          <div className="card stack">
            <h2>초기 평가 기준</h2>
            <CriteriaView criteria={props.initialCriteria} />
            {error && <p className="notice error">{error}</p>}
            {running ? (
              <p className="notice info">첫 기획안을 만들고 있어요. 오른쪽 구조도에서 지금 일하는 에이전트를 볼 수 있어요.</p>
            ) : (
              <button onClick={generateFirst}>첫 기획안 생성</button>
            )}
          </div>
        )}
      </div>

      <div className="stack">
        <div className="card">
          <ProcessDiagram events={events} running={running} />
        </div>
        {latest && (
          <>
            <div className="card">
              <FeedbackPanel
                key={latest.id}
                projectId={projectId}
                baseVersionId={latest.id}
                baseVersionNo={latest.version_no}
                current={latest.criteria}
                run={run}
                running={running}
                onCreated={(no) => {
                  setCreated(no);
                  router.refresh();
                }}
              />
            </div>
            <div className="card stack">
              <h2>현재 평가 기준</h2>
              <CriteriaView criteria={latest.criteria} />
            </div>
            <div className="card stack">
              <h2>버전 이력</h2>
              <ul className="history">
                {props.history.map((v) => (
                  <li key={v.version_no}>
                    <Link href={`/projects/${projectId}/versions/${v.version_no}`}>v{v.version_no}</Link>
                    <span className="muted small">{date(v.created_at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
