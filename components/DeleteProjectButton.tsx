'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// 프로젝트 카드의 삭제 버튼. 되돌릴 수 없으므로 한 번 더 묻는다.
export function DeleteProjectButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm(`"${name}" 프로젝트를 지울까요?\n기획안의 모든 버전과 피드백, 상세이미지가 함께 지워지고 되돌릴 수 없어요.`)) return;
    setBusy(true);
    const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      window.alert(body.message ?? '프로젝트를 지우지 못했어요.');
      return;
    }
    router.refresh();
  }

  return (
    <button type="button" className="pdel" onClick={remove} disabled={busy}>
      {busy ? '지우는 중…' : '삭제'}
    </button>
  );
}
