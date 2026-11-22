// 마이그레이션 SQL과 시드 SQL을 메모리 Postgres(PGlite)에 올려 접근 정책과 버전 저장 함수를 확인한다.
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { USER_A as A, USER_B as B, actAs, createDb } from './helpers';

const CRITERIA = { weights: { research_evidence: 25, season_fit: 30, formulation_fit: 25, market_appeal: 20 } };

let db: PGlite;
const as = (user: string) => actAs(db, user);
async function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows[0];
}
async function createProject(name: string) {
  const row = await one<{ id: string }>(
    `insert into projects (name, market, launch_month, product_type, initial_criteria)
     values ($1, 'KR', 7, 'gel_cream', $2) returning id`,
    [name, JSON.stringify(CRITERIA)],
  );
  return row.id;
}
function save(project: string, base: string | null, feedback: string | null, criteria: object = CRITERIA) {
  return one<{ id: string; version_no: number }>(
    `select * from create_plan_version($1, $2, $3, $4, '{}'::jsonb, '[]'::jsonb)`,
    [project, base, feedback, JSON.stringify(criteria)],
  );
}
const code = (p: Promise<unknown>) => p.then(() => null, (e) => e.code as string);

beforeAll(async () => {
  db = await createDb();
});

describe('접근 정책', () => {
  it('다른 사용자의 프로젝트·버전·피드백을 읽거나 쓸 수 없다', async () => {
    await as(A);
    const pa = await createProject('A의 여름 젤크림');
    const v1 = await save(pa, null, null);
    await db.query(`insert into feedback (project_id, base_version_id, body, proposed_changes) values ($1, $2, 'x', '{}')`, [pa, v1.id]);

    await as(B);
    expect((await db.query(`select * from projects`)).rows).toHaveLength(0);
    expect((await db.query(`select * from plan_versions`)).rows).toHaveLength(0);
    expect((await db.query(`select * from feedback`)).rows).toHaveLength(0);
    expect(await code(save(pa, v1.id, null))).toBe('PJ404');
    expect(await code(db.query(`insert into plan_versions (project_id, version_no, criteria, plan, candidates) values ($1, 2, '{}', '{}', '[]')`, [pa]))).toBe('42501');
    expect(await code(db.query(`insert into feedback (project_id, base_version_id, body, proposed_changes) values ($1, $2, 'x', '{}')`, [pa, v1.id]))).toBe('42501');
    expect((await db.query(`update projects set name = 'hacked' where id = $1`, [pa])).affectedRows).toBe(0);
    expect((await db.query(`delete from projects where id = $1`, [pa])).affectedRows).toBe(0);
  });

  it('남의 owner_id로 프로젝트를 만들 수 없다', async () => {
    await as(B);
    const p = db.query(
      `insert into projects (owner_id, name, market, launch_month, product_type, initial_criteria) values ($1, 'x', 'KR', 1, 'cream', '{}')`,
      [A],
    );
    expect(await code(p)).toBe('42501');
  });

  it('로그인한 사용자는 원료를 읽기만 한다', async () => {
    await as(B);
    const n = await one<{ n: number }>(`select count(*)::int as n from ingredients`);
    expect(n.n).toBeGreaterThanOrEqual(30);
    expect(await code(db.query(`delete from ingredients`))).toBe('42501');
  });

  it('버전은 고치거나 지울 수 없다', async () => {
    await as(A);
    const p = await createProject('불변 확인');
    await save(p, null, null);
    expect(await code(db.query(`update plan_versions set criteria = '{}' where project_id = $1`, [p]))).toBe('42501');
    expect(await code(db.query(`delete from plan_versions where project_id = $1`, [p]))).toBe('42501');
  });
});

describe('버전 저장', () => {
  it('프로젝트마다 기준과 버전 번호가 따로 쌓인다', async () => {
    await as(A);
    const summer = await createProject('여름용 진정 젤크림');
    const winter = await createProject('겨울용 보습 크림');
    const s1 = await save(summer, null, null);
    const w1 = await save(winter, null, null);
    const s2 = await save(summer, s1.id, null, { weights: { ...CRITERIA.weights, research_evidence: 40, season_fit: 15 } });
    expect([s1.version_no, s2.version_no, w1.version_no]).toEqual([1, 2, 1]);

    const latest = (p: string) =>
      one<{ w: number }>(
        `select (criteria->'weights'->>'research_evidence')::int as w from plan_versions where project_id = $1 order by version_no desc limit 1`,
        [p],
      );
    expect((await latest(summer)).w).toBe(40);
    expect((await latest(winter)).w).toBe(25);
    const old = await one<{ w: number }>(`select (criteria->'weights'->>'research_evidence')::int as w from plan_versions where id = $1`, [s1.id]);
    expect(old.w).toBe(25);
  });

  it('같은 버전을 기준으로 두 번 저장하면 하나만 성공한다', async () => {
    await as(A);
    const p = await createProject('두 탭');
    const v1 = await save(p, null, null);
    const v2 = await save(p, v1.id, null);
    expect(v2.version_no).toBe(2);
    expect(await code(save(p, v1.id, null))).toBe('PV409');
    expect(await code(save(p, null, null))).toBe('PV409');
    expect(await code(db.query(`insert into plan_versions (project_id, version_no, criteria, plan, candidates) values ($1, 2, '{}', '{}', '[]')`, [p]))).toBe('23505');
    const n = await one<{ n: number }>(`select count(*)::int as n from plan_versions where project_id = $1`, [p]);
    expect(n.n).toBe(2);
  });

  it('피드백 적용과 버전 저장이 함께 되고, 함께 취소된다', async () => {
    await as(A);
    const p = await createProject('피드백');
    const v1 = await save(p, null, null);
    const fb = await one<{ id: string }>(
      `insert into feedback (project_id, base_version_id, body, proposed_changes) values ($1, $2, '연구 근거를 더', '{}') returning id`,
      [p, v1.id],
    );
    const v2 = await save(p, v1.id, fb.id);
    const applied = await one<{ status: string; result_version_id: string }>(`select status, result_version_id from feedback where id = $1`, [fb.id]);
    expect(applied).toEqual({ status: 'applied', result_version_id: v2.id });

    // 이미 적용된 피드백으로 다시 저장하면 버전도 남지 않는다.
    expect(await code(save(p, v2.id, fb.id))).toBe('PF422');
    const n = await one<{ n: number }>(`select count(*)::int as n from plan_versions where project_id = $1`, [p]);
    expect(n.n).toBe(2);
  });
});
