# ARCHITECTURE — 코드 구조

## 디렉터리

```
proxy.ts                     # 요청마다 세션 갱신, 로그인하지 않은 접근 차단 (Next.js 16의 미들웨어)
app/
  layout.tsx, globals.css    # 공통 틀과 스타일
  login/                     # 로그인·회원가입 (브라우저가 Supabase Auth와 직접 통신)
  auth/callback/             # 가입 확인 메일 링크가 돌아오는 곳
  projects/                  # 목록, new, [id], [id]/versions/[no]
  api/projects/              # PRD 9절의 API
    route.ts                 #   POST 프로젝트 생성
    [id]/route.ts            #   DELETE 프로젝트 삭제 (버전·피드백·상세이미지 포함)
    [id]/versions/route.ts   #   POST 첫 생성, 피드백 적용 후 새 버전
    [id]/feedback/route.ts   #   POST 피드백 미리보기
public/
  herbs/                     # 헤더의 약재 사진과 출처(CREDITS.md)
  projects-bg.jpg            # 프로젝트 목록·상세 화면의 배경 사진
components/
  ProjectWorkspace.tsx       # 프로젝트 상세의 두 칸. 진행 이벤트를 모아 구조도에 넘긴다
  ProcessDiagram.tsx         # 프로세스 구조도와 작업 기록
  BrewLoader.tsx             # 처리 중 화면. 약재가 용기에 담기는 그림과 진행 막대 (STAGES와 진행 이벤트로 계산)
  PlanView.tsx               # 기획안의 부분별 컴포넌트와 한 버전 전체 보기
  VersionCompare.tsx         # 두 버전을 부분별로 좌우에 나란히 놓는 비교 화면
  FeedbackPanel.tsx          # 피드백 입력, 기준 변경 미리보기
  CriteriaView.tsx, NewProjectForm.tsx, LogoutButton.tsx, DeleteProjectButton.tsx
lib/
  domain.ts                  # 시장·제품 유형·기후·피부 고민 목록, 브리프 → 계절 조건
  criteria.ts                # 평가 기준 타입, 초기값, 검증, AI 변경안 정리, 비교
  scoring.ts                 # 필터링, 점수 계산, 순위 (순수 함수)
  plan.ts                    # 기획안 문서 타입 (리서처 메모, 검토 결과, 상세페이지 포함)
  pipeline.ts                # 단계 목록(STEPS), 진행 이벤트 타입, 브라우저용 수신 함수
  stream.ts                  # 진행 이벤트를 한 줄씩 흘려보내는 응답
  generate.ts                # 오케스트레이션: 리서처 → 기획자 → 검토자 → 상세페이지 제작자. 저장 직전까지
  agents/
    research.ts              # 후보 선정(서버), 근거 정리 프롬프트와 정리
    planner.ts               # 기획안 프롬프트와 응답 스키마
    reviewer.ts              # 원료·출처 대조(서버), 검토 프롬프트, 후보 밖 원료 찾기
    detail.ts                # 상세페이지 문안 프롬프트와 정리
    prompt.ts                # 프롬프트가 함께 쓰는 설명 블록
  api.ts                     # 세션, 프로젝트·최신 버전 조회, 응답 도우미, 행 타입
  llm/
    gemini.ts                # Gemini 호출. 모델 ID는 여기에만 있다
    openai.ts                # OpenAI 이미지 호출. 모델 ID는 여기에만 있다
    feedback.ts              # 피드백 → 기준 변경안 프롬프트, 응답 스키마
  supabase/                  # 서버·브라우저 클라이언트
supabase/
  migrations/0001_init.sql   # 스키마, RLS, 버전 저장 함수
  migrations/0002_detail_images.sql  # 상세이미지 버킷과 접근 정책
  seed/ingredients.mjs       # 원료 시드 원본
  seed/ingredients.sql       # 위 파일에서 만든 SQL. 직접 고치지 않는다
scripts/build-seed.mjs       # ingredients.mjs → ingredients.sql
tests/
  criteria.test.ts           # 평가 기준 검증·정리·비교
  scoring.test.ts            # 시드 데이터, 순위
  pipeline.test.ts           # 에이전트 순서, 검토 후 재작성, 상세페이지, 원료·출처 대조
  live.test.ts               # 실제 Gemini 호출. LIVE=1일 때만 돈다
  db.test.ts                 # 마이그레이션 SQL의 접근 정책과 버전 저장 함수
  api.test.ts                # 서버 API 전체 흐름, PRD 12절의 수용 기준
  helpers.ts                 # 메모리 Postgres(PGlite), 테스트용 Supabase 클라이언트
```

