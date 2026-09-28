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
  updates: number;
  generates: number;
  retries: number[];
  seenOtherTopics: unknown[][];
  generated: Array<typeof texts>;
  failReading: boolean;
  failLookup: boolean;
  failSameDay: boolean;
  failInsert: boolean;
  failUpdate: boolean;
  failGenerate: boolean;
  collision: Row | null;
};
let state: State;
function reset() {
  state = { userId: owner, reading: true, rows: [], inserted: null, inserts: 0, updates: 0, generates: 0,
    retries: [], seenOtherTopics: [], generated: [], failReading: false, failLookup: false, failSameDay: false,
    failInsert: false, failUpdate: false, failGenerate: false, collision: null };
}
function savedRow(overrides: Row = {}): Row {
  return { user_id: owner, birth_date: birthDate, birth_time: birthTime,
    fortune_date: date, today_pillar: pillar, fortune_version: 2, model: "gemini-test", ...texts, ...overrides };
}
class Query {
  private filters: Array<[string, unknown]> = [];
  private action: "select" | "insert" | "update" = "select";
  private value: Row | null = null;
  constructor(private table: string) {}
  select() { return this; }
  eq(key: string, value: unknown) { this.filters.push([key, value]); return this; }
  limit() { return this; }
  insert(value: Row) { this.action = "insert"; this.value = value; return this; }
  update(value: Row) { this.action = "update"; this.value = value; return this; }
  then(resolve: (value: { data: Row[] | null; error: { code: string } | null }) => unknown) {
    return Promise.resolve(this.finishAll()).then(resolve);
  }
  maybeSingle() { return this.finish(); }
  single() { return this.finish(); }
  private finishAll() {
    assert.equal(this.table, "saju_daily_topic_fortunes");
    if (state.failSameDay) return { data: null, error: { code: "PGRST500" } };
    return { data: state.rows.filter((row) => this.filters.every(([key, value]) => row[key] === value)), error: null };
  }
  private finish() {
    if (this.table === "saju_interpretations") {
      if (state.failReading) return { data: null, error: { code: "PGRST500" } };
      const ownerMatches = this.filters.some(([key, value]) => key === "user_id" && value === owner);
      const dateMatches = this.filters.some(([key, value]) => key === "birth_date" && value === birthDate);
      const timeMatches = this.filters.some(([key, value]) => key === "birth_time" && value === birthTime);
      return { data: state.reading && ownerMatches && dateMatches && timeMatches ? { id: "reading" } : null, error: null };
    }
    assert.equal(this.table, "saju_daily_topic_fortunes");
    if (this.action === "update") {
      state.updates++;
      if (state.failUpdate) return { data: null, error: { code: "PGRST500" } };
      const found = state.rows.find((row) => this.filters.every(([key, value]) => row[key] === value));
      if (!found) return { data: null, error: { code: "PGRST404" } };
      Object.assign(found, this.value);
      return { data: found, error: null };
    }
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
    generate(...args: unknown[]) {
      state.generates++;
      state.retries.push(args[5] as number);
      state.seenOtherTopics.push(args[6] as unknown[]);
      if (state.failGenerate) throw new Error("gemini failed");
      return state.generated.shift() ?? texts;
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
  state.rows.push(savedRow({ birth_date: "2001-01-01", money: "지난 사주의 작은 소비 기록을 살펴보는 하루로 만들어 보세요.",
    health: "지난 사주에 맞게 산책할 시간을 생활 속에 마련해 보세요.", work: "지난 사주에 맞게 메모를 정리하며 대화를 시작해 보세요." }));
  state.rows.push(savedRow({ fortune_date: "2020-01-01" }));
  assert.equal((await post({ date: birthDate, time: birthTime })).status, 200);
  assert.equal(state.generates, 1);
  reset(); state.rows.push(savedRow({ health: "짧음" }));
  const response = await post({ date: birthDate, time: birthTime });
  assert.equal(response.status, 503);
  assert.equal(state.generates, 0);
  assert.equal(state.inserts, 0);
});

test("016: 다른 출생정보의 한 항목이라도 공백만 다른 동일 문구면 기존 행을 갱신한다", async () => {
  reset();
  const first = savedRow();
  const second = savedRow({ birth_date: "2001-01-01", money: texts.money.replaceAll(" ", "  "),
    health: "다른 사주를 위한 건강 문장을 오늘의 리듬에 맞춰 읽어 보세요.",
    work: "다른 사주의 할 일을 적어 두고 차례로 검토해 보세요." });
  state.rows.push(first, second);
  const fresh = { money: "오늘 쓸 금액을 작은 항목별로 적어 보고 여유를 살펴보세요.",
    health: "계단을 오르기 전후에 잠깐 숨을 고르며 몸의 감각을 살펴보세요.",
    work: "오늘 할 일을 짧게 적고 함께할 사람과 진행 순서를 나눠 보세요." };
  state.generated.push(fresh);
  const response = await post({ date: birthDate, time: birthTime });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).fortune.money, fresh.money);
  assert.equal(state.updates, 1);
  assert.equal(state.inserts, 0);
  assert.equal(state.generates, 1);
  assert.equal(first.money, fresh.money);
  assert.equal(first.user_id, owner);
  assert.equal(first.birth_date, birthDate);
  assert.equal(second.money, texts.money.replaceAll(" ", "  "));
});

