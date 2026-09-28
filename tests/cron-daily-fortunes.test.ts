import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";
import { build, type Plugin } from "esbuild";
import { todayInKorea } from "../lib/saju/chart";

const secret = "a-test-only-cron-secret-long-enough";
type Profile = { user_id: string; birth_date: string; birth_time: string };
type Fortune = Record<string, string>;
const profiles: Profile[] = Array.from({ length: 201 }, (_, index) => ({
  user_id: `${index.toString().padStart(4, "0")}-test-user`,
  birth_date: "2000-01-01",
  birth_time: "12:00:00",
}));

const state = {
  profiles: [] as Profile[],
  writes: [] as Fortune[][],
  selections: 0,
  failSelect: false,
  failWrite: false,
  authUser: null as string | null,
  profileWrite: null as Record<string, string> | null,
  profileWriteError: false,
  clients: 0,
};

function reset() {
  state.profiles = [];
  state.writes = [];
  state.selections = 0;
  state.failSelect = false;
  state.failWrite = false;
  state.authUser = null;
  state.profileWrite = null;
  state.profileWriteError = false;
  state.clients = 0;
  process.env.CRON_SECRET = secret;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-only-service-key";
}

function selectProfiles(cursor: string, limit: number) {
  state.selections++;
  if (state.failSelect) return { data: null, error: { message: "select failed" } };
  return { data: state.profiles.filter((row) => row.user_id > cursor).slice(0, limit), error: null };
}

function adminClient() {
  state.clients++;
  return { from(table: string) {
    if (table === "daily_fortunes") return { upsert(rows: Fortune | Fortune[], options: { onConflict: string }) {
      assert.equal(options.onConflict, "user_id,fortune_date");
      state.writes.push(Array.isArray(rows) ? rows : [rows]);
      return Promise.resolve({ error: state.failWrite ? { message: "write failed" } : null });
    } };
    assert.equal(table, "saju_profiles");
    let cursor = "";
    let limit = 100;
    const query = {
      upsert(value: Record<string, string>, options: { onConflict: string }) {
        assert.equal(options.onConflict, "user_id");
        state.profileWrite = value;
        return Promise.resolve({ error: state.profileWriteError ? { message: "write failed" } : null });
      },
      select(columns: string) { assert.equal(columns, "user_id, birth_date, birth_time"); return query; },
      order(column: string) { assert.equal(column, "user_id"); return query; },
      limit(value: number) { limit = value; return query; },
      gt(column: string, value: string) { assert.equal(column, "user_id"); cursor = value; return query; },
      then(resolve: (value: ReturnType<typeof selectProfiles>) => void) { resolve(selectProfiles(cursor, limit)); },
    };
    return query;
  } };
}

const plugin: Plugin = {
  name: "cron-route-stubs",
  setup(bundler) {
    bundler.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: "admin", namespace: "cron-test" }));
    bundler.onResolve({ filter: /lib[\\/]supabase[\\/]results$/ }, () => ({ path: "auth", namespace: "cron-test" }));
    bundler.onLoad({ filter: /.*/, namespace: "cron-test" }, ({ path }) => ({
      contents: path === "admin"
        ? "export function createClient() { return globalThis.__cronTest.adminClient(); }"
        : "export async function getResultsClient() { return globalThis.__cronTest.resultsClient(); }",
      loader: "js",
    }));
  },
};

type Route = { GET?: (request: Request) => Promise<Response>; POST?: (request: Request) => Promise<Response> };
async function loadRoute(path: string): Promise<Route> {
  const built = await build({ entryPoints: [join(process.cwd(), path)], bundle: true, write: false,
    platform: "node", format: "cjs", packages: "external", plugins: [plugin] });
  const module = { exports: {} as Route };
  const localRequire = createRequire(join(process.cwd(), "package.json"));
  new Function("require", "module", "exports", built.outputFiles[0].text)(localRequire, module, module.exports);
  return module.exports;
}

let cron: Route;
let profile: Route;
test.before(async () => {
  (globalThis as typeof globalThis & { __cronTest: object }).__cronTest = {
    adminClient,
    resultsClient() { return state.authUser ? { userId: state.authUser } : null; },
  };
  [cron, profile] = await Promise.all([
    loadRoute("app/api/cron/daily-fortunes/route.ts"),
    loadRoute("app/api/profile/route.ts"),
  ]);
});

function cronRequest(auth = `Bearer ${secret}`) {
  return new Request("http://localhost/api/cron/daily-fortunes", { headers: { authorization: auth } });
}
function profileRequest(body: string) {
  return new Request("http://localhost/api/profile", { method: "POST", body });
}

test("예약 시간은 매일 한국시간 오전 9시에 해당하는 UTC 자정이다", async () => {
  const config = JSON.parse(await readFile(join(process.cwd(), "vercel.json"), "utf8"));
  assert.deepEqual(config.crons, [{ path: "/api/cron/daily-fortunes", schedule: "0 0 * * *" }]);
});

