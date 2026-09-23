import type { SajuChart } from "./chart";

export const ELEMENT_OVERVIEW = [
  { name: "목", meaning: "자라나고 뻗어 가는 나무의 이미지예요." },
  { name: "화", meaning: "밝히고 퍼지는 불의 이미지예요." },
  { name: "토", meaning: "받치고 이어 주는 땅의 이미지예요." },
  { name: "금", meaning: "단단하게 다듬고 정리하는 쇠의 이미지예요." },
  { name: "수", meaning: "흐르고 스며드는 물의 이미지예요." },
] as const;

export type ElementCount = {
  name: (typeof ELEMENT_OVERVIEW)[number]["name"];
  meaning: string;
  count: number;
};

export function getElementOverview(elements: unknown): ElementCount[] | null {
  if (!elements || typeof elements !== "object" || Array.isArray(elements)) return null;

  const counts = elements as Partial<SajuChart["elements"]>;
  const overview = ELEMENT_OVERVIEW.map(({ name, meaning }) => ({
    name,
    meaning,
    count: counts[name],
  }));

  if (overview.some(({ count }) => !Number.isInteger(count) || (count as number) < 0)) {
    return null;
  }
  if (overview.reduce((sum, { count }) => sum + (count as number), 0) !== 8) return null;

  return overview as ElementCount[];
}
