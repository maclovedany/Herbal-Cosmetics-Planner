-- 한방 유래 원료 기반 화장품 기획 도구: 스키마, 접근 정책, 버전 저장 함수.
-- Supabase SQL Editor에서 한 번 실행한다. 이어서 supabase/seed/ingredients.sql을 실행한다.

create table public.projects (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 80),
  market           text not null,
  launch_month     int  not null check (launch_month between 1 and 12),
  product_type     text not null,
  initial_criteria jsonb not null,
  created_at       timestamptz not null default now()
);
create index projects_owner_idx on public.projects (owner_id, created_at desc);

create table public.plan_versions (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  version_no  int  not null check (version_no >= 1),
  criteria    jsonb not null,   -- 생성 시점의 평가 기준
  plan        jsonb not null,   -- 콘셉트, 추천 이유
  candidates  jsonb not null,   -- 원료 후보, 기준별 점수, 순위, 출처
  created_at  timestamptz not null default now(),
  unique (project_id, version_no)
);

create table public.feedback (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  base_version_id   uuid not null references public.plan_versions(id) on delete cascade,
  body              text not null,
  proposed_changes  jsonb not null,
  status            text not null default 'proposed'
                    check (status in ('proposed', 'applied', 'discarded')),
  result_version_id uuid references public.plan_versions(id) on delete set null,
  created_at        timestamptz not null default now()
);
create index feedback_project_idx on public.feedback (project_id, created_at desc);

create table public.ingredients (
  id          text primary key,
  name        text not null,
  traits      jsonb not null,
  sources     jsonb not null,
  created_at  timestamptz not null default now()
);

-- 접근 정책 ---------------------------------------------------------------

alter table public.projects      enable row level security;
alter table public.plan_versions enable row level security;
alter table public.feedback      enable row level security;
alter table public.ingredients   enable row level security;

grant select, insert, update, delete on public.projects to authenticated;
grant select, insert                 on public.plan_versions to authenticated;
grant select, insert, update         on public.feedback to authenticated;
grant select                         on public.ingredients to authenticated;

create policy projects_owner on public.projects
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- 버전은 읽기와 넣기만 허용한다. 수정·삭제 정책은 만들지 않는다.
create policy versions_select on public.plan_versions
  for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));

create policy versions_insert on public.plan_versions
  for insert to authenticated
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));

create policy feedback_owner on public.feedback
  for all to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));

create policy ingredients_read on public.ingredients
  for select to authenticated using (true);

-- 버전 저장 ---------------------------------------------------------------
-- 기획안과 평가 기준을 새 버전으로 저장하고, 피드백이 있으면 같은 트랜잭션에서 적용 처리한다.
-- 호출한 사용자의 권한으로 실행되므로 접근 정책이 그대로 적용된다.
--   PJ404  프로젝트가 없거나 소유자가 아님
--   PV409  기준이 된 버전이 더 이상 최신이 아님 (동시에 들어오면 유일 제약 23505)
--   PF422  피드백이 이 버전에 적용할 수 있는 상태가 아님

create function public.create_plan_version(
  p_project_id      uuid,
  p_base_version_id uuid,
  p_feedback_id     uuid,
  p_criteria        jsonb,
  p_plan            jsonb,
  p_candidates      jsonb
) returns public.plan_versions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_latest public.plan_versions;
  v_new    public.plan_versions;
begin
  perform 1 from public.projects where id = p_project_id;
  if not found then
    raise exception 'project_not_found' using errcode = 'PJ404';
  end if;

  select * into v_latest
    from public.plan_versions
   where project_id = p_project_id
   order by version_no desc
   limit 1;

  if v_latest.id is distinct from p_base_version_id then
    raise exception 'version_conflict' using errcode = 'PV409';
  end if;

  insert into public.plan_versions (project_id, version_no, criteria, plan, candidates)
  values (p_project_id, coalesce(v_latest.version_no, 0) + 1, p_criteria, p_plan, p_candidates)
  returning * into v_new;

  if p_feedback_id is not null then
    update public.feedback
       set status = 'applied', result_version_id = v_new.id
     where id = p_feedback_id
       and project_id = p_project_id
       and base_version_id = p_base_version_id
       and status = 'proposed';
    if not found then
      raise exception 'feedback_not_applicable' using errcode = 'PF422';
    end if;
  end if;

  return v_new;
end;
$$;

grant execute on function public.create_plan_version(uuid, uuid, uuid, jsonb, jsonb, jsonb) to authenticated;
