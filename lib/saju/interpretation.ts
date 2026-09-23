import type { SajuChart } from "./chart";
import { findLostArkClass, LOST_ARK_CLASSES } from "./lost-ark-classes";

export type Interpretation = {
  personality: string;
  strengths: string;
  cautions: string;
};

export type Recommendation = {
  recommendedClass: string;
  recommendationReason: string;
};

export type CompatibleType = {
  element: "목" | "화" | "토" | "금" | "수";
  tendency: string;
  reason: string;
};

export type RecommendedInterpretation = Interpretation & {
  recommended_class: string;
  recommendation_reason: string;
  compatible_types: CompatibleType[];
};

const fields = ["personality", "strengths", "cautions"] as const;

export function parseInterpretation(value: unknown): Interpretation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("해석 형식이 올바르지 않습니다.");
  }

  const result = value as Record<string, unknown>;
  for (const field of fields) {
    const text = result[field];
    if (
      typeof text !== "string" ||
      text.trim().length < 10 ||
      text.trim().length > 300
    ) {
      throw new Error("해석 형식이 올바르지 않습니다.");
    }
  }

  return {
    personality: (result.personality as string).trim(),
    strengths: (result.strengths as string).trim(),
    cautions: (result.cautions as string).trim(),
  };
}

export function parseRecommendation(value: unknown): Recommendation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("해석 형식이 올바르지 않습니다.");
  }
  const result = value as Record<string, unknown>;
  const name = result.recommended_class;
  const reason = result.recommendation_reason;
  const trimmedName = typeof name === "string" ? name.trim() : "";
  if (typeof name !== "string" ||
    typeof reason !== "string" || !findLostArkClass(trimmedName) ||
    reason.trim().length < 10 || reason.trim().length > 300) {
    throw new Error("해석 형식이 올바르지 않습니다.");
  }
  const trimmed = reason.trim();
  const selected = findLostArkClass(trimmedName);
  if (!selected || !trimmed.includes(trimmedName) ||
    !selected.keywords.some((keyword) => trimmed.includes(keyword)) ||
    /(?:최강|최고의 성능|승률|티어|DPS|딜량)/i.test(trimmed)) {
    throw new Error("해석 형식이 올바르지 않습니다.");
  }
  return { recommendedClass: trimmedName, recommendationReason: trimmed };
}

export function parseCompatibleTypes(value: unknown): CompatibleType[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 3) {
    throw new Error("잘 맞는 사람 유형 형식이 올바르지 않습니다.");
  }
  const elements = new Set<string>();
  return value.map((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("잘 맞는 사람 유형 형식이 올바르지 않습니다.");
    }
    const row = item as Record<string, unknown>;
    const element = row.element;
    const tendency = row.tendency;
    const reason = row.reason;
    if (typeof element !== "string" || !["목", "화", "토", "금", "수"].includes(element) ||
      elements.has(element) || typeof tendency !== "string" ||
      tendency.trim().length < 10 || tendency.trim().length > 300 ||
      typeof reason !== "string" || reason.trim().length < 10 || reason.trim().length > 300) {
      throw new Error("잘 맞는 사람 유형 형식이 올바르지 않습니다.");
    }
    elements.add(element);
    return {
      element: element as CompatibleType["element"],
      tendency: tendency.trim(),
      reason: reason.trim(),
    };
  });
}

export function parseRecommendedInterpretation(value: unknown): RecommendedInterpretation {
  const interpretation = parseInterpretation(value);
  const recommendation = parseRecommendation(value);
  return {
    ...interpretation,
    recommended_class: recommendation.recommendedClass,
    recommendation_reason: recommendation.recommendationReason,
    compatible_types: parseCompatibleTypes((value as Record<string, unknown>).compatible_types),
  };
}

export function makeInterpretationPrompt(chart: SajuChart): string {
  const pillars = chart.pillars.map(({ label, text }) => `${label}: ${text}`);
  const elements = Object.entries(chart.elements).map(
    ([element, count]) => `${element} ${count}`,
  );

  return [
    "다음 사주 계산 결과를 처음 접하는 사람에게 설명해 주세요.",
    "성향(personality), 강점(strengths), 주의점(cautions)을 각각 한국어 1~2문장으로 작성하세요.",
    "또한 오락용으로 어울리는 로스트아크 세부 직업 하나(recommended_class)와 추천 이유(recommendation_reason)를 한국어 1~2문장으로 작성하세요.",
    "recommended_class는 아래 목록의 직업명 하나를 정확하게 복사하세요. recommendation_reason에는 그 직업명과 아래에 적힌 공식 소개 특징 한 가지를 반드시 넣고, 사주 특성과 재미있게 연결하세요.",
    "직업의 알려지지 않은 스킬이나 현재 성능, 승률, 순위는 지어내지 마세요. 성별, 나이, 출생 연도로 직업을 판단하지 마세요. 실제 게임 실력이나 적성을 단정하지 마세요.",
    "함께 지내기 편할 수 있는 사람의 오행·성향 유형 2~3가지(compatible_types)를 작성하세요. 각 항목은 element(목·화·토·금·수 중 하나), tendency(쉬운 성향 한 문장), reason(아래 내 사주 특성과 이 유형을 연결하는 이유 1~2문장)으로 만드세요. 같은 오행을 중복하지 말고 순위나 점수를 매기지 마세요.",
    "이는 사람을 찾거나 실제 궁합을 계산하는 기능이 아닙니다. 상대방의 출생 정보를 아는 척하지 마세요. 성별·나이·출생 연도·장애를 기준으로 추천하지 마세요. 오행 하나나 상생·상극만으로 관계를 단정하지 마세요. 실제 관계는 가치관·행동·소통에 따라 달라집니다.",
    `선택 가능한 직업과 공식 소개 특징: ${LOST_ARK_CLASSES.map(({ name, trait }) => `${name}(${trait})`).join("; ")}`,
    "사주를 다시 계산하거나 생년월일을 추측하지 마세요. 어려운 용어는 풀어 쓰고, 성격이나 미래를 단정하지 마세요.",
    "질병 진단, 투자·재정 판단, 불안을 주는 예언은 하지 마세요.",
    ...pillars,
    `일간: ${chart.dayMaster.character} (${chart.dayMaster.element})`,
    `대표 오행 수: ${elements.join(", ")}`,
    "오행 수는 대표 8자를 단순 집계한 값입니다. 강약을 확정하는 근거로 쓰지 마세요.",
  ].join("\n");
}
