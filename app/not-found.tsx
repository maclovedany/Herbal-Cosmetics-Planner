import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="narrow stack">
      <h1>찾을 수 없어요</h1>
      <p className="muted">주소가 바뀌었거나 볼 수 없는 프로젝트예요.</p>
      <Link href="/projects">내 프로젝트로 가기</Link>
    </main>
  );
}
