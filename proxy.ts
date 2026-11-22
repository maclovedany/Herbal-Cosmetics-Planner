// 요청마다 세션을 갱신하고, 로그인하지 않은 접근을 막는다.
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return new NextResponse('.env에 NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_ANON_KEY를 넣어 주세요.', {
      status: 500,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list) {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = path === '/login' || path.startsWith('/auth/');

  if (!data.user && !isPublic) {
    if (path.startsWith('/api/')) {
      return NextResponse.json({ error: 'unauthorized', message: '로그인이 필요해요.' }, { status: 401 });
    }
    const to = request.nextUrl.clone();
    to.pathname = '/login';
    to.search = '';
    return NextResponse.redirect(to);
  }
  if (data.user && path === '/login') {
    const to = request.nextUrl.clone();
    to.pathname = '/projects';
    to.search = '';
    return NextResponse.redirect(to);
  }
  return response;
}

export const config = {
  // public/의 그림 파일은 로그인 화면의 헤더에서도 보여야 하므로 세션 확인에서 뺀다.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:jpg|png|svg)$).*)'],
};
