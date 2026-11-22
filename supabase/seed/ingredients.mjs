// 한방 유래 원료 시드 데이터. `npm run seed:build`로 ingredients.sql을 만든다.
//
// 주의: 근거 등급(evidence), 자극 우려(irritation), 기후·제형·시장 적합도 점수는
// 초기 기획 검토용으로 정리한 값이다. '문헌 요약' 출처는 1차 문헌 서지가 아니므로
// 실제 제품 기획에 쓰기 전에 연구·규제 담당자가 확인해야 한다.
//
// 열 순서
//   climate     [고온다습, 고온건조, 온화, 저온건조]
//   formulation [수분, 유화, 오일, 씻어내는]
//   market      [KR, JP, CN, US, EU, SEA, ME, ANZ]

const ROWS = [
  // id, 원료명, INCI, 생약명, 공정서 수재, 지표 성분, 보고된 작용, 피부 고민, 근거, 자극, climate, formulation, market, 추가 출처
  ['centella-asiatica', '병풀추출물', 'Centella Asiatica Extract', '적설초', true, ['마데카소사이드', '아시아티코사이드'], '피부 진정과 장벽 회복', ['soothing', 'barrier'], 5, 1, [5, 4, 4, 4], [5, 5, 2, 3], [5, 4, 4, 5, 4, 5, 3, 4]],
  ['licorice-root', '감초추출물', 'Glycyrrhiza Glabra (Licorice) Root Extract', '감초', true, ['글라브리딘', '글리시리진산'], '티로시나아제 억제와 항염', ['brightening', 'soothing'], 5, 1, [4, 4, 5, 4], [5, 5, 3, 3], [5, 5, 5, 4, 4, 4, 4, 3], { type: '규제', title: '식약처 기능성화장품 미백 고시 원료: 유용성감초추출물 (0.05%)' }],
  ['green-tea', '녹차추출물', 'Camellia Sinensis Leaf Extract', '차엽', false, ['EGCG(카테킨)'], '항산화와 피지 조절', ['antioxidant', 'sebum', 'soothing'], 5, 2, [5, 4, 4, 3], [5, 4, 2, 4], [5, 5, 5, 5, 4, 4, 3, 4]],
  ['panax-ginseng', '인삼추출물', 'Panax Ginseng Root Extract', '인삼', true, ['진세노사이드'], '항산화와 탄력 개선', ['antiaging', 'antioxidant'], 4, 2, [2, 3, 4, 5], [4, 5, 4, 2], [5, 4, 5, 4, 3, 4, 3, 3]],
  ['mugwort', '쑥추출물', 'Artemisia Princeps Leaf Extract', '애엽', true, ['유파틸린', '자세오시딘'], '진정과 항염', ['soothing', 'barrier'], 3, 2, [4, 4, 4, 4], [5, 4, 2, 4], [5, 3, 3, 3, 2, 3, 2, 2]],
  ['houttuynia', '어성초추출물', 'Houttuynia Cordata Extract', '어성초', true, ['퀘르시트린'], '항염과 피지 조절', ['soothing', 'sebum'], 3, 2, [5, 3, 3, 2], [5, 3, 1, 4], [5, 4, 4, 4, 2, 4, 2, 2]],
  ['scutellaria', '황금추출물', 'Scutellaria Baicalensis Root Extract', '황금', true, ['바이칼린', '바이칼레인'], '항염과 항산화', ['soothing', 'antioxidant', 'brightening'], 4, 1, [5, 4, 4, 3], [5, 5, 2, 3], [4, 4, 5, 4, 4, 3, 3, 3]],
  ['paeonia', '작약추출물', 'Paeonia Lactiflora Root Extract', '작약', true, ['페오니플로린'], '항염과 톤 개선', ['soothing', 'brightening'], 3, 1, [4, 3, 4, 3], [5, 5, 2, 2], [4, 4, 5, 3, 3, 3, 2, 2]],
  ['angelica-gigas', '당귀추출물', 'Angelica Gigas Root Extract', '당귀', true, ['데커신'], '보습과 혈행 개선', ['hydration', 'antiaging'], 3, 3, [2, 3, 4, 5], [3, 5, 4, 2], [5, 3, 4, 2, 2, 3, 2, 2]],
  ['coptis', '황련추출물', 'Coptis Japonica Root Extract', '황련', true, ['베르베린'], '항균과 피지 조절', ['sebum', 'soothing'], 3, 3, [5, 3, 3, 2], [5, 3, 1, 4], [4, 4, 4, 2, 2, 3, 2, 2]],
  ['sophora', '고삼추출물', 'Sophora Flavescens Root Extract', '고삼', true, ['마트린', '쿠라리논'], '피지 조절과 톤 개선', ['sebum', 'brightening'], 3, 3, [5, 3, 3, 2], [5, 3, 1, 4], [4, 3, 4, 2, 2, 3, 2, 2]],
  ['rehmannia', '지황추출물', 'Rehmannia Glutinosa Root Extract', '지황', true, ['카탈폴'], '보습과 항산화', ['hydration', 'antiaging'], 3, 1, [2, 4, 4, 5], [4, 5, 3, 2], [4, 3, 5, 2, 2, 3, 2, 2]],
  ['lotus-flower', '연꽃추출물', 'Nelumbo Nucifera Flower Extract', '연화', false, ['플라보노이드'], '항산화와 피지 조절', ['antioxidant', 'sebum', 'hydration'], 2, 1, [4, 4, 4, 3], [5, 4, 2, 3], [4, 4, 4, 3, 3, 5, 3, 3]],
  ['portulaca', '쇠비름추출물', 'Portulaca Oleracea Extract', '마치현', true, ['플라보노이드', '오메가-3 지방산'], '진정과 항염', ['soothing', 'barrier'], 3, 1, [5, 5, 4, 4], [5, 5, 2, 3], [5, 3, 4, 3, 3, 3, 3, 2]],
  ['poria', '복령추출물', 'Poria Cocos Extract', '복령', true, ['파키만(다당체)', '파킴산'], '보습과 진정', ['hydration', 'soothing', 'brightening'], 3, 1, [3, 4, 4, 5], [4, 5, 2, 3], [4, 3, 5, 2, 2, 3, 2, 2]],
  ['morus-bark', '상백피추출물', 'Morus Alba Bark Extract', '상백피', true, ['옥시레스베라트롤', '멀베로사이드'], '티로시나아제 억제', ['brightening', 'antioxidant'], 4, 1, [4, 4, 5, 4], [5, 5, 2, 2], [5, 5, 5, 3, 3, 4, 3, 3]],
  ['schisandra', '오미자추출물', 'Schisandra Chinensis Fruit Extract', '오미자', true, ['쉬산드린'], '항산화와 탄력 개선', ['antioxidant', 'antiaging'], 3, 2, [3, 4, 4, 4], [5, 4, 3, 2], [4, 3, 4, 3, 3, 3, 2, 2]],
  ['camellia-oil', '동백오일', 'Camellia Japonica Seed Oil', '동백', false, ['올레산'], '보습과 장벽 보호', ['hydration', 'barrier'], 3, 1, [1, 4, 3, 5], [1, 5, 5, 3], [5, 5, 4, 3, 3, 2, 4, 3]],
  ['chrysanthemum', '감국추출물', 'Chrysanthemum Indicum Flower Extract', '감국', true, ['루테올린', '리나린'], '진정과 항산화', ['soothing', 'antioxidant'], 3, 2, [4, 4, 4, 3], [5, 4, 2, 3], [4, 3, 4, 2, 3, 3, 2, 2]],
  ['lonicera', '금은화추출물', 'Lonicera Japonica (Honeysuckle) Flower Extract', '금은화', true, ['클로로겐산'], '항염과 항산화', ['soothing', 'antioxidant', 'sebum'], 3, 2, [5, 4, 4, 3], [5, 4, 1, 4], [4, 3, 5, 3, 3, 3, 2, 2]],
  ['cnidium', '천궁추출물', 'Cnidium Officinale Root Extract', '천궁', true, ['리구스틸라이드'], '혈행 개선과 톤 개선', ['brightening', 'antiaging'], 2, 3, [2, 3, 4, 4], [3, 5, 3, 2], [4, 3, 4, 2, 2, 2, 2, 2]],
  ['astragalus', '황기추출물', 'Astragalus Membranaceus Root Extract', '황기', true, ['아스트라갈로사이드'], '탄력 개선과 장벽 강화', ['antiaging', 'barrier', 'hydration'], 3, 1, [2, 3, 4, 5], [4, 5, 3, 2], [4, 3, 5, 3, 3, 3, 2, 2]],
  ['reishi', '영지추출물', 'Ganoderma Lucidum (Mushroom) Extract', '영지', true, ['베타글루칸', '가노데르산'], '보습과 항산화', ['hydration', 'antiaging', 'soothing'], 3, 1, [3, 4, 4, 5], [4, 5, 3, 2], [4, 4, 5, 4, 3, 3, 3, 3]],
  ['coix-seed', '율무추출물', 'Coix Lacryma-Jobi Ma-yuen Seed Extract', '의이인', true, ['코익솔', '코익세놀라이드'], '톤 개선과 보습', ['brightening', 'hydration'], 3, 1, [4, 4, 5, 4], [5, 5, 2, 4], [4, 5, 4, 2, 2, 3, 2, 2]],
  ['ginger', '생강추출물', 'Zingiber Officinale (Ginger) Root Extract', '생강', true, ['진저롤'], '항산화와 혈행 개선', ['antioxidant', 'antiaging'], 3, 4, [2, 2, 3, 4], [3, 4, 3, 4], [3, 3, 3, 4, 4, 3, 3, 3]],
  ['rice-bran', '쌀겨추출물', 'Oryza Sativa (Rice) Bran Extract', '미강', false, ['감마오리자놀', '페룰산'], '톤 개선과 보습', ['brightening', 'hydration', 'antioxidant'], 3, 1, [3, 4, 5, 5], [4, 5, 4, 5], [5, 5, 4, 4, 3, 4, 3, 3]],
  ['mung-bean', '녹두추출물', 'Phaseolus Radiatus Seed Extract', '녹두', false, ['비텍신', '이소비텍신'], '진정과 피지 흡착', ['sebum', 'soothing'], 2, 1, [5, 3, 3, 2], [4, 3, 1, 5], [5, 3, 4, 2, 2, 3, 2, 2]],
  ['jujube', '대추추출물', 'Zizyphus Jujuba Fruit Extract', '대추', true, ['다당체'], '보습과 진정', ['hydration', 'soothing'], 2, 1, [3, 4, 4, 5], [4, 5, 2, 2], [4, 3, 5, 2, 2, 3, 4, 2]],
  ['paper-mulberry', '닥나무추출물', 'Broussonetia Kazinoki Root Extract', '닥나무 뿌리', false, ['카지놀 F'], '티로시나아제 억제', ['brightening'], 4, 1, [4, 4, 5, 4], [5, 5, 2, 2], [5, 3, 3, 2, 2, 3, 2, 2], { type: '규제', title: '식약처 기능성화장품 미백 고시 원료: 닥나무추출물 (2%)' }],
  ['citrus-unshiu', '진피추출물', 'Citrus Unshiu Peel Extract', '진피', true, ['헤스페리딘'], '항산화와 톤 개선', ['antioxidant', 'brightening'], 3, 2, [4, 4, 4, 3], [5, 4, 2, 3], [4, 5, 4, 2, 2, 3, 2, 2]],
  ['lithospermum', '자초추출물', 'Lithospermum Erythrorhizon Root Extract', '자근', true, ['시코닌'], '진정과 피부 회복', ['soothing', 'barrier'], 3, 2, [3, 4, 4, 5], [2, 5, 5, 2], [5, 4, 4, 2, 2, 2, 2, 2]],
  ['prunus-mume', '매실추출물', 'Prunus Mume Fruit Extract', '오매', true, ['유기산', '폴리페놀'], '각질 관리와 항산화', ['sebum', 'antioxidant', 'brightening'], 2, 3, [4, 3, 3, 2], [5, 3, 1, 4], [4, 5, 4, 2, 2, 3, 2, 2]],
];

