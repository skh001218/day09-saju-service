import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { calculate, todayInKorea } from "../lib/saju/chart";
import { parseDailyTopicFortune } from "../lib/saju/daily-topic-fortune";
import { generateDailyTopicFortune, makeDailyTopicPrompt } from "../lib/saju/topic-gemini";

const birthDate = "2000-01-01";
const birthTime = "12:00";
const chart = calculate({ date: birthDate, time: birthTime, calendar: "solar", topic: "general" });
const date = todayInKorea();
const pillar = calculate({ date, time: "12:00", calendar: "solar", topic: "general" }).pillars[2].text;
const valid = {
  date,
  todayPillar: pillar,
  money: "오늘은 작은 지출을 천천히 돌아보며 필요한 항목을 정리해 보세요.",
  health: "잠깐씩 쉬면서 물을 마시고 몸의 편안한 리듬을 살펴보세요.",
  work: "할 일을 한 가지씩 정리하고 함께하는 사람과 생각을 나눠 보세요.",
};

function responseWith(value: unknown): Response {
  return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] });
}

test("015: 주제별 운세는 세 문구가 모두 유효할 때만 받아들인다", () => {
  assert.deepEqual(parseDailyTopicFortune(valid), valid);
  for (const damaged of [
    null, [], {},
    { ...valid, date: "2024-02-30" },
    { ...valid, todayPillar: "잘못" },
    { ...valid, money: " " },
    { ...valid, health: "짧음" },
    { ...valid, work: "가".repeat(301) },
    { ...valid, money: 123 },
    { ...valid, money: "반드시 이 종목에 투자하면 수익률이 올라갑니다." },
    { ...valid, health: "이 증상은 당뇨병이니 약을 복용하세요." },
    { ...valid, work: "이번 주에 승진이 확정됩니다." },
  ]) {
    assert.equal(parseDailyTopicFortune(damaged), null, JSON.stringify(damaged));
  }
});

test("015: Gemini 프롬프트는 사주와 오늘 일주만 전달하며 개인정보 원문은 담지 않는다", () => {
  const prompt = makeDailyTopicPrompt(chart, date, pillar);
  assert.ok(prompt.includes(date));
  assert.ok(prompt.includes(pillar));
  for (const item of chart.pillars) {
    assert.ok(prompt.includes(item.stem));
    assert.ok(prompt.includes(item.branch));
  }
  assert.ok(prompt.includes(chart.dayMaster.character));
  assert.ok(prompt.includes(chart.dayMaster.element));
  assert.equal(prompt.includes(birthDate), false);
  assert.equal(prompt.includes(birthTime), false);
  for (const field of ["money", "health", "work"]) assert.ok(prompt.includes(field));
});

test("015: Gemini 구조화 응답 세 문구를 검증하고 잘못된 응답은 전체 실패로 처리한다", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return responseWith({ money: valid.money, health: valid.health, work: valid.work });
  }) as typeof fetch;
  const result = await generateDailyTopicFortune(chart, date, pillar, "test-key", fetcher);
  assert.equal(result.money, valid.money);
  assert.equal(result.health, valid.health);
  assert.equal(result.work, valid.work);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /generativelanguage\.googleapis\.com/);
  assert.equal((calls[0].init.headers as Record<string, string>)["x-goog-api-key"], "test-key");
  assert.equal(calls[0].init.cache, "no-store");
  const body = JSON.stringify(JSON.parse(String(calls[0].init.body)));
  assert.equal(body.includes(birthDate), false);
  assert.equal(body.includes(birthTime), false);

  for (const bad of [
    { money: valid.money, health: valid.health },
    { money: valid.money, health: valid.health, work: "합격이 확정됩니다." },
  ]) {
    await assert.rejects(() => generateDailyTopicFortune(chart, date, pillar, "test-key", (async () => responseWith(bad)) as typeof fetch));
  }
});

test("015: Gemini HTTP 실패와 깨진 JSON은 조용히 가짜 운세로 대체되지 않는다", async () => {
  await assert.rejects(() => generateDailyTopicFortune(chart, date, pillar, "test-key", (async () => new Response("", { status: 400 })) as typeof fetch));
  await assert.rejects(() => generateDailyTopicFortune(chart, date, pillar, "test-key", (async () => Response.json({ candidates: [{ content: { parts: [{ text: "not json" }] } }] })) as typeof fetch));
});

test("015: migration은 계정·출생정보·날짜 고유 제약과 읽기·삽입 RLS를 둔다", async () => {
  const directory = join(process.cwd(), "supabase/migrations");
  const migration = (await readdir(directory)).find((name) => name.includes("daily_topic_fortunes") && name.endsWith(".sql"));
  assert.ok(migration, "주제별 일일 운세 migration이 필요합니다");
  const files = await readFile(join(directory, migration), "utf8");
  assert.match(files, /create table(?:\s+if not exists)?\s+public\.saju_daily_topic_fortunes/i);
  assert.match(files, /unique\s*\(\s*user_id\s*,\s*birth_date\s*,\s*birth_time\s*,\s*fortune_date\s*\)/i);
  assert.match(files, /enable row level security/i);
  assert.match(files, /for select to authenticated/i);
  assert.match(files, /for insert to authenticated/i);
  assert.doesNotMatch(files, /grant\s+update\b/i);
  assert.doesNotMatch(files, /grant\s+[^;]*\bto\s+anon\b/i);
});

test("015: 계정 해석 화면에만 연결되고 자정·탭 복귀·늦은 응답을 처리한다", async () => {
  const form = await readFile(join(process.cwd(), "app/saju-form.tsx"), "utf8");
  const component = await readFile(join(process.cwd(), "app/daily-topic-fortune.tsx"), "utf8");
  assert.match(form, /authUser\s*&&\s*activeAccountId\s*&&\s*calculatedInput\s*&&\s*\(\s*<DailyTopicFortuneSection/);
  assert.match(component, /todayInKorea\(now\)/);
  assert.match(component, /setTimeout\(refresh, untilNextKoreanDay\(now\)\)/);
  assert.match(component, /visibilitychange/);
  assert.match(component, /controller\.abort\(\)/);
  assert.match(component, /if\s*\(!active\)\s*return/);
  assert.match(component, /state\?\.key === key \? state : null/);
  assert.match(component, /fortune\.date !== date/);
  assert.match(component, /JSON\.stringify\(\{ date: birthDate, time: birthTime \}\)/);
  for (const text of ["금전운", "건강운", "직장운", "오락용", "재정·건강·직업", "다시 시도", "로그인이 만료"]) {
    assert.ok(component.includes(text), `${text} 안내가 없습니다`);
  }
});
