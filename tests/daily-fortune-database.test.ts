import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";
import { build, type Plugin } from "esbuild";
import { calculate, todayInKorea } from "../lib/saju/chart";
import { getDailyFortune } from "../lib/saju/daily-fortune";

const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const birthDate = "2000-01-01";
const birthTime = "12:00";
const chart = calculate({ date: birthDate, time: birthTime, calendar: "solar", topic: "general" });

type Row = {
  user_id: string;
  birth_date: string;
  birth_time: string;
  fortune_date: string;
  today_pillar: string;
  fortune_version: number;
  flow: string;
  action: string;
  caution: string;
};

type State = {
  userId: string | null;
  rows: Row[];
  inserted: Partial<Row> | null;
  inserts: number;
  failSelect: boolean;
  failInsert: boolean;
  collision: Row | null;
};

let state: State;
function reset(userId: string | null = owner) {
  state = { userId, rows: [], inserted: null, inserts: 0, failSelect: false, failInsert: false, collision: null };
}

function savedRow(userId = owner, overrides: Partial<Row> = {}): Row {
  const fortune = getDailyFortune(chart, todayInKorea());
  return {
    user_id: userId, birth_date: birthDate, birth_time: birthTime,
    fortune_date: fortune.date, today_pillar: fortune.todayPillar, fortune_version: 1,
    flow: fortune.flow, action: fortune.action, caution: fortune.caution,
    ...overrides,
  };
}

class Query {
  private action: "select" | "insert" = "select";
  private filters: Array<[string, unknown]> = [];
  private value: Partial<Row> | null = null;
  select() { return this; }
  eq(column: string, value: unknown) { this.filters.push([column, value]); return this; }
  insert(value: Partial<Row>) { this.action = "insert"; this.value = value; return this; }
  maybeSingle() { return this.finish(); }
  single() { return this.finish(); }
  private finish() {
    if (this.action === "insert") {
      state.inserts++;
      state.inserted = this.value;
      if (state.failInsert) return { data: null, error: { code: "PGRST500" } };
      if (state.collision) {
        state.rows.push(state.collision);
        state.collision = null;
        return { data: null, error: { code: "23505" } };
      }
      const inserted = this.value as Row;
      state.rows.push(inserted);
      return { data: inserted, error: null };
    }
    if (state.failSelect) return { data: null, error: { code: "PGRST500" } };
    return {
      data: state.rows.find((row) => row.user_id === state.userId &&
        this.filters.every(([key, value]) => row[key as keyof Row] === value)) ?? null,
      error: null,
    };
  }
}

const plugin: Plugin = {
  name: "daily-fortune-db-auth",
  setup(bundler) {
    bundler.onResolve({ filter: /lib[\\/]supabase[\\/]results$/ }, () => ({ path: "auth", namespace: "daily-test-stub" }));
    bundler.onLoad({ filter: /.*/, namespace: "daily-test-stub" }, () => ({
      contents: "export async function getResultsClient() { return globalThis.__dailyDbTest.getResultsClient() }",
      loader: "js",
    }));
  },
};

let route: { POST(request: Request): Promise<Response> };
test.before(async () => {
  (globalThis as typeof globalThis & { __dailyDbTest: { getResultsClient: () => object | null } }).__dailyDbTest = {
    getResultsClient() {
      if (!state.userId) return null;
      return { userId: state.userId, supabase: { from(table: string) {
        assert.equal(table, "saju_daily_fortunes");
        return new Query();
      } } };
    },
  };
  const built = await build({
    entryPoints: [join(process.cwd(), "app/api/daily-fortune/route.ts")],
    bundle: true, write: false, platform: "node", format: "cjs", packages: "external", plugins: [plugin],
  });
  const module = { exports: {} as typeof route };
  new Function("require", "module", "exports", built.outputFiles[0].text)(
    createRequire(join(process.cwd(), "package.json")), module, module.exports,
  );
  route = module.exports;
});