test("016: 이전 프롬프트 버전의 저장 행은 문구가 겹치지 않아도 새 버전으로 갱신한다", async () => {
  reset();
  const old = savedRow({ fortune_version: 1 });
  const otherBirth = savedRow({ birth_date: "2001-01-01", money: "별도의 소비 기록을 보며 필요한 선택을 천천히 정리해 보세요.",
    health: "별도의 휴식 시간을 정하고 생활 속에서 움직여 보세요.",
    work: "별도의 메모를 적고 할 일의 순서를 사람들과 나눠 보세요." });
  state.rows.push(old, otherBirth);
  const fresh = { money: "오래된 목록을 확인하고 오늘 필요한 구매만 골라 적어 보세요.",
    health: "틈틈이 몸을 움직이며 쉬는 시간을 스스로 정해 보세요.",
    work: "작은 업무부터 정리하고 전달할 내용을 간결하게 적어 보세요." };
  state.generated.push(fresh);
  const response = await post({ date: birthDate, time: birthTime });
  assert.equal(response.status, 200);
  assert.equal(state.generates, 1);
  assert.equal(state.updates, 1);
  assert.deepEqual(state.seenOtherTopics[0], [{ money: otherBirth.money, health: otherBirth.health, work: otherBirth.work }]);
  assert.equal(old.fortune_version, 2);
  assert.equal(old.money, fresh.money);
});

test("016: 새 행은 중복 문구를 최대 세 번 거르고 구분되는 문구만 저장한다", async () => {
  reset();
  state.rows.push(savedRow({ birth_date: "2001-01-01" }));
  const fresh = { money: "잔돈이 쓰인 곳을 살펴보고 필요한 물건 목록을 정리해 보세요.",
    health: "잠시 창밖을 바라보며 쉬는 시간을 생활 속에 마련해 보세요.",
    work: "메모를 나눠서 순서를 잡고 서로의 생각을 확인해 보세요." };
  state.generated.push(texts, fresh);
  const response = await post({ date: birthDate, time: birthTime });
  assert.equal(response.status, 200);
  assert.equal(state.generates, 2);
  assert.deepEqual(state.retries, [0, 1]);
  assert.equal(state.inserted?.money, fresh.money);
  assert.equal(state.inserts, 1);
});

test("016: 세 번 모두 중복이면 행을 새로 쓰거나 옛 중복 행을 성공으로 반환하지 않는다", async () => {
  reset();
  const existing = savedRow();
  state.rows.push(existing, savedRow({ birth_date: "2001-01-01" }));
  const response = await post({ date: birthDate, time: birthTime });
  assert.equal(response.status, 502);
  assert.equal(state.generates, 3);
  assert.equal(state.updates, 0);
  assert.equal(state.inserts, 0);
  assert.equal(existing.money, texts.money);
  assert.equal((await response.json()).saved, undefined);
});

test("016: 중복 행 재생성의 Gemini 실패는 기존 행을 유지한다", async () => {
  reset();
  const old = savedRow();
  state.rows.push(old, savedRow({ birth_date: "2001-01-01" }));
  state.failGenerate = true;
  const response = await post({ date: birthDate, time: birthTime });
  assert.equal(response.status, 502);
  assert.equal(state.updates, 0);
  assert.equal(state.inserts, 0);
  assert.equal(old.money, texts.money);
});

test("016: 같은 날 다른 출생정보 조회 실패와 중복 행 갱신 실패는 저장 성공이 아니다", async () => {
  reset(); state.failSameDay = true;
  let response = await post({ date: birthDate, time: birthTime });
  assert.equal(response.status, 503);
  assert.equal(state.generates, 0);
  reset();
  state.rows.push(savedRow(), savedRow({ birth_date: "2001-01-01" }));
  state.generated.push({ money: "새로운 소비 메모를 작성하고 작은 지출부터 살펴보세요.",
    health: "쉬는 시간을 먼저 정하고 가벼운 움직임을 곁들여 보세요.",
    work: "생각을 먼저 적고 상대의 의견을 들으며 순서를 정해 보세요." });
  state.failUpdate = true;
  response = await post({ date: birthDate, time: birthTime });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).fortune, undefined);
  assert.equal(state.updates, 1);
  assert.equal(state.rows[0].money, texts.money);
});

test("016: 다른 계정의 같은 문구는 중복 검사와 갱신 대상에서 제외한다", async () => {
  reset();
  state.rows.push(savedRow({ user_id: other, birth_date: "2001-01-01" }));
  const response = await post({ date: birthDate, time: birthTime });
  assert.equal(response.status, 200);
  assert.equal(state.generates, 1);
  assert.equal(state.inserts, 1);
  assert.equal(state.updates, 0);
});

test("016: 삽입 충돌 후 재조회한 행이 다른 출생정보와 중복이면 교체한다", async () => {
  reset();
  const otherBirth = savedRow({ birth_date: "2001-01-01" });
  const collided = savedRow();
  state.rows.push(otherBirth);
  state.collision = collided;
  const fresh = { money: "필요한 항목을 적어 보고 작은 구매부터 차근히 살펴보세요.",
    health: "잠깐 눈을 감고 숨을 고르며 편안한 시간을 마련해 보세요.",
    work: "떠오른 의견을 적은 뒤 차례대로 나눌 준비를 해 보세요." };
  state.generated.push(fresh);
  const response = await post({ date: birthDate, time: birthTime });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).fortune.money, fresh.money);
  assert.equal(collided.money, fresh.money);
  assert.equal(state.rows.length, 2);
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
