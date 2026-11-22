// 테스트용 메모리 Postgres(PGlite). 마이그레이션과 시드 SQL을 그대로 올린다.
// Supabase의 auth 스키마와 authenticated 역할은 STUB으로 흉내 낸다.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const STUB = `
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated;
grant usage on schema public to authenticated;
`;

export const USER_A = '00000000-0000-0000-0000-00000000000a';
export const USER_B = '00000000-0000-0000-0000-00000000000b';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

export async function createDb() {
  const db = new PGlite();
  await db.exec(STUB);
  await db.exec(read('../supabase/migrations/0001_init.sql'));
  await db.exec(read('../supabase/seed/ingredients.sql'));
  await db.exec(`insert into auth.users values ('${USER_A}'), ('${USER_B}')`);
  return db;
}

// 이후 쿼리를 이 사용자의 세션으로 실행한다. 접근 정책이 적용된다.
export async function actAs(db: PGlite, user: string) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user}', false); set role authenticated;`);
}

// 접근 정책을 건너뛰고 실제 저장 상태를 확인할 때 쓴다.
export async function asAdmin(db: PGlite) {
  await db.exec(`reset role;`);
}

// 서버 API가 쓰는 범위만 흉내 낸 Supabase 클라이언트. 쿼리는 해당 사용자의 권한으로 실행된다.
// 올라간 상세이미지 경로. 테스트가 확인하고 비운다.
export const uploadedFiles = new Set<string>();

export function fakeSupabase(db: PGlite, user: { id: string; email: string } | null) {
  const run = async (sql: string, params: unknown[]) => {
    if (user) await actAs(db, user.id);
    try {
      return { data: (await db.query(sql, params)).rows as Record<string, unknown>[], error: null };
    } catch (e) {
      return { data: null, error: { code: (e as { code: string }).code, message: (e as Error).message } };
    }
  };
  const first = (r: Awaited<ReturnType<typeof run>>) => (r.error ? r : { data: r.data[0] ?? null, error: null });
  const param = (v: unknown) => (typeof v === 'object' && v !== null ? JSON.stringify(v) : v);

  return {
    auth: { getUser: async () => ({ data: { user } }) },
    storage: {
      from: () => ({
        async upload(path: string) {
          // 저장소 정책과 같은 규칙: 첫 폴더가 자기 ID여야 한다.
          if (path.split('/')[0] !== user?.id) return { error: { message: 'denied' } };
          uploadedFiles.add(path);
          return { error: null };
        },
        async remove(paths: string[]) {
          for (const p of paths) uploadedFiles.delete(p);
          return { error: null };
        },
      }),
    },
    from(table: string) {
      let cols = '*';
      let insert: Record<string, unknown> | null = null;
      let remove = false;
      let tail = '';
      const where: string[] = [];
      const params: unknown[] = [];
      const exec = () => {
        if (insert) {
          const keys = Object.keys(insert);
          const values = keys.map((k) => param(insert![k]));
          return run(
            `insert into ${table} (${keys.join(', ')}) values (${keys.map((_, i) => `$${i + 1}`).join(', ')}) returning ${cols}`,
            values,
          );
        }
        if (remove) return run(`delete from ${table}${where.length ? ` where ${where.join(' and ')}` : ''}`, params);
        return run(`select ${cols} from ${table}${where.length ? ` where ${where.join(' and ')}` : ''}${tail}`, params);
      };
      const builder = {
        select(c = '*') {
          cols = c;
          return builder;
        },
        insert(values: Record<string, unknown>) {
          insert = values;
          return builder;
        },
        delete() {
          remove = true;
          return builder;
        },
        eq(column: string, value: unknown) {
          params.push(value);
          where.push(`${column} = $${params.length}`);
          return builder;
        },
        order(column: string, opts: { ascending: boolean }) {
          tail += ` order by ${column} ${opts.ascending ? 'asc' : 'desc'}`;
          return builder;
        },
        limit(n: number) {
          tail += ` limit ${n}`;
          return builder;
        },
        maybeSingle: () => exec().then(first),
        single: () => exec().then(first),
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => exec().then(resolve, reject),
      };
      return builder;
    },
    rpc(name: string, args: Record<string, unknown>) {
      const keys = Object.keys(args);
      return run(
        `select * from ${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')})`,
        keys.map((k) => param(args[k])),
      ).then(first);
    },
  };
}
