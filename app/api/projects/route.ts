// POST /api/projects — 프로젝트 생성. 브리프에서 초기 평가 기준을 정해 함께 저장한다.
import { NextResponse } from 'next/server';
import { fail, getSession, readJson } from '@/lib/api';
import { initialCriteria } from '@/lib/criteria';
import { isMarket, isMonth, isProductType } from '@/lib/domain';

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return fail(401, 'unauthorized', '로그인이 필요해요.');

  const body = await readJson(request);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const { market, launch_month, product_type } = body;
  if (name.length < 1 || name.length > 80) return fail(422, 'invalid', '프로젝트명을 1~80자로 입력해 주세요.');
  if (!isMarket(market)) return fail(422, 'invalid', '출시 시장을 골라 주세요.');
  if (!isMonth(launch_month)) return fail(422, 'invalid', '출시 월을 골라 주세요.');
  if (!isProductType(product_type)) return fail(422, 'invalid', '제품 유형을 골라 주세요.');

  const { data, error } = await session.supabase
    .from('projects')
    .insert({
      owner_id: session.user.id,
      name,
      market,
      launch_month,
      product_type,
      initial_criteria: initialCriteria({ market, launch_month, product_type }),
    })
    .select('id')
    .single();
  if (error) return fail(500, 'db_error', '프로젝트를 저장하지 못했어요.');

  return NextResponse.json({ id: data.id }, { status: 201 });
}
