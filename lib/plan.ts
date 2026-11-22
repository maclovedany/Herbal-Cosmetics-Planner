// 기획안 문서의 타입. plan_versions.plan 열에 이 모양으로 저장한다.
import type { Market, ProductType } from './domain';

export type PlanProject = { name: string; market: Market; launch_month: number; product_type: ProductType };

export type ResearchNote = { ingredient_id: string; summary: string; source_ids: string[] };

export type Review = { approved: boolean; issues: string[]; rounds: number };

export type DetailSection = { title: string; body: string; image_prompt: string; image_path: string | null };
export type DetailPage = { headline: string; subcopy: string; sections: DetailSection[] };

export type Plan = {
  concept_name: string;
  concept: string;
  target: string;
  key_claims: string[];
  ingredient_reasons: { ingredient_id: string; reason: string; source_ids: string[] }[];
  cautions: string[];
  // 아래 셋은 에이전트 구조를 넣기 전에 만든 버전에는 없다.
  research?: ResearchNote[];
  review?: Review;
  detail_page?: DetailPage;
  // 피드백에서 온 기획안 수정 요청. 이 요청을 반영해 고쳐 쓴 버전에만 있다.
  edit_request?: string;
};
