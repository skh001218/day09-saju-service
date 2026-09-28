import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createRequire } from "node:module";
import { build, type Plugin } from "esbuild";
import { calculate, todayInKorea } from "../lib/saju/chart";

const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const birthDate = "2000-01-01";
const birthTime = "12:00";
const date = todayInKorea();
const pillar = calculate({ date, time: "12:00", calendar: "solar", topic: "general" }).pillars[2].text;
const texts = {
  money: "작은 지출을 돌아보고 오늘 필요한 항목부터 차분히 정리해 보세요.",
  health: "잠깐씩 자리를 벗어나 쉬면서 편안한 생활 리듬을 살펴보세요.",
  work: "할 일을 한 가지씩 정리하고 다른 사람의 의견도 들어보세요.",
};
type Row = Record<string, unknown>;
type State = {
  userId: string | null;
  reading: boolean;
  rows: Row[];
  inserted: Row | null;
  inserts: number;
  generates: number;
  failReading: boolean;
  failLookup: boolean;
  failInsert: boolean;
  failGenerate: boolean;
  collision: Row | null;
};
let state: State;
function reset() {
  state = { userId: owner, reading: true, rows: [], inserted: null, inserts: 0, generates: 0,
    failReading: false, failLookup: false, failInsert: false, failGenerate: false, collision: null };
}
function savedRow(overrides: Row = {}): Row {
  return { user_id: owner, birth_date: birthDate, birth_time: birthTime,
    fortune_date: date, today_pillar: pillar, fortune_version: 1, model: "gemini-test", ...texts, ...overrides };
}
class Query {
  private filters: Array<[string, unknown]> = [];
  private action: "select" | "insert" = "select";
  private value: Row | null = null;
  constructor(private table: string) {}
  select() { return this; }
  eq(key: string, value: unknown) { this.filters.push([key, value]); return this; }
  limit() { return this; }
  insert(value: Row) { this.action = "insert"; this.value = value; return this; }
  maybeSingle() { return this.finish(); }
  single() { return this.finish(); }
  private finish() {
    if (this.table === "saju_interpretations") {
      if (state.failReading) return { data: null, error: { code: "PGRST500" } };
      const ownerMatches = this.filters.some(([key, value]) => key === "user_id" && value === owner);
      const dateMatches = this.filters.some(([key, value]) => key === "birth_date" && value === birthDate);
      const timeMatches = this.filters.some(([key, value]) => key === "birth_time" && value === birthTime);
      return { data: state.reading && ownerMatches && dateMatches && timeMatches ? { id: "reading" } : null, error: null };
    }
    assert.equal(this.table, "saju_daily_topic_fortunes");
    if (this.action === "insert") {
      state.inserts++;
      state.inserted = this.value;
      if (state.failInsert) return { data: null, error: { code: "PGRST500" } };
      if (state.collision) {
        state.rows.push(state.collision);
        state.collision = null;
        return { data: null, error: { code: "23505" } };
      }
      state.rows.push(this.value!);
      return { data: this.value, error: null };
    }
    if (state.failLookup) return { data: null, error: { code: "PGRST500" } };
    const found = state.rows.find((row) => this.filters.every(([key, value]) => row[key] === value));
    return { data: found ?? null, error: null };
  }
}

