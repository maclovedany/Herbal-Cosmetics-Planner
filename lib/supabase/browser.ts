// 브라우저용 Supabase 클라이언트. 로그인·로그아웃과 피드백 취소에 쓴다.
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
