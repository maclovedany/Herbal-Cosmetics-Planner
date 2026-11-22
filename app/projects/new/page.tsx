import Link from 'next/link';
import { NewProjectForm } from '@/components/NewProjectForm';

export default function NewProjectPage() {
  return (
    <div className="projects-bg">
      <main className="narrow stack">
        <Link href="/projects" className="small">
          ← 내 프로젝트
        </Link>
        <div>
          <h1>새 프로젝트</h1>
          <p className="small muted">출시 조건을 정하면 계절에 맞는 한방 유래 원료로 첫 기획안을 만들어요.</p>
        </div>
        <NewProjectForm />
      </main>
    </div>
  );
}