function post(body: unknown) {
  return route.POST(new Request("http://localhost:3000/api/daily-fortune", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
}

test("비로그인 사용자는 일일 운세를 DB에 저장하지 않는다", async () => {
  reset(null);
  const response = await post({ date: birthDate, time: birthTime });
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(state.inserts, 0);
});

test("동일 계정·사주·한국 날짜는 저장된 문구를 반환하고 재삽입하지 않는다", async () => {
  reset();
  const stored = savedRow(owner, { flow: "저장해 둔 오늘의 흐름이에요." });
  state.rows.push(stored);
  const response = await post({ date: birthDate, time: birthTime });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const payload = await response.json();
  assert.equal(payload.fortune.flow, stored.flow);
  assert.equal(payload.fortune.date, todayInKorea());
  assert.equal(state.inserts, 0);
});

test("새 운세는 검증된 계정과 서버 재계산값, 한국 오늘 날짜로 저장한다", async () => {
  reset();
  const response = await post({
    date: birthDate, time: birthTime, user_id: other,
    fortune_date: "2020-01-01", chart: {}, flow: "조작한 문구",
  });
  assert.equal(response.status, 200);
  const expected = getDailyFortune(chart, todayInKorea());
  assert.equal(state.inserts, 1);
  assert.equal(state.inserted?.user_id, owner);
  assert.equal(state.inserted?.birth_date, birthDate);
  assert.equal(state.inserted?.birth_time, birthTime);
  assert.equal(state.inserted?.fortune_date, expected.date);
  assert.equal(state.inserted?.today_pillar, expected.todayPillar);
  assert.equal(state.inserted?.flow, expected.flow);
  assert.equal(state.inserted?.action, expected.action);
  assert.equal(state.inserted?.caution, expected.caution);
  assert.deepEqual((await response.json()).fortune, expected);
});

test("다른 계정과 다른 출생 사주는 기존 행을 재사용하지 않는다", async () => {
  reset();
  state.rows.push(savedRow(other));
  state.rows.push(savedRow(owner, { birth_date: "2001-01-01" }));
  const response = await post({ date: birthDate, time: birthTime });
  assert.equal(response.status, 200);
  assert.equal(state.inserts, 1);
});

test("동시 삽입의 고유 제약 충돌은 기존 행을 반환한다", async () => {
  reset();
  state.collision = savedRow(owner, { flow: "먼저 저장된 흐름이에요." });
  const response = await post({ date: birthDate, time: birthTime });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).fortune.flow, "먼저 저장된 흐름이에요.");
  assert.equal(state.rows.length, 1);
});

test("손상된 저장 행은 저장 성공처럼 표시하지 않는다", async () => {
  reset();
  state.rows.push(savedRow(owner, { fortune_version: 0, flow: "" }));
  const response = await post({ date: birthDate, time: birthTime });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).saved, false);
  assert.equal(state.inserts, 0);
});

test("DB 조회·저장 실패와 잘못된 출생 입력은 성공으로 처리하지 않는다", async () => {
  reset();
  state.failSelect = true;
  assert.equal((await post({ date: birthDate, time: birthTime })).status, 503);
  assert.equal(state.inserts, 0);
  reset();
  state.failInsert = true;
  const failed = await post({ date: birthDate, time: birthTime });
  assert.equal(failed.status, 503);
  assert.equal((await failed.json()).saved, false);
  assert.equal(state.rows.length, 0);
  reset();
  assert.equal((await post({ date: "1980-01-01", time: birthTime })).status, 400);
  assert.equal(state.inserts, 0);
});

test("일일 운세 migration은 계정·출생 입력·날짜를 고유하게 묶고 RLS를 적용한다", async () => {
  const names = await readdir(join(process.cwd(), "supabase/migrations"));
  const name = names.find((item) => item.includes("daily_fortune") && item.endsWith(".sql"));
  assert.ok(name, "일일 운세 migration이 필요합니다");
  const sql = await readFile(join(process.cwd(), "supabase/migrations", name), "utf8");
  assert.match(sql, /create table(?:\s+if not exists)?\s+public\.saju_daily_fortunes/i);
  assert.match(sql, /unique\s*\(\s*user_id\s*,\s*birth_date\s*,\s*birth_time\s*,\s*fortune_date\s*\)/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /for select to authenticated\s+using\s*\(user_id\s*=\s*\(select auth\.uid\(\)\)\)/i);
  assert.match(sql, /for insert to authenticated\s+with check\s*\(user_id\s*=\s*\(select auth\.uid\(\)\)\)/i);
  assert.doesNotMatch(sql, /grant\s+update\b/i);
  assert.doesNotMatch(sql, /grant\s+[^;]*\bto\s+anon\b/i);
});

test("화면은 로그인 시 현재 사주·날짜만 자동 저장하고 실패 시 재시도한다", async () => {
  const source = await readFile(join(process.cwd(), "app/daily-fortune.tsx"), "utf8");
  const effect = source.slice(source.indexOf("if (!date || !userId)"), source.indexOf("if (!date) return null;"));
  assert.ok(effect.length > 0, "계정 저장 effect가 필요합니다");
  assert.match(effect, /if\s*\(!date\s*\|\|\s*!userId\)\s*return/);
  assert.match(effect, /fetch\("\/api\/daily-fortune"/);
  assert.match(effect, /JSON\.stringify\(\{ date: birthDate, time: birthTime \}\)/);
  assert.match(effect, /controller\.abort\(\)/);
  assert.match(effect, /if\s*\(!active\)\s*return/);
  assert.match(effect, /saved\?\.date === date/);
  assert.match(effect, /response\.status === 401/);
  assert.match(effect, /status: "unsaved"/);
  assert.match(source, /saveState\?\.key === key \? saveState : null/);
  assert.match(source, /currentSave\?\.status === "saved"/);
  assert.match(source, /계정에 저장됐어요/);
  assert.match(source, /저장 다시 시도/);
  assert.match(source, /setRetry\(\(value\) => value \+ 1\)/);
});