test("migration은 일반 회원의 쓰기를 금지하고 본인 운세 조회만 허용한다", async () => {
  const sql = await readFile(join(process.cwd(), "supabase/migrations/20260928000100_create_daily_fortunes.sql"), "utf8");
  assert.match(sql, /enable row level security/g);
  assert.match(sql, /grant select on public\.saju_profiles to authenticated/i);
  assert.match(sql, /grant select on public\.daily_fortunes to authenticated/i);
  assert.doesNotMatch(sql, /grant[^;]*\b(?:insert|update|delete)\b[^;]*to authenticated/i);
  assert.match(sql, /for select to authenticated\s+using\s*\(user_id\s*=\s*\(select auth\.uid\(\)\)\)/i);
  assert.match(sql, /primary key \(user_id, fortune_date\)/i);
});

test("Cron은 비밀키가 없거나 틀리면 DB에 연결하지 않는다", async () => {
  reset();
  assert.equal((await cron.GET!(cronRequest("Bearer wrong"))).status, 401);
  assert.equal((await cron.GET!(cronRequest(""))).status, 401);
  assert.equal(state.clients, 0);
  delete process.env.CRON_SECRET;
  assert.equal((await cron.GET!(cronRequest())).status, 503);
  assert.equal(state.clients, 0);
});

test("Cron은 여러 페이지의 등록 회원만 한국 날짜 운세로 저장한다", async () => {
  reset();
  state.profiles = profiles;
  const response = await cron.GET!(cronRequest());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), { date: todayInKorea(), saved: 201 });
  assert.deepEqual(state.writes.map((batch) => batch.length), [100, 100, 1]);
  assert.equal(state.writes.flat().length, 201);
  assert.equal(new Set(state.writes.flat().map((row) => row.user_id)).size, 201);
  assert.ok(state.writes.flat().every((row) => row.fortune_date === todayInKorea() && row.flow && row.action && row.caution));
});

test("Cron의 조회·저장 실패는 오류를 반환하고 이후 배치를 쓰지 않는다", async () => {
  reset();
  state.failSelect = true;
  assert.equal((await cron.GET!(cronRequest())).status, 503);
  assert.equal(state.writes.length, 0);
  reset();
  state.profiles = profiles;
  state.failWrite = true;
  const response = await cron.GET!(cronRequest());
  assert.equal(response.status, 503);
  assert.equal(state.writes.length, 1);
});

test("Cron 재실행은 같은 사용자·날짜 키로 upsert한다", async () => {
  reset();
  state.profiles = profiles.slice(0, 2);
  await cron.GET!(cronRequest());
  await cron.GET!(cronRequest());
  assert.equal(state.writes.length, 2);
  assert.deepEqual(state.writes[0].map((row) => [row.user_id, row.fortune_date]),
    state.writes[1].map((row) => [row.user_id, row.fortune_date]));
});

test("프로필은 인증된 본인에게만 저장하고 출생정보를 검증한다", async () => {
  reset();
  assert.equal((await profile.POST!(profileRequest(JSON.stringify({ date: "2000-01-01", time: "12:00" })))).status, 401);
  assert.equal(state.profileWrite, null);
  assert.equal(state.clients, 0);
  state.authUser = "real-user";
  assert.equal((await profile.POST!(profileRequest(JSON.stringify({ date: "invalid", time: "12:00" })))).status, 400);
  assert.equal(state.profileWrite, null);
  assert.equal(state.clients, 0);
  const response = await profile.POST!(profileRequest(JSON.stringify({ date: "2000-01-01", time: "12:00", user_id: "forged" })));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const written = state.profileWrite as Record<string, string> | null;
  assert.equal(written?.user_id, "real-user");
  assert.equal(written?.birth_date, "2000-01-01");
  assert.equal(written?.birth_time, "12:00");
  assert.equal(state.writes.length, 1);
  assert.equal(state.writes[0][0].user_id, "real-user");
  assert.equal(state.writes[0][0].fortune_date, todayInKorea());
  assert.ok(state.writes[0][0].flow);
  assert.equal(state.clients, 1);
});

test("프로필은 관리자 키가 없으면 출생정보도 저장하지 않는다", async () => {
  reset();
  state.authUser = "real-user";
  delete process.env.SUPABASE_SECRET_KEY;
  const response = await profile.POST!(profileRequest(JSON.stringify({ date: "2000-01-01", time: "12:00" })));
  assert.equal(response.status, 503);
  assert.equal(state.profileWrite, null);
  assert.equal(state.writes.length, 0);
});

test("프로필 DB 실패는 성공으로 응답하지 않는다", async () => {
  reset();
  state.authUser = "real-user";
  state.profileWriteError = true;
  assert.equal((await profile.POST!(profileRequest(JSON.stringify({ date: "2000-01-01", time: "12:00" })))).status, 503);
  assert.equal(state.writes.length, 0);
});

test("프로필 저장 후 운세 저장 실패는 재시도 가능한 실패로 표시한다", async () => {
  reset();
  state.authUser = "real-user";
  state.failWrite = true;
  const response = await profile.POST!(profileRequest(JSON.stringify({ date: "2000-01-01", time: "12:00" })));
  assert.equal(response.status, 503);
  assert.deepEqual((await response.json()).saved, false);
  assert.equal(state.profileWrite?.user_id, "real-user");
  assert.equal(state.writes.length, 1);
});
