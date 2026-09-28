export const TOPIC_FORTUNE_VERSION = 2;

export type DailyTopicFortune = {
  date: string;
  todayPillar: string;
  money: string;
  health: string;
  work: string;
};

export function hasDuplicateTopic(
  candidate: Pick<DailyTopicFortune, "money" | "health" | "work">,
  others: Array<Pick<DailyTopicFortune, "money" | "health" | "work">>,
): boolean {
  const normalize = (value: string) => value.replace(/\s+/g, "").trim();
  return others.some((other) =>
    (["money", "health", "work"] as const).some((topic) => normalize(candidate[topic]) === normalize(other[topic])));
}

const prohibited = /(?:수익률|투자\s*종목|대출\s*(?:받|결정)|진단|치료|약\s*복용|처방|합격|승진|해고|반드시|확실히|틀림없이|암|당뇨|우울증)/;

export function parseTopicTexts(value: unknown): Pick<DailyTopicFortune, "money" | "health" | "work"> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const texts = [row.money, row.health, row.work];
  if (texts.some((item) => {
    if (typeof item !== "string") return true;
    const length = item.replace(/\s/g, "").length;
    const sentences = item.trim().split(/[.!?。！？]+/).filter((part) => part.trim()).length;
    return length < 10 || length > 300 || sentences > 2 || prohibited.test(item);
  })) return null;
  return { money: (row.money as string).trim(), health: (row.health as string).trim(), work: (row.work as string).trim() };
}

export function parseDailyTopicFortune(value: unknown): DailyTopicFortune | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
    Number.isNaN(Date.parse(`${row.date}T00:00:00Z`)) ||
    new Date(`${row.date}T00:00:00Z`).toISOString().slice(0, 10) !== row.date ||
    typeof row.todayPillar !== "string" ||
    !/^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]$/.test(row.todayPillar)) return null;
  const texts = parseTopicTexts(row);
  return texts ? { date: row.date, todayPillar: row.todayPillar, ...texts } : null;
}
