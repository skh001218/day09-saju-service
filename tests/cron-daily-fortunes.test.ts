import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";
import { build, type Plugin } from "esbuild";
import { todayInKorea } from "../lib/saju/chart";
import { FORTUNE_VERSION } from "../lib/saju/daily-fortune";

const secret = "a-test-only-cron-secret-long-enough";
type Interpretation = {
  id: string; user_id: string; birth_date: string; birth_time: string; created_at: string;
};
type Fortune = Record<string, string | number>;

function interpretation(user: number, id = 1, birthDate = "2000-01-01"): Interpretation {
  return {
    id: `${id.toString().padStart(4, "0")}-record`,
    user_id: `${user.toString().padStart(4, "0")}-test-user`,
    birth_date: birthDate,
    birth_time: "12:00:00",
    created_at: `2026-09-${id.toString().padStart(2, "0")}T00:00:00Z`,
  };
}

const state = {
  records: [] as Interpretation[],
  writes: [] as Fortune[][],
  selections: 0,
  selectedCursors: [] as string[],
  failSelect: false,
  failWrite: false,
  clients: 0,
};

function reset() {
  state.records = [];
  state.writes = [];
  state.selections = 0;
  state.selectedCursors = [];
  state.failSelect = false;
  state.failWrite = false;
  state.clients = 0;
  process.env.CRON_SECRET = secret;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-only-service-key";
}

function selectInterpretations(cursor: string, limit: number) {
  state.selections++;
  state.selectedCursors.push(cursor);
  if (state.failSelect) return { data: null, error: { message: "select failed" } };
  const sorted = state.records.toSorted((a, b) =>
    a.user_id.localeCompare(b.user_id) ||
    b.created_at.localeCompare(a.created_at) ||
    b.id.localeCompare(a.id));
  return { data: sorted.filter((row) => row.user_id > cursor).slice(0, limit), error: null };
}

function adminClient() {
  state.clients++;
  return { from(table: string) {
    if (table === "saju_daily_fortunes") return { upsert(rows: Fortune[], options: { onConflict: string; ignoreDuplicates: boolean }) {
      assert.equal(options.onConflict, "user_id,birth_date,birth_time,fortune_date");
      assert.equal(options.ignoreDuplicates, true);
      state.writes.push(rows);
      return Promise.resolve({ error: state.failWrite ? { message: "write failed" } : null });
    } };
    assert.equal(table, "saju_interpretations");
    let cursor = "";
    let limit = 100;
    const order: [string, boolean][] = [];
    const query = {
      select(columns: string) {
        assert.equal(columns, "id, user_id, birth_date, birth_time, created_at");
        return query;
      },
      order(column: string, options: { ascending: boolean }) {
        order.push([column, options.ascending]);
        return query;
      },
      limit(value: number) { limit = value; return query; },
      gt(column: string, value: string) {
        assert.equal(column, "user_id");
        cursor = value;
        return query;
      },
      then(resolve: (value: ReturnType<typeof selectInterpretations>) => void) {
        assert.deepEqual(order, [["user_id", true], ["created_at", false], ["id", false]]);
        assert.equal(limit, 100);
        resolve(selectInterpretations(cursor, limit));
      },
    };
    return query;
  } };
}

const plugin: Plugin = {
  name: "cron-route-stubs",
  setup(bundler) {
    bundler.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: "admin", namespace: "cron-test" }));
    bundler.onLoad({ filter: /.*/, namespace: "cron-test" }, () => ({
      contents: "export function createClient() { return globalThis.__cronTest.adminClient(); }",
      loader: "js",
    }));
  },
};

type Route = { GET: (request: Request) => Promise<Response> };
let cron: Route;
test.before(async () => {
  (globalThis as typeof globalThis & { __cronTest: object }).__cronTest = { adminClient };
  const built = await build({ entryPoints: [join(process.cwd(), "app/api/cron/daily-fortunes/route.ts")],
    bundle: true, write: false, platform: "node", format: "cjs", packages: "external", plugins: [plugin] });
  const module = { exports: {} as Route };
  const localRequire = createRequire(join(process.cwd(), "package.json"));
  new Function("require", "module", "exports", built.outputFiles[0].text)(localRequire, module, module.exports);
  cron = module.exports;
});

function cronRequest(auth = `Bearer ${secret}`) {
  return new Request("http://localhost/api/cron/daily-fortunes", { headers: { authorization: auth } });
}

