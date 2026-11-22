// 가입 확인 메일의 링크가 돌아오는 곳. 코드를 세션으로 바꾼 뒤 프로젝트 목록으로 보낸다.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/projects`);
  }
  return NextResponse.redirect(`${origin}/login?error=confirm`);
}
