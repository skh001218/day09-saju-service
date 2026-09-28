import { calculate, type SajuChart } from "./chart";
import { getElementRelations, type ElementName } from "./element-relations";

type FortuneText = { flow: string; action: string; caution: string };
type Relation = "same" | "supportsMe" | "iSupport" | "iControl" | "controlsMe";

export type DailyFortune = FortuneText & {
  date: string;
  todayPillar: string;
};

export const FORTUNE_VERSION = 1;
const words: Record<Relation, readonly FortuneText[]> = {
  same: [
    { flow: "익숙한 방식에서 편안함을 찾기 좋은 하루예요.", action: "하던 일 하나를 차분히 마무리해 보세요.", caution: "익숙하다는 이유로 다른 의견을 지나치지 마세요." },
    { flow: "평소의 리듬을 되찾는 데 마음이 갈 수 있어요.", action: "오늘 꼭 필요한 일부터 순서대로 해 보세요.", caution: "모든 일을 혼자 해결하려고 애쓰지 마세요." },
    { flow: "내 생각을 정리하기 좋은 흐름이에요.", action: "머릿속에 있던 계획을 짧게 적어 보세요.", caution: "처음 떠오른 생각만 고집하지 마세요." },
  ],
  supportsMe: [
    { flow: "주변의 도움을 살펴보기 좋은 하루예요.", action: "막힌 일이 있다면 믿을 만한 사람에게 물어보세요.", caution: "도움을 받아야 한다는 부담을 느끼지 않아도 돼요." },
    { flow: "배우고 익히는 일에 마음을 두기 좋아요.", action: "궁금했던 것 하나를 찾아보세요.", caution: "정보를 한꺼번에 너무 많이 담으려 하지 마세요." },
    { flow: "잠시 숨을 고르면 다음 걸음이 보일 수 있어요.", action: "짧은 휴식 뒤에 중요한 일을 다시 살펴보세요.", caution: "쉬는 시간을 미뤄 두지 마세요." },
  ],
  iSupport: [
    { flow: "내가 가진 것을 나누고 싶어질 수 있어요.", action: "작은 경험이나 아이디어를 필요한 사람과 나눠 보세요.", caution: "상대가 원하는 방식인지 먼저 살펴보세요." },
    { flow: "생각을 표현하는 일이 가볍게 느껴질 수 있어요.", action: "미뤄 둔 메시지 한 통을 써 보세요.", caution: "말을 서두르기보다 상대의 반응도 들어보세요." },
    { flow: "작은 결과물을 만들기에 어울리는 하루예요.", action: "완벽하지 않아도 첫 번째 초안을 만들어 보세요.", caution: "한 번에 모든 것을 끝내려 하지 마세요." },
  ],
  iControl: [
    { flow: "정리할 일을 하나 고르기 좋은 하루예요.", action: "미뤄 둔 작은 일을 하나만 처리해 보세요.", caution: "속도를 내느라 중요한 부분을 놓치지 마세요." },
    { flow: "우선순위를 다시 세워 볼 만한 흐름이에요.", action: "오늘 할 일과 나중에 할 일을 나눠 보세요.", caution: "계획을 세웠다고 무리하게 채우지 마세요." },
    { flow: "손에 잡히는 목표부터 시작하기 좋아요.", action: "짧은 시간 안에 할 수 있는 첫 단계를 정해 보세요.", caution: "결과를 빨리 확인하려고 조급해하지 마세요." },
  ],
  controlsMe: [
    { flow: "요청과 일정이 눈에 띌 수 있는 하루예요.", action: "지금 할 수 있는 범위를 먼저 확인해 보세요.", caution: "어려운 부탁에는 잠시 생각할 시간을 가져도 돼요." },
    { flow: "기준을 다시 살피고 싶어질 수 있어요.", action: "중요한 약속의 조건을 차분히 확인해 보세요.", caution: "작은 실수를 지나치게 크게 받아들이지 마세요." },
    { flow: "잠깐 멈추고 방향을 고르기 좋은 흐름이에요.", action: "오늘 꼭 필요한 선택 하나에 집중해 보세요.", caution: "남의 기대에 맞추느라 내 속도를 잃지 마세요." },
  ],
};

function validDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() + 1 === month &&
    parsed.getUTCDate() === day;
}

export function parseDailyFortune(value: unknown): DailyFortune | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.date !== "string" || !validDate(row.date) ||
    typeof row.todayPillar !== "string" ||
    !/^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]$/.test(row.todayPillar) ||
    [row.flow, row.action, row.caution].some((text) =>
      typeof text !== "string" || text.trim().length < 1 || text.trim().length > 300)) {
    return null;
  }
  return {
    date: row.date,
    todayPillar: row.todayPillar,
    flow: (row.flow as string).trim(),
    action: (row.action as string).trim(),
    caution: (row.caution as string).trim(),
  };
}

function relation(self: ElementName, today: ElementName): Relation {
  const related = getElementRelations(self)!;
  if (today === self) return "same";
  if (today === related.generatedBy) return "supportsMe";
  if (today === related.generates) return "iSupport";
  if (today === related.controls) return "iControl";
  return "controlsMe";
}

function birthOffset(chart: SajuChart): number {
  const identity = chart.pillars.map(({ text }) => text).join("");
  let value = FORTUNE_VERSION;
  for (const character of identity) value = (value * 31 + character.charCodeAt(0)) >>> 0;
  return value % 3;
}

export function getDailyFortune(chart: SajuChart, date: string): DailyFortune {
  const self = getElementRelations(chart?.dayMaster?.element)?.self;
  if (!self || !Array.isArray(chart.pillars) || chart.pillars.length !== 4 ||
    chart.pillars.some((item) => !item || typeof item.text !== "string" ||
      !/^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]$/.test(item.text)) ||
    chart.dayMaster.character !== chart.pillars[2].text[0] ||
    chart.dayMaster.element !== chart.pillars[2].stemElement ||
    !validDate(date)) {
    throw new Error("일일 운세를 계산할 수 없습니다.");
  }

  // Use noon so the natal chart's 23:00 day rollover cannot change today's reading.
  const todayChart = calculate({ date, time: "12:00", calendar: "solar", topic: "general" });
  const todayPillar = todayChart.pillars[2];
  const todayElement = getElementRelations(todayPillar.stemElement)?.self;
  if (!todayElement) throw new Error("일일 운세를 계산할 수 없습니다.");

  const dayNumber = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
  const candidates = words[relation(self, todayElement)];
  const text = candidates[(dayNumber + birthOffset(chart)) % candidates.length];
  return { date, todayPillar: todayPillar.text, ...text };
}