test("예약 시간은 매일 한국시간 오전 9시에 해당하는 UTC 자정이다", async () => {
  const config = JSON.parse(await readFile(join(process.cwd(), "vercel.json"), "utf8"));
  assert.deepEqual(config.crons, [{ path: "/api/cron/daily-fortunes", schedule: "0 0 * * *" }]);
});

test("기존 운세 migration은 사용자·입력·날짜별 유일성을 보장한다", async () => {
  const sql = await readFile(join(process.cwd(), "supabase/migrations/20260928000200_create_saju_daily_fortunes.sql"), "utf8");
  assert.match(sql, /unique \(user_id, birth_date, birth_time, fortune_date\)/i);
  assert.match(sql, /fortune_version integer not null/i);
  assert.match(sql, /enable row level security/i);
});

test("Cron은 비밀키가 없거나 틀리면 DB에 연결하지 않는다", async () => {
  reset();
  assert.equal((await cron.GET(cronRequest("Bearer wrong"))).status, 401);
  assert.equal((await cron.GET(cronRequest(""))).status, 401);
  assert.equal(state.clients, 0);
  delete process.env.CRON_SECRET;
  assert.equal((await cron.GET(cronRequest())).status, 503);
  assert.equal(state.clients, 0);
});

test("해석 기록이 없는 회원은 대상에서 제외된다", async () => {
  reset();
  const response = await cron.GET(cronRequest());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { date: todayInKorea(), saved: 0 });
  assert.equal(state.writes.length, 0);
});

test("Cron은 여러 페이지의 회원별 최신 해석을 골라 운세를 저장한다", async () => {
  reset();
  state.records = Array.from({ length: 201 }, (_, index) => interpretation(index));
  state.records.push(interpretation(1, 1, "1999-01-01"));
  state.records.push(interpretation(1, 2, "2001-01-01"));
  const response = await cron.GET(cronRequest());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), { date: todayInKorea(), saved: 201 });
  assert.equal(state.writes.flat().length, 201);
  assert.equal(new Set(state.writes.flat().map((row) => row.user_id)).size, 201);
  assert.equal(state.writes.flat().find((row) => row.user_id === interpretation(1).user_id)?.birth_date, "2001-01-01");
  assert.ok(state.writes.flat().every((row) => row.fortune_date === todayInKorea()
    && row.birth_time === "12:00:00" && row.fortune_version === FORTUNE_VERSION
    && row.flow && row.action && row.caution));
});

test("페이지 끝에 같은 회원 기록이 이어져도 회원을 건너뛰거나 중복 저장하지 않는다", async () => {
  reset();
  state.records = Array.from({ length: 99 }, (_, index) => interpretation(index));
  state.records.push(interpretation(98, 2), interpretation(98, 3), interpretation(99));
  const response = await cron.GET(cronRequest());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).saved, 100);
  assert.equal(state.writes.flat().length, 100);
  assert.equal(new Set(state.writes.flat().map((row) => row.user_id)).size, 100);
  assert.deepEqual(state.selectedCursors, ["", interpretation(98).user_id]);
});

test("Cron의 조회·저장 실패는 오류를 반환하고 이후 배치를 쓰지 않는다", async () => {
  reset();
  state.failSelect = true;
  assert.equal((await cron.GET(cronRequest())).status, 503);
  assert.equal(state.writes.length, 0);
  reset();
  state.records = Array.from({ length: 201 }, (_, index) => interpretation(index));
  state.failWrite = true;
  assert.equal((await cron.GET(cronRequest())).status, 503);
  assert.equal(state.writes.length, 1);
  assert.equal(state.selections, 1);
});

test("잘못된 해석 기록은 성공으로 집계하지 않는다", async () => {
  reset();
  state.records = [interpretation(1, 1, "invalid")];
  assert.equal((await cron.GET(cronRequest())).status, 503);
  assert.equal(state.writes.length, 0);
});

test("Cron 재실행은 같은 사용자·출생정보·날짜 키로 upsert한다", async () => {
  reset();
  state.records = [interpretation(1), interpretation(2)];
  assert.equal((await cron.GET(cronRequest())).status, 200);
  assert.equal((await cron.GET(cronRequest())).status, 200);
  assert.equal(state.writes.length, 2);
  assert.deepEqual(state.writes[0], state.writes[1]);
});
