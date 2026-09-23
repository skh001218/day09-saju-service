import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { calculate } from "../lib/saju/chart";
import { ELEMENT_OVERVIEW, getElementOverview } from "../lib/saju/elements-overview";
import { HISTORY_KEY, loadHistory } from "../lib/saju/history";

const meanings = [
  ["목", "자라나고 뻗어 가는 나무의 이미지예요."],
  ["화", "밝히고 퍼지는 불의 이미지예요."],
  ["토", "받치고 이어 주는 땅의 이미지예요."],
  ["금", "단단하게 다듬고 정리하는 쇠의 이미지예요."],
  ["수", "흐르고 스며드는 물의 이미지예요."],
];

test("006: 다섯 오행의 순서와 기본 뜻은 명세대로 고정된다", () => {
  assert.deepEqual(ELEMENT_OVERVIEW.map(({ name, meaning }) => [name, meaning]), meanings);
});

test("006: 정상 계산은 0개도 포함해 다섯 오행과 합계 8을 보여주며 원본을 바꾸지 않는다", () => {
  const chart = calculate({ date: "2000-01-01", time: "12:00", calendar: "solar", topic: "general" });
  const before = JSON.stringify(chart);
  const overview = getElementOverview(chart.elements);
  assert.ok(overview);
  assert.deepEqual(overview.map(({ name }) => name), meanings.map(([name]) => name));
  assert.equal(overview.reduce((sum, { count }) => sum + count, 0), 8);
  assert.ok(overview.some(({ count }) => count === 0));
  assert.deepEqual(overview.map(({ name, count }) => count), overview.map(({ name }) => chart.elements[name]));
  assert.equal(JSON.stringify(chart), before);
});

test("006: 손상된 값은 추측하거나 보정하지 않고 거부한다", () => {
  const valid = { 목: 1, 화: 2, 토: 3, 금: 1, 수: 1 };
  for (const bad of [
    null,
    [],
    { ...valid, 수: undefined },
    { ...valid, 목: -1, 수: 3 },
    { ...valid, 화: 1.5, 수: 1.5 },
    { ...valid, 금: "1" },
    { ...valid, 수: Number.NaN },
    { ...valid, 수: 2 },
  ]) assert.equal(getElementOverview(bad), null);
  assert.deepEqual(getElementOverview(valid)?.map(({ count }) => count), [1, 2, 3, 1, 1]);
});

test("006: 과거 브라우저 기록을 읽어도 저장 데이터는 그대로다", () => {
  const chart = calculate({ date: "2000-01-01", time: "12:00", calendar: "solar", topic: "general" });
  const raw = JSON.stringify([{
    id: "old", savedAt: "2026-09-23T00:00:00.000Z", date: "2000-01-01", time: "12:00", chart,
    interpretation: { personality: "차분하게 자신의 속도를 지키는 편이에요.", strengths: "맡은 일을 꾸준히 이어가는 힘이 있어요.", cautions: "가끔은 쉬어 가며 주변의 도움도 받아 보세요." },
  }]);
  const storage = { getItem(key: string) { return key === HISTORY_KEY ? raw : null; }, setItem() { throw new Error("읽기 전용"); } };
  const loaded = loadHistory(storage);
  assert.equal(loaded.records.length, 1);
  assert.deepEqual(getElementOverview(loaded.records[0].chart.elements)?.map(({ count }) => count), getElementOverview(chart.elements)?.map(({ count }) => count));
  assert.equal(storage.getItem(HISTORY_KEY), raw);
});

test("006: 계산 결과와 과거 기록 화면 모두 오행 컴포넌트를 사용한다", async () => {
  const source = await readFile(join(process.cwd(), "app/saju-form.tsx"), "utf8");
  const overview = await readFile(join(process.cwd(), "app/five-elements-overview.tsx"), "utf8");
  assert.match(source, /<FiveElementsOverview elements=\{chart\.elements\}/);
  assert.match(overview, /오행 개수를 표시할 수 없습니다/);
  assert.match(overview, /오행의 강약·부족함이나 실제 성격을 단정할 수 없습니다/);
});
