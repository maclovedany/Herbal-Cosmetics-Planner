// 서버 API와 서버 컴포넌트가 함께 쓰는 도우미와 행 타입.
import { NextResponse } from 'next/server';
import type { Criteria } from './criteria';
import type { Market, ProductType } from './domain';
import type { Plan } from './plan';
import type { Candidate } from './scoring';
import { createClient } from './supabase/server';

export type ProjectRow = {
  id: string;
  name: string;
  market: Market;
  launch_month: number;
  product_type: ProductType;
  initial_criteria: Criteria;
  created_at: string;
};

export type VersionRow = {
  id: string;
  project_id: string;
  version_no: number;
  criteria: Criteria;
  plan: Plan;
  candidates: Candidate[];
  created_at: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

export const fail = (status: number, error: string, message: string) =>
  NextResponse.json({ error, message }, { status });

export const NOT_FOUND = () => fail(404, 'not_found', '프로젝트를 찾을 수 없어요.');
export const CONFLICT = () =>
  fail(409, 'version_conflict', '다른 곳에서 새 버전이 만들어졌어요. 최신 버전을 확인해 주세요.');

// 로그인한 사용자와 그 세션의 Supabase 클라이언트. 로그인하지 않았으면 null.
export async function getSession() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ? { supabase, user: data.user } : null;
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

// 소유자가 아니면 접근 정책 때문에 행이 보이지 않아 null이 된다.
export async function findProject(supabase: Supabase, id: string): Promise<ProjectRow | null> {
  if (!isUuid(id)) return null;
  const { data } = await supabase.from('projects').select('*').eq('id', id).maybeSingle();
  return data as ProjectRow | null;
}

export async function findLatestVersion(supabase: Supabase, projectId: string): Promise<VersionRow | null> {
  const { data } = await supabase
    .from('plan_versions')
    .select('*')
    .eq('project_id', projectId)
    .order('version_no', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as VersionRow | null;
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return typeof body === 'object' && body !== null ? body : {};
  } catch {
    return {};
  }
}

export const IMAGE_BUCKET = 'detail-images';

// 상세이미지는 비공개 버킷에 있다. 화면에 보여 줄 때마다 1시간짜리 주소를 만든다. 경로 → 주소.
export async function signDetailImages(supabase: Supabase, plans: (Plan | undefined)[]): Promise<Record<string, string>> {
  const paths = plans.flatMap((p) => p?.detail_page?.sections.map((s) => s.image_path) ?? []).filter((p): p is string => !!p);
  if (paths.length === 0) return {};
  const { data } = await supabase.storage.from(IMAGE_BUCKET).createSignedUrls(paths, 3600);
  const urls: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) urls[d.path] = d.signedUrl;
  return urls;
}