## 요청이 지나가는 길

새 버전 생성(`POST /api/projects/[id]/versions`)을 기준으로 적는다.

1. `proxy.ts`가 세션을 갱신한다. 로그인하지 않았으면 401로 끝낸다.
2. `lib/api.ts`의 `findProject`가 사용자 세션으로 프로젝트를 읽는다. 소유자가 아니면 RLS 때문에 행이 보이지 않아 404가 된다.
3. 요청의 `base_version_id`가 최신 버전과 다르면 409로 끝낸다. LLM을 부르기 전에 확인한다.
4. 첫 생성이면 `projects.initial_criteria`를 쓰고, 아니면 요청의 `criteria`를 `lib/criteria.ts`의 `validateCriteria`로 검증한다.
5. 여기서부터 응답을 흘려보내기 시작한다(`lib/stream.ts`). 이후의 실패는 HTTP 상태가 아니라 마지막 줄의 `status`에 담긴다.
6. `lib/generate.ts`의 `runPlanPipeline`이 에이전트를 차례로 부른다. 리서처가 후보를 고르고 근거를 정리하고, 기획자가 쓰고, 검토자가 대조·검토하고(돌려보내면 한 번 재작성), 상세페이지 제작자가 문안과 이미지를 만든다. 단계마다 시작·완료 이벤트를 보낸다. 여기까지 `plan_versions`에 쓰지 않고, 상세이미지 파일만 저장소에 올린다.
7. Postgres 함수 `create_plan_version`이 버전 저장과 피드백 적용을 한 트랜잭션으로 처리한다. 기준 버전이 최신인지 여기서 한 번 더 확인한다. 실패하면 올린 이미지를 지운다.
8. 브라우저에서는 `ProjectWorkspace`가 `requestPipeline`으로 이벤트를 받아 `ProcessDiagram`에 넘긴다. 구조도는 `STEPS`와 이벤트만으로 그린다.

## 의존 방향

- `lib/domain.ts`, `lib/criteria.ts`, `lib/scoring.ts`, `lib/plan.ts`, `lib/pipeline.ts`는 서로와 표준 라이브러리만 쓴다. 브라우저와 서버 양쪽에서 불러온다.
- `lib/api.ts`, `lib/stream.ts`, `lib/generate.ts`, `lib/agents/`, `lib/llm/`, `lib/supabase/server.ts`는 서버에서만 쓴다. 클라이언트 컴포넌트에서 불러오지 않는다.
- 클라이언트 컴포넌트는 서버 API를 `fetch`로 부른다. Supabase에 직접 쓰는 것은 로그인·로그아웃과 피드백 취소뿐이다.

## 테스트가 실제 서비스 없이 도는 방식

- `tests/helpers.ts`가 PGlite(메모리 Postgres)에 `0001_init.sql`과 `ingredients.sql`을 그대로 올린다. Supabase의 `auth` 스키마와 `authenticated` 역할만 몇 줄로 흉내 낸다.
- `api.test.ts`는 `@/lib/supabase/server`를 PGlite 위의 흉내 클라이언트로, Gemini와 OpenAI 호출을 고정 응답으로 바꾼 뒤 라우트 핸들러를 직접 부른다. 쿼리는 해당 사용자의 역할로 실행되므로 RLS가 적용된다.
- 저장소(Storage)는 메모리 목록으로 흉내 낸다. `0002_detail_images.sql`은 테스트에서 실행되지 않는다.
- 흉내 클라이언트는 라우트가 쓰는 메서드만 구현했다. 라우트에서 새 쿼리 메서드를 쓰면 `helpers.ts`에도 추가해야 한다.
