import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { LogoutButton } from '@/components/LogoutButton';
import { getSession } from '@/lib/api';

export const metadata: Metadata = {
  title: '한방 원료 기획',
  description: '한방 유래 원료 기반 화장품 기획 도구',
};

// 헤더에 놓는 약재 사진. 출처와 라이선스는 public/herbs/CREDITS.md에 있다.
const HERBS = [
  { file: 'ginseng', label: '인삼', credit: '국립국어원 · CC BY-SA 2.0 KR' },
  { file: 'red-ginseng', label: '홍삼', credit: 'Fumikas Sagisavas · CC0' },
  { file: 'jujube', label: '대추', credit: 'Vis M · CC BY-SA 4.0' },
  { file: 'goji', label: '구기자', credit: 'Wstefano · Public domain' },
  { file: 'chrysanthemum', label: '국화', credit: 'Fumikas Sagisavas · CC0' },
  { file: 'omija', label: '오미자', credit: 'Fumikas Sagisavas · CC0' },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <html lang="ko">
      <body suppressHydrationWarning>
        <header className="topbar">
          <Link href="/projects" className="brand">
            한방 원료 기획
          </Link>
          <ul className="herbs">
            {HERBS.map((h) => (
              <li key={h.file}>
                <img src={`/herbs/${h.file}.jpg`} alt={h.label} title={`사진: ${h.credit} (위키미디어 공용)`} width={60} height={60} />
                <span>{h.label}</span>
              </li>
            ))}
          </ul>
          {session && (
            <div className="who">
              <span>{session.user.email}</span>
              <LogoutButton />
            </div>
          )}
        </header>
        {children}
      </body>
    </html>
  );
}
