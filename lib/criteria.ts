// 평가 기준: 타입, 초기값, 검증, AI 변경안 정리, 비교.
import { CLIMATES, CONCERNS, seasonFor, type Brief, type Climate, type Concern } from './domain';

export const WEIGHTS = {
  research_evidence: '연구 근거',
  season_fit: '계절 적합성',
  formulation_fit: '제형 적합성',
  market_appeal: '시장 선호',
} as const;
export type WeightKey = keyof typeof WEIGHTS;
export const WEIGHT_KEYS = Object.keys(WEIGHTS) as WeightKey[];

export const REQUIRED = {
  concern_match: '계절 피부 고민과 맞는 효능',
  evidence_strong: '연구 근거 4등급 이상',
  low_irritation: '자극 우려 낮음',
} as const;
export type RequiredKey = keyof typeof REQUIRED;
export const REQUIRED_KEYS = Object.keys(REQUIRED) as RequiredKey[];

// 원료 DB의 원료 하나를 가리킨다. 이름은 화면 표시용이고, 서버가 저장 전에 DB의 이름으로 다시 쓴다.
export type IngredientRef = { id: string; name: string };
export const MAX_INCLUDE = 5;

export type Criteria = {
  season: { climate: Climate; concerns: Concern[] };
  required: RequiredKey[];
  weights: Record<WeightKey, number>;
  // 꼭 넣을 원료와 뺄 원료. 비어 있으면 키를 두지 않는다. 이 기능을 넣기 전에 만든 버전에는 없다.
  include?: IngredientRef[];
  exclude?: IngredientRef[];
};

const DEFAULT_WEIGHTS: Record<WeightKey, number> = {
  research_evidence: 25,
  season_fit: 30,
  formulation_fit: 25,
  market_appeal: 20,
};

