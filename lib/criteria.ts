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

export type Criteria = {
  season: { climate: Climate; concerns: Concern[] };
  required: RequiredKey[];
  weights: Record<WeightKey, number>;
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

  return { ok: true, criteria: { season: { climate: climate as Climate, concerns }, required, weights } };
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
export function sanitizeProposal(raw: unknown, current: Criteria): Criteria {
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
  return {
    season: {
      climate: current.season.climate,
      concerns: concerns.length > 0 ? concerns : current.season.concerns,
    },
    required,
    weights: normalizeWeights(merged),
  };
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
  return changes;
}
