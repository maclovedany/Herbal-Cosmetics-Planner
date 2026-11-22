// supabase/seed/ingredients.mjs → supabase/seed/ingredients.sql
import { writeFileSync } from 'node:fs';
import { ingredients } from '../supabase/seed/ingredients.mjs';

const q = (s) => `'${s.replaceAll("'", "''")}'`;
const rows = ingredients
  .map((i) => `  (${q(i.id)}, ${q(i.name)}, ${q(JSON.stringify(i.traits))}::jsonb, ${q(JSON.stringify(i.sources))}::jsonb)`)
  .join(',\n');

const sql = `-- 한방 유래 원료 시드 (${ingredients.length}건). scripts/build-seed.mjs가 만든 파일이다. 직접 고치지 않는다.
-- 여러 번 실행해도 된다. 같은 id는 덮어쓴다.
insert into public.ingredients (id, name, traits, sources) values
${rows}
on conflict (id) do update
  set name = excluded.name, traits = excluded.traits, sources = excluded.sources;
`;

const out = new URL('../supabase/seed/ingredients.sql', import.meta.url);
writeFileSync(out, sql);
console.log(`${ingredients.length}건 → supabase/seed/ingredients.sql`);
