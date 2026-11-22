'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';

const MESSAGES: Record<string, string> = {
  'Invalid login credentials': '이메일 또는 비밀번호가 맞지 않아요.',
  'Email not confirmed': '가입 확인 메일의 링크를 먼저 눌러 주세요.',
  'User already registered': '이미 가입한 이메일이에요. 로그인해 주세요.',
};

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    const supabase = createClient();
    const result =
      mode === 'login'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
          });
    setBusy(false);
    if (result.error) {
      setError(MESSAGES[result.error.message] ?? result.error.message);
      return;
    }
    if (!result.data.session) {
      setInfo('확인 메일을 보냈어요. 메일의 링크를 누르면 가입이 끝나요.');
      return;
    }
    router.push('/projects');
    router.refresh();
  }

  return (
    <main className="narrow">
      <form className="card stack" onSubmit={submit}>
        <div>
          <h1>{mode === 'login' ? '로그인' : '회원가입'}</h1>
          <p className="muted small">한방 유래 원료로 화장품 기획안을 만들어요.</p>
        </div>
        <label>
          이메일
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          비밀번호
          <span className="pwwrap">
            <input
              type={show ? 'text' : 'password'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="button" className="eye" aria-label={show ? '비밀번호 숨기기' : '비밀번호 보기'} aria-pressed={show} onClick={() => setShow(!show)}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
                <circle cx="12" cy="12" r="3" />
                {show && <path d="M4 4l16 16" />}
              </svg>
            </button>
          </span>
        </label>
        {error && <p className="notice error">{error}</p>}
        {info && <p className="notice info">{info}</p>}
        <button disabled={busy}>{busy ? '확인하는 중…' : mode === 'login' ? '로그인' : '가입하기'}</button>
        <button
          type="button"
          className="quiet"
          onClick={() => {
            setMode(mode === 'login' ? 'signup' : 'login');
            setError('');
            setInfo('');
          }}
        >
          {mode === 'login' ? '계정이 없어요. 회원가입' : '이미 계정이 있어요. 로그인'}
        </button>
      </form>
    </main>
  );
}
