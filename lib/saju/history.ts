import type { SajuChart } from "./chart";
import { parseInterpretation, type Interpretation } from "./interpretation";

export const HISTORY_KEY = "saju-results-v1";

export type SavedResult = {
  id: string;
  savedAt: string;
  date: string;
  time: string;
  chart: SajuChart;
  interpretation: Interpretation;
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function isSavedResult(value: unknown): value is SavedResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Partial<SavedResult>;
  const chart = entry.chart;
  if (
    typeof entry.id !== "string" || !entry.id ||
    typeof entry.savedAt !== "string" || !Number.isFinite(Date.parse(entry.savedAt)) ||
    typeof entry.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) ||
    typeof entry.time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.time) ||
    !chart || !Array.isArray(chart.pillars) || chart.pillars.length !== 4 ||
    !chart.pillars.every((item) => item && typeof item.label === "string" &&
      typeof item.text === "string" && typeof item.korean === "string") ||
    !chart.dayMaster || typeof chart.dayMaster.element !== "string" ||
    !["목", "화", "토", "금", "수"].includes(chart.dayMaster.element) ||
    typeof chart.dayMaster.korean !== "string" ||
    typeof chart.dayMaster.character !== "string" ||
    typeof chart.method !== "string"
  ) return false;

  try {
    parseInterpretation(entry.interpretation);
    return true;
  } catch {
    return false;
  }
}

function readRaw(storage: StorageLike): unknown[] {
  const text = storage.getItem(HISTORY_KEY);
  if (text === null) return [];
  const value: unknown = JSON.parse(text);
  if (!Array.isArray(value)) throw new Error("저장된 결과 형식이 올바르지 않습니다.");
  return value;
}

export function loadHistory(storage: StorageLike): {
  records: SavedResult[];
  warning: boolean;
} {
  try {
    const entries = readRaw(storage);
    const records = entries.filter(isSavedResult);
    return { records, warning: records.length !== entries.length };
  } catch {
    return { records: [], warning: true };
  }
}

export function saveResult(storage: StorageLike, record: SavedResult): SavedResult[] {
  const entries = readRaw(storage);
  storage.setItem(HISTORY_KEY, JSON.stringify([record, ...entries]));
  return loadHistory(storage).records;
}

export function deleteResult(storage: StorageLike, id: string): SavedResult[] {
  const entries = readRaw(storage);
  storage.setItem(
    HISTORY_KEY,
    JSON.stringify(entries.filter((entry) =>
      !entry || typeof entry !== "object" || (entry as { id?: unknown }).id !== id,
    )),
  );
  return loadHistory(storage).records;
}
