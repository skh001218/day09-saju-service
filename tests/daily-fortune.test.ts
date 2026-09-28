import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { calculate, type SajuChart } from "../lib/saju/chart";
import { getDailyFortune } from "../lib/saju/daily-fortune";

const chart = calculate({
  date: "2000-01-01",
  time: "12:00",
  calendar: "solar",
  topic: "general",
});

test("012: 같은 사주와 한국 날짜의 운세는 반복 계산해도 같고 원본을 바꾸지 않는다", () => {
  const before = JSON.stringify(chart);
  const first = getDailyFortune(chart, "2024-02-03");
  assert.deepEqual(getDailyFortune(chart, "2024-02-03"), first);
  assert.equal(first.date, "2024-02-03");
  for (const sentence of [first.flow, first.action, first.caution]) {
    assert.equal(typeof sentence, "string");
    assert.ok(sentence.trim().length > 0);
  }
  assert.equal(JSON.stringify(chart), before);
});

test("012: 오늘 일주는 그날 정오를 사용해 계산한다", () => {
  for (const date of ["2024-02-03", "2024-02-04", "2024-02-05"]) {
    const noonPillar = calculate({
      date,
      time: "12:00",
      calendar: "solar",
      topic: "general",
    }).pillars[2].text;
    assert.equal(getDailyFortune(chart, date).todayPillar, noonPillar);
  }
});

test("012: 연속 날짜의 세 문장이 전날과 모두 동일하게 반복되지 않는다", () => {
  const dates = Array.from({ length: 31 }, (_, offset) =>
    new Date(Date.UTC(2024, 0, offset + 1)).toISOString().slice(0, 10),
  );
  const results = dates.map((date) => getDailyFortune(chart, date));
  assert.ok(new Set(results.map(({ todayPillar }) => todayPillar)).size > 1);
  for (let index = 1; index < results.length; index++) {
    const current = results[index];
    const previous = results[index - 1];
    assert.notDeepEqual(
      [current.flow, current.action, current.caution],
      [previous.flow, previous.action, previous.caution],
      `${dates[index - 1]}와 ${dates[index]}의 세 문장이 같습니다`,
    );
  }
});

test("012: 잘못된 날짜와 손상된 사주를 개인화된 운세로 바꾸지 않는다", () => {
  for (const date of ["2024-02-30", "2024-13-01", "2024-2-03", "", "not-a-date"]) {
    assert.throws(() => getDailyFortune(chart, date));
  }
  for (const damaged of [
    null,
    {},
    { ...chart, dayMaster: { ...chart.dayMaster, element: "나무" } },
    { ...chart, dayMaster: { ...chart.dayMaster, character: "X" } },
    { ...chart, pillars: [] },
  ]) {
    assert.throws(() => getDailyFortune(damaged as SajuChart, "2024-02-03"));
  }
});

test("012: 계산 결과와 재열기 화면은 현재 한국 날짜의 운세를 표시하고 자정에 갱신한다", async () => {
  const form = await readFile(join(process.cwd(), "app/saju-form.tsx"), "utf8");
  const section = await readFile(join(process.cwd(), "app/daily-fortune.tsx"), "utf8");
  assert.match(form, /<DailyFortuneSection chart=\{chart\}/);
  assert.match(section, /todayInKorea\(now\)/);
  assert.match(section, /setTimeout\(update, untilNextKoreanDay\(now\)\)/);
  assert.match(section, /visibilitychange/);
  assert.match(section, /getDailyFortune\(chart, date\)/);
  for (const label of ["오늘의 흐름", "해볼 만한 행동", "주의할 점", "오락용", "계산할 수 없어요"]) {
    assert.ok(section.includes(label), `${label} 안내가 없습니다`);
  }
});
