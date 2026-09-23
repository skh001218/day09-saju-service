import type { SajuChart } from "./chart";
import { parseInterpretation, type Interpretation, type Recommendation } from "./interpretation";

export type DatabaseResult = {
  id: string;
  savedAt: string;
  date: string;
  time: string;
  chart: SajuChart;
  interpretation: Interpretation;
  recommendation: Recommendation | null;
  model: string;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuid.test(value);
}

function isChart(value: unknown): value is SajuChart {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const chart = value as Partial<SajuChart>;
  const elements = chart.elements;
  return Array.isArray(chart.pillars) && chart.pillars.length === 4 &&
    chart.pillars.every((item) => item &&
      typeof item.label === "string" &&
      typeof item.text === "string" &&
      typeof item.korean === "string" &&
      typeof item.stem === "string" &&
      typeof item.branch === "string" &&
      typeof item.stemElement === "string" &&
      typeof item.branchElement === "string") &&
    !!elements && ["목", "화", "토", "금", "수"].every((key) =>
      Number.isInteger(elements[key as keyof typeof elements]) &&
      elements[key as keyof typeof elements] >= 0) &&
    !!chart.dayMaster &&
    typeof chart.dayMaster.character === "string" &&
    typeof chart.dayMaster.korean === "string" &&
    ["목", "화", "토", "금", "수"].includes(chart.dayMaster.element) &&
    typeof chart.method === "string" &&
    typeof chart.engine === "string" &&
    typeof chart.elementMethod === "string";
}

export function parseDatabaseResult(value: unknown): DatabaseResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const rawTime = row.birth_time ?? row.time;
  const time = typeof rawTime === "string" ? rawTime.slice(0, 5) : "";
  const date = row.birth_date ?? row.date;
  const savedAt = row.created_at ?? row.savedAt;
  const rawRecommendation = row.recommendation;
  const recommendedClass = rawRecommendation && typeof rawRecommendation === "object" &&
    !Array.isArray(rawRecommendation) ? (rawRecommendation as Record<string, unknown>).recommendedClass : row.recommended_class;
  const recommendationReason = rawRecommendation && typeof rawRecommendation === "object" &&
    !Array.isArray(rawRecommendation) ? (rawRecommendation as Record<string, unknown>).recommendationReason : row.recommendation_reason;
  const hasRecommendation = recommendedClass !== null && recommendedClass !== undefined &&
    recommendationReason !== null && recommendationReason !== undefined;
  if (hasRecommendation && (typeof recommendedClass !== "string" ||
    typeof recommendationReason !== "string" ||
    recommendedClass.trim().length < 1 || recommendedClass.trim().length > 100 ||
    recommendationReason.trim().length < 10 || recommendationReason.trim().length > 300)) return null;
  if (!hasRecommendation && (recommendedClass != null || recommendationReason != null)) return null;
  if (!isUuid(row.id) ||
    typeof savedAt !== "string" || !Number.isFinite(Date.parse(savedAt)) ||
    typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) ||
    !isChart(row.chart) ||
    typeof row.model !== "string" || !row.model.trim()) return null;

  try {
    return {
      id: row.id,
      savedAt,
      date,
      time,
      chart: row.chart,
      interpretation: parseInterpretation(row.interpretation ?? {
        personality: row.personality,
        strengths: row.strengths,
        cautions: row.cautions,
      }),
      recommendation: hasRecommendation ? {
        recommendedClass: (recommendedClass as string).trim(),
        recommendationReason: (recommendationReason as string).trim(),
      } : null,
      model: row.model,
    };
  } catch {
    return null;
  }
}
