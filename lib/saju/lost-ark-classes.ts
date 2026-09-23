// 로스트아크 공식 클래스 소개(https://lostark.game.onstove.com/Class), 2026-09-23 확인.
// 직업 설명을 짧게 요약해 Gemini가 확인되지 않은 스킬이나 성능을 꾸미지 않도록 한다.
export const LOST_ARK_CLASSES = [
  { name: "디스트로이어", trait: "그라비티 해머로 묵직한 근접 공격을 합니다", keywords: ["해머", "묵직", "근접"] },
  { name: "워로드", trait: "방패로 아군을 보호하며 전선에 섭니다", keywords: ["방패", "보호", "전선"] },
  { name: "버서커", trait: "대검을 쓰며 폭주 모드로 싸웁니다", keywords: ["대검", "폭주"] },
  { name: "홀리나이트", trait: "신성 스킬과 버프로 아군을 지원합니다", keywords: ["신성", "버프", "지원"] },
  { name: "슬레이어", trait: "대검을 쓰며 폭주 모드로 싸웁니다", keywords: ["대검", "폭주"] },
  { name: "발키리", trait: "수호 스킬과 치유로 아군을 돕습니다", keywords: ["수호", "치유", "지원"] },
  { name: "스트라이커", trait: "빠른 체술과 공중 콤보를 사용합니다", keywords: ["체술", "콤보", "빠른"] },
  { name: "브레이커", trait: "기동성과 강한 한방, 여러 콤보를 활용합니다", keywords: ["기동", "한방", "콤보"] },
  { name: "배틀마스터", trait: "빠른 체술과 엘리멘탈 스킬을 사용합니다", keywords: ["체술", "엘리멘탈", "빠른"] },
  { name: "인파이터", trait: "헤비 건틀릿으로 가까이 파고들어 싸웁니다", keywords: ["건틀릿", "근접", "파고"] },
  { name: "기공사", trait: "내공으로 근거리와 원거리 공격을 조합합니다", keywords: ["내공", "근거리", "원거리"] },
  { name: "창술사", trait: "창의 난무·집중 스탠스를 바꿔 싸웁니다", keywords: ["창", "스탠스", "난무", "집중"] },
  { name: "데빌헌터", trait: "세 가지 총기 스탠스를 상황에 맞춰 바꿉니다", keywords: ["총기", "스탠스", "핸드건", "샷건", "라이플"] },
  { name: "블래스터", trait: "중화기로 넓은 범위를 공격합니다", keywords: ["중화기", "광역", "포격"] },
  { name: "호크아이", trait: "활과 특수 화살로 민첩하게 전투합니다", keywords: ["활", "화살", "민첩"] },
  { name: "스카우터", trait: "드론과 첨단 기술을 활용합니다", keywords: ["드론", "기술", "슈트"] },
  { name: "건슬링어", trait: "세 가지 총기 스탠스를 상황에 맞춰 바꿉니다", keywords: ["총기", "스탠스", "핸드건", "샷건", "라이플"] },
  { name: "바드", trait: "하프의 선율로 아군을 치유하고 지원합니다", keywords: ["하프", "선율", "치유", "지원"] },
  { name: "서머너", trait: "여러 정령을 소환해 원거리에서 싸웁니다", keywords: ["정령", "소환", "원거리"] },
  { name: "아르카나", trait: "카드의 힘과 스택트 효과를 활용합니다", keywords: ["카드", "스택트", "루인"] },
  { name: "소서리스", trait: "세 가지 원소의 광역 마법을 사용합니다", keywords: ["원소", "마법", "광역"] },
  { name: "블레이드", trait: "쌍검과 장검을 잇는 빠른 연계 공격을 합니다", keywords: ["쌍검", "장검", "연계"] },
  { name: "데모닉", trait: "데모닉 웨폰과 악마의 힘을 사용합니다", keywords: ["데모닉 웨폰", "악마", "악마화"] },
  { name: "리퍼", trait: "단검과 그림자, 은신을 활용합니다", keywords: ["단검", "그림자", "은신"] },
  { name: "소울이터", trait: "낫과 망자 소환, 사신화를 활용합니다", keywords: ["낫", "망자", "사신화"] },
  { name: "도화가", trait: "붓과 환영으로 아군을 지원합니다", keywords: ["붓", "환영", "지원"] },
  { name: "기상술사", trait: "날씨와 우산을 활용해 전투합니다", keywords: ["날씨", "우산", "여우비"] },
  { name: "환수사", trait: "환수와 함께 싸우거나 곰·여우로 둔갑합니다", keywords: ["환수", "곰", "여우", "둔갑"] },
  { name: "차원술사", trait: "시계와 시공간의 힘을 다룹니다", keywords: ["시계", "시공간", "차원"] },
  { name: "가디언나이트", trait: "할버드로 묵직하게 공격하고 화신화합니다", keywords: ["할버드", "화신화", "날개"] },
] as const;

export type LostArkClass = (typeof LOST_ARK_CLASSES)[number]["name"];

export function findLostArkClass(name: string) {
  return LOST_ARK_CLASSES.find((candidate) => candidate.name === name);
}