const CLIMATE_KEYS = ['hot_humid', 'hot_dry', 'temperate', 'cold_dry'];
const BASE_KEYS = ['watery', 'emulsion', 'oil', 'rinse_off'];
const MARKET_KEYS = ['KR', 'JP', 'CN', 'US', 'EU', 'SEA', 'ME', 'ANZ'];
const zip = (keys, values) => Object.fromEntries(keys.map((k, i) => [k, values[i]]));

export const ingredients = ROWS.map(
  ([id, name, inci, herbal, pharm, actives, activity, concerns, evidence, irritation, climate, formulation, market, extra]) => {
    const sources = [
      ...(pharm ? [{ type: '공정서', title: `대한민국약전·대한민국약전외한약(생약)규격집 수재 생약: ${herbal}` }] : []),
      { type: '성분 명칭', title: `국제 화장품 원료 명칭(INCI): ${inci}` },
      { type: '문헌 요약', title: `지표 성분 ${actives.join(', ')}의 ${activity} 작용 보고`, note: '시드 데이터 요약. 1차 문헌 확인 필요' },
      ...(extra ? [extra] : []),
    ].map((s, i) => ({ id: `${id}:s${i + 1}`, ...s }));
    return {
      id,
      name,
      traits: {
        name_en: inci,
        herbal_name: herbal,
        actives,
        concerns,
        evidence,
        irritation,
        climate: zip(CLIMATE_KEYS, climate),
        formulation: zip(BASE_KEYS, formulation),
        market: zip(MARKET_KEYS, market),
      },
      sources,
    };
  },
);
