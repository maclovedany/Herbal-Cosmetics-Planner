// 상세페이지 제작자: 검토를 마친 기획안으로 상세페이지 문안을 쓰고(Gemini), 상세이미지를 만든다(GPT 이미지 API).
import { MARKETS, PRODUCT_TYPES } from '../domain';
import type { DetailPage, Plan, PlanProject } from '../plan';
import type { Candidate } from '../scoring';
import { PlanVerificationError } from './reviewer';
import { STRING } from './prompt';

export const MAX_SECTIONS = 3;

export const DETAIL_SCHEMA = {
  type: 'OBJECT',
  properties: {
    headline: STRING,
    subcopy: STRING,
    sections: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { title: STRING, body: STRING, image_prompt: STRING },
        required: ['title', 'body', 'image_prompt'],
      },
    },
  },
  required: ['headline', 'subcopy', 'sections'],
};

export function buildDetailPrompt(project: PlanProject, plan: Plan, candidates: Candidate[]): string {
  return `당신은 화장품 상세페이지 제작자입니다. 아래 기획안으로 온라인 판매용 상세페이지 문안과 이미지 지시문을 작성하세요.

[제품]
- 출시 시장: ${MARKETS[project.market]}, ${project.launch_month}월 출시
- 제품 유형: ${PRODUCT_TYPES[project.product_type].label}
- 콘셉트명: ${plan.concept_name}
- 콘셉트: ${plan.concept}
- 타깃: ${plan.target}
- 핵심 소구점: ${plan.key_claims.join(' / ')}
- 원료: ${candidates.map((c) => `${c.name}(${c.name_en})`).join(', ')}

[규칙]
1. headline은 20자 안팎의 한국어 한 줄, subcopy는 한국어 1~2문장으로 쓰세요.
2. sections는 정확히 ${MAX_SECTIONS}개를 이 순서로 쓰세요: ① 제품 첫인상 ② 핵심 원료 ③ 사용감과 사용법.
3. title은 한국어 15자 안팎, body는 한국어 2~3문장으로 쓰세요.
4. 위 원료만 언급하고, 의약품처럼 들리는 효능(치료, 완치 등)이나 기획안에 없는 수치를 쓰지 마세요.
5. image_prompt는 그 섹션에 넣을 사진을 영어로 묘사하세요. 제품 용기의 형태와 색, 원료 소재, 배경, 조명, 구도를 구체적으로 쓰세요. 이미지 안에 글자, 로고, 사람 얼굴은 넣지 않습니다.`;
}

const IMAGE_SUFFIX =
  ' Premium cosmetic product photography for an e-commerce detail page, vertical composition, soft natural light. No text, letters, labels, logos or watermarks anywhere in the image.';

export function cleanDetailPage(raw: unknown): DetailPage {
  const d = raw as { headline?: unknown; subcopy?: unknown; sections?: unknown } | null;
  if (!d || typeof d.headline !== 'string' || typeof d.subcopy !== 'string' || !Array.isArray(d.sections)) {
    throw new PlanVerificationError('상세페이지 문안의 형식이 맞지 않아요.');
  }
  const sections = (d.sections as { title?: unknown; body?: unknown; image_prompt?: unknown }[])
    .filter((s) => typeof s?.title === 'string' && typeof s.body === 'string' && typeof s.image_prompt === 'string')
    .slice(0, MAX_SECTIONS)
    .map((s) => ({
      title: s.title as string,
      body: s.body as string,
      image_prompt: (s.image_prompt as string).trim() + IMAGE_SUFFIX,
      image_path: null,
    }));
  if (sections.length === 0) throw new PlanVerificationError('상세페이지에 섹션이 없어요.');
  return { headline: d.headline, subcopy: d.subcopy, sections };
}