export function initialCriteria(brief: Brief): Criteria {
  return {
    season: seasonFor(brief.market, brief.launch_month),
    required: ['concern_match'],
    weights: { ...DEFAULT_WEIGHTS },
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function uniqueKnown<T extends string>(v: unknown, known: readonly string[]): T[] | null {
  if (!Array.isArray(v)) return null;
  if (!v.every((x) => typeof x === 'string' && known.includes(x))) return null;
  if (new Set(v).size !== v.length) return null;
  return v as T[];
}

function parseRefs(v: unknown): IngredientRef[] | null {
  if (v === undefined) return [];
  if (!Array.isArray(v)) return null;
  const refs: IngredientRef[] = [];
  for (const x of v) {
    if (!isObject(x) || typeof x.id !== 'string' || typeof x.name !== 'string') return null;
    refs.push({ id: x.id, name: x.name });
  }
  return new Set(refs.map((r) => r.id)).size === refs.length ? refs : null;
}

// 지정·제외 목록이 비어 있으면 키를 빼서, 목록이 없던 예전 기준과 같은 모양으로 둔다.
function withRefs(base: Criteria, include: IngredientRef[], exclude: IngredientRef[]): Criteria {
  const { include: _i, exclude: _e, ...rest } = base;
  return { ...rest, ...(include.length ? { include } : {}), ...(exclude.length ? { exclude } : {}) };
}

export type Validation = { ok: true; criteria: Criteria } | { ok: false; error: string };

export function validateCriteria(input: unknown): Validation {
  if (!isObject(input) || !isObject(input.season) || !isObject(input.weights)) {
    return { ok: false, error: '평가 기준의 형식이 맞지 않아요.' };
  }
  const climate = input.season.climate;
  if (typeof climate !== 'string' || !(climate in CLIMATES)) {
    return { ok: false, error: '계절 조건이 올바르지 않아요.' };
  }
  const concerns = uniqueKnown<Concern>(input.season.concerns, Object.keys(CONCERNS));
  if (!concerns || concerns.length === 0) {
    return { ok: false, error: '피부 고민을 하나 이상 골라 주세요.' };
  }
  const required = uniqueKnown<RequiredKey>(input.required, REQUIRED_KEYS);
  if (!required) return { ok: false, error: '알 수 없는 필수 조건이 있어요.' };

  const keys = Object.keys(input.weights);
  if (keys.length !== WEIGHT_KEYS.length || !WEIGHT_KEYS.every((k) => keys.includes(k))) {
    return { ok: false, error: '알 수 없는 가중치 항목이 있어요.' };
  }
  const weights = {} as Record<WeightKey, number>;
  for (const k of WEIGHT_KEYS) {
    const w = input.weights[k];
    if (!Number.isInteger(w) || (w as number) < 0 || (w as number) > 100) {
      return { ok: false, error: '가중치는 0~100 사이의 정수여야 해요.' };
    }
    weights[k] = w as number;
  }
  const sum = WEIGHT_KEYS.reduce((s, k) => s + weights[k], 0);
  if (sum !== 100) return { ok: false, error: `가중치 합이 100이어야 해요. 지금은 ${sum}이에요.` };

  const include = parseRefs(input.include);
  const exclude = parseRefs(input.exclude);
  if (!include || !exclude) return { ok: false, error: '지정하거나 제외할 원료의 형식이 맞지 않아요.' };
  if (include.length > MAX_INCLUDE) return { ok: false, error: `꼭 넣을 원료는 ${MAX_INCLUDE}개까지 지정할 수 있어요.` };
  if (include.some((r) => exclude.some((x) => x.id === r.id))) {
    return { ok: false, error: '같은 원료를 꼭 넣을 원료와 뺄 원료에 함께 둘 수 없어요.' };
  }

  return { ok: true, criteria: withRefs({ season: { climate: climate as Climate, concerns }, required, weights }, include, exclude) };
}

// 지정·제외 원료가 모두 원료 DB에 있는지 확인하고 이름을 DB의 값으로 바꾼다. 없는 원료가 있으면 null.
export function resolveRefs(criteria: Criteria, catalog: IngredientRef[]): Criteria | null {
  const byId = new Map(catalog.map((c) => [c.id, c.name]));
  const resolve = (refs: IngredientRef[] = []) => refs.map((r) => ({ id: r.id, name: byId.get(r.id) }));
  const include = resolve(criteria.include);
  const exclude = resolve(criteria.exclude);
  if ([...include, ...exclude].some((r) => r.name === undefined)) return null;
  return withRefs(criteria, include as IngredientRef[], exclude as IngredientRef[]);
}

// 합이 100인 정수로 맞춘다. 비율을 유지하고 남는 값은 소수점이 큰 항목부터 준다.
export function normalizeWeights(raw: Record<WeightKey, number>): Record<WeightKey, number> {
  const clean = WEIGHT_KEYS.map((k) => (Number.isFinite(raw[k]) && raw[k] > 0 ? raw[k] : 0));
  const total = clean.reduce((s, v) => s + v, 0);
  if (total === 0) return { ...DEFAULT_WEIGHTS };
  const exact = clean.map((v) => (v * 100) / total);
  const floors = exact.map(Math.floor);
  let rest = 100 - floors.reduce((s, v) => s + v, 0);
  const order = exact.map((v, i) => [v - floors[i], i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (rest <= 0) break;
    floors[i] += 1;
    rest -= 1;
  }
  return Object.fromEntries(WEIGHT_KEYS.map((k, i) => [k, floors[i]])) as Record<WeightKey, number>;
}

// AI가 제안한 변경안을 허용된 값만 남겨 유효한 기준으로 만든다. 기후는 브리프에서 정해지므로 바꾸지 않는다.
// catalog(원료 DB의 ID와 이름)를 주면 include_ids·exclude_ids에서 DB에 있는 원료만 남긴다.
export function sanitizeProposal(raw: unknown, current: Criteria, catalog?: IngredientRef[]): Criteria {
  const r = isObject(raw) ? raw : {};
  const rw = isObject(r.weights) ? r.weights : {};
  const merged = {} as Record<WeightKey, number>;
  for (const k of WEIGHT_KEYS) {
    merged[k] = typeof rw[k] === 'number' ? (rw[k] as number) : current.weights[k];
  }
  const required = Array.isArray(r.required)
    ? REQUIRED_KEYS.filter((k) => (r.required as unknown[]).includes(k))
    : current.required;
  const concernKeys = Object.keys(CONCERNS) as Concern[];
  const concerns = Array.isArray(r.concerns)
    ? concernKeys.filter((k) => (r.concerns as unknown[]).includes(k))
    : [];
  const pick = (ids: unknown, fallback: IngredientRef[] = []) =>
    catalog && Array.isArray(ids) ? catalog.filter((c) => ids.includes(c.id)).map((c) => ({ id: c.id, name: c.name })) : fallback;
  const exclude = pick(r.exclude_ids, current.exclude);
  // 같은 원료가 양쪽에 있으면 빼는 쪽을 따른다.
  const include = pick(r.include_ids, current.include)
    .filter((x) => !exclude.some((e) => e.id === x.id))
    .slice(0, MAX_INCLUDE);
  return withRefs(
    {
      season: {
        climate: current.season.climate,
        concerns: concerns.length > 0 ? concerns : current.season.concerns,
      },
      required,
      weights: normalizeWeights(merged),
    },
    include,
    exclude,
  );
}

export type CriteriaChange = { label: string; from: string; to: string };

export function diffCriteria(a: Criteria, b: Criteria): CriteriaChange[] {
  const changes: CriteriaChange[] = [];
  for (const k of WEIGHT_KEYS) {
    if (a.weights[k] !== b.weights[k]) {
      changes.push({ label: WEIGHTS[k], from: `${a.weights[k]}%`, to: `${b.weights[k]}%` });
    }
  }
  for (const k of REQUIRED_KEYS) {
    const before = a.required.includes(k);
    const after = b.required.includes(k);
    if (before !== after) {
      changes.push({ label: `필수 조건 · ${REQUIRED[k]}`, from: before ? '적용' : '없음', to: after ? '적용' : '없음' });
    }
  }
  const names = (c: Concern[]) => (Object.keys(CONCERNS) as Concern[]).filter((k) => c.includes(k)).map((k) => CONCERNS[k]).join(', ');
  if (names(a.season.concerns) !== names(b.season.concerns)) {
    changes.push({ label: '피부 고민', from: names(a.season.concerns), to: names(b.season.concerns) });
  }
  const refs = (list: IngredientRef[] = []) => list.map((r) => r.name).sort().join(', ') || '없음';
  if (refs(a.include) !== refs(b.include)) changes.push({ label: '꼭 넣을 원료', from: refs(a.include), to: refs(b.include) });
  if (refs(a.exclude) !== refs(b.exclude)) changes.push({ label: '뺄 원료', from: refs(a.exclude), to: refs(b.exclude) });
  return changes;
}