const plugin: Plugin = {
  name: "topic-route-stubs",
  setup(bundler) {
    bundler.onResolve({ filter: /lib[\\/]supabase[\\/]results$/ }, () => ({ path: "auth", namespace: "topic-stub" }));
    bundler.onResolve({ filter: /lib[\\/]saju[\\/]topic-gemini$/ }, () => ({ path: "gemini", namespace: "topic-stub" }));
    bundler.onLoad({ filter: /^auth$/, namespace: "topic-stub" }, () => ({
      contents: "export async function getResultsClient() { return globalThis.__topicRouteTest.auth() }", loader: "js",
    }));
    bundler.onLoad({ filter: /^gemini$/, namespace: "topic-stub" }, () => ({
      contents: "export async function generateDailyTopicFortune(...args) { return globalThis.__topicRouteTest.generate(...args) }", loader: "js",
    }));
  },
};
let route: { POST(request: Request): Promise<Response> };
test.before(async () => {
  reset();
  process.env.GEMINI_API_KEY = "test-key";
  (globalThis as typeof globalThis & { __topicRouteTest: object }).__topicRouteTest = {
    auth() { return state.userId ? { userId: state.userId, supabase: { from(table: string) { return new Query(table); } } } : null; },
    generate() {
      state.generates++;
      if (state.failGenerate) throw new Error("gemini failed");
      return texts;
    },
  };
  const built = await build({ entryPoints: [join(process.cwd(), "app/api/daily-topic-fortune/route.ts")],
    bundle: true, write: false, platform: "node", format: "cjs", packages: "external", plugins: [plugin] });
  const module = { exports: {} as typeof route };
  new Function("require", "module", "exports", built.outputFiles[0].text)(
    createRequire(join(process.cwd(), "package.json")), module, module.exports);
  route = module.exports;
});
function post(body: unknown) {
  return route.POST(new Request("http://localhost/api/daily-topic-fortune", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
}

test("015: 인증과 계정 해석 기록이 없으면 생성하지 않는다", async () => {
  reset(); state.userId = null;
  let response = await post({ date: birthDate, time: birthTime });
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(state.generates, 0);
  reset(); state.reading = false;
  response = await post({ date: birthDate, time: birthTime });
  assert.equal(response.status, 403);
  assert.equal(state.generates, 0);
  assert.equal(state.inserts, 0);
});

test("015: 같은 계정·출생정보·오늘 날짜의 저장된 문구를 재사용한다", async () => {
  reset(); state.rows.push(savedRow({ money: "이미 저장된 금전운을 오늘도 그대로 읽어 볼 수 있습니다." }));
  const response = await post({ date: birthDate, time: birthTime });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.saved, true);
  assert.equal(payload.fortune.money, state.rows[0].money);
  assert.equal(state.generates, 0);
  assert.equal(state.inserts, 0);
});

test("015: 새 문구는 서버의 사용자·한국 날짜·정오 일주로 저장한다", async () => {
  reset();
  const response = await post({ date: birthDate, time: birthTime,
    user_id: other, fortune_date: "2020-01-01", money: "조작", today_pillar: "甲子" });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).saved, true);
  assert.equal(state.generates, 1);
  assert.equal(state.inserts, 1);
  assert.equal(state.inserted?.user_id, owner);
  assert.equal(state.inserted?.fortune_date, date);
  assert.equal(state.inserted?.today_pillar, pillar);
  assert.equal(state.inserted?.money, texts.money);
});

test("015: 다른 사용자·사주·날짜의 행과 손상된 행은 사용하지 않는다", async () => {
  reset();
  state.rows.push(savedRow({ user_id: other }));
  state.rows.push(savedRow({ birth_date: "2001-01-01" }));
  state.rows.push(savedRow({ fortune_date: "2020-01-01" }));
  assert.equal((await post({ date: birthDate, time: birthTime })).status, 200);
  assert.equal(state.generates, 1);
  reset(); state.rows.push(savedRow({ health: "짧음" }));
  const response = await post({ date: birthDate, time: birthTime });
  assert.equal(response.status, 503);
  assert.equal(state.generates, 0);
  assert.equal(state.inserts, 0);
});

test("015: 동시 삽입 충돌은 저장된 행을 다시 읽는다", async () => {
  reset(); state.collision = savedRow({ work: "먼저 저장된 문구를 오늘의 업무 안내로 다시 읽어 볼 수 있습니다." });
  const response = await post({ date: birthDate, time: birthTime });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).fortune.work, state.rows[0].work);
  assert.equal(state.rows.length, 1);
});

test("015: 조회·Gemini 실패는 저장하지 않고 삽입 실패는 미저장 문구를 돌려준다", async () => {
  reset(); state.failLookup = true;
  assert.equal((await post({ date: birthDate, time: birthTime })).status, 503);
  assert.equal(state.generates, 0);
  reset(); state.failGenerate = true;
  assert.equal((await post({ date: birthDate, time: birthTime })).status, 502);
  assert.equal(state.inserts, 0);
  reset(); state.failInsert = true;
  const response = await post({ date: birthDate, time: birthTime });
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.saved, false);
  assert.equal(payload.fortune.money, texts.money);
  assert.equal(state.rows.length, 0);
});

test("015: 잘못된 입력과 과도한 본문은 생성 전에 거절한다", async () => {
  reset();
  assert.equal((await post({ date: "2024-02-30", time: birthTime })).status, 400);
  assert.equal((await post({ date: birthDate, time: "24:00" })).status, 400);
  assert.equal((await post({ date: birthDate, time: birthTime, padding: "a".repeat(5000) })).status, 413);
  assert.equal(state.generates, 0);
  assert.equal(state.inserts, 0);
});
