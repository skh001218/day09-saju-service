import test from "node:test";
import assert from "node:assert/strict";
import { calculate } from "../lib/saju/chart";
import { HISTORY_KEY, deleteResult, loadHistory, saveResult, type SavedResult } from "../lib/saju/history";

const chart = calculate({ date: "2000-01-01", time: "12:00", calendar: "solar", topic: "general" });
const record = (id: string): SavedResult => ({
  id,
  savedAt: "2026-09-23T00:00:00.000Z",
  date: "2000-01-01",
  time: "12:00",
  chart,
  interpretation: {
    personality: "차분하게 자신의 속도를 지키는 편이에요.",
    strengths: "맡은 일을 꾸준히 이어가는 힘이 있어요.",
    cautions: "가끔은 쉬어 가며 주변의 도움도 받아 보세요.",
  },
});

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const entries = new Map<string, string>();
  return {
    getItem(key) { return entries.get(key) ?? null; },
    setItem(key, value) { entries.set(key, value); },
  };
}

test("여러 기록을 저장하고 다시 읽고 하나만 삭제한다", () => {
  const storage = memoryStorage();
  assert.deepEqual(loadHistory(storage), { records: [], warning: false });
  saveResult(storage, record("first"));
  saveResult(storage, record("second"));
  assert.deepEqual(loadHistory(storage).records.map(({ id }) => id), ["second", "first"]);
  assert.deepEqual(deleteResult(storage, "first").map(({ id }) => id), ["second"]);
  assert.deepEqual(loadHistory(storage).records.map(({ id }) => id), ["second"]);
});

test("손상된 개별 기록은 건너뛰고 정상 기록을 유지한다", () => {
  const storage = memoryStorage();
  storage.setItem(HISTORY_KEY, JSON.stringify([record("valid"), { id: "broken" }]));
  assert.deepEqual(loadHistory(storage).records.map(({ id }) => id), ["valid"]);
  assert.equal(loadHistory(storage).warning, true);
});

test("잘못된 저장 형식과 저장소 읽기 실패를 경고로 돌려준다", () => {
  const storage = memoryStorage();
  storage.setItem(HISTORY_KEY, "{broken");
  assert.deepEqual(loadHistory(storage), { records: [], warning: true });
  assert.deepEqual(loadHistory({ getItem() { throw new Error("blocked"); }, setItem() {} }), { records: [], warning: true });
});

test("저장 공간이 막히면 저장 실패를 호출자에게 전달한다", () => {
  const storage = { getItem() { return null; }, setItem() { throw new Error("quota"); } };
  assert.throws(() => saveResult(storage, record("first")), /quota/);
});
