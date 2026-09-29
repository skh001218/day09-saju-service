import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { calculate, todayInKorea } from "../lib/saju/chart";
import { hasDuplicateTopic, parseDailyTopicFortune } from "../lib/saju/daily-topic-fortune";
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

test("016: 같은 주제의 문구만 공백을 정규화해 다른 출생정보의 중복으로 판정한다", () => {
  const other = { ...valid, money: valid.money.replaceAll(" ", "\n  ") };
  assert.equal(hasDuplicateTopic(valid, [other]), true);
  assert.equal(hasDuplicateTopic(valid, [{ ...valid, money: "완전히 다른 소비 습관을 살펴보는 문장입니다.",
    health: "다른 몸의 리듬을 살펴보는 생활 문장입니다.", work: "다른 업무 제안을 나눠보는 생활 문장입니다." }]), false);
  assert.equal(hasDuplicateTopic(valid, []), false);
});

test("016: 프롬프트는 한글 기둥과 재생성 맥락을 담되 원문 출생정보를 보내지 않는다", () => {
  const otherAdvice = { money: "이미 사용한 소비 제안의 내용입니다.", health: "이미 사용한 휴식 제안의 내용입니다.",
    work: "이미 사용한 협업 제안의 내용입니다." };
  const prompt = makeDailyTopicPrompt(chart, date, pillar, 1, [otherAdvice]);
  for (const item of chart.pillars) assert.ok(prompt.includes(item.korean));
  assert.ok(prompt.includes("다른 출생 사주"));
  assert.ok(prompt.includes("오늘 일주"));
  assert.ok(prompt.includes(otherAdvice.money));
  assert.ok(prompt.includes(otherAdvice.health));
  assert.ok(prompt.includes(otherAdvice.work));
  assert.equal(prompt.includes(birthDate), false);
  assert.equal(prompt.includes(birthTime), false);
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

test("016: 갱신 권한은 본인 행의 문구·버전·모델 열로 제한한다", async () => {
  const directory = join(process.cwd(), "supabase/migrations");
  const migration = (await readdir(directory)).find((name) => name.includes("allow_topic_fortune_refresh") && name.endsWith(".sql"));
  assert.ok(migration, "주제별 운세 갱신 migration이 필요합니다");
  const sql = await readFile(join(directory, migration), "utf8");
  assert.match(sql, /grant\s+update\s*\(\s*money\s*,\s*health\s*,\s*work\s*,\s*fortune_version\s*,\s*model\s*\)/i);
  assert.match(sql, /for update to authenticated\s+using\s*\(user_id\s*=\s*\(select auth\.uid\(\)\)\)\s+with check\s*\(user_id\s*=\s*\(select auth\.uid\(\)\)\)/i);
  assert.doesNotMatch(sql, /grant\s+update\s+on\s+table/i);
  assert.doesNotMatch(sql, /grant\s+[^;]*\bto\s+anon\b/i);
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
