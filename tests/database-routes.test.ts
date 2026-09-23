import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";
import { build, type Plugin } from "esbuild";
import { calculate } from "../lib/saju/chart";
import { parseDatabaseResult } from "../lib/saju/db-history";

type Row = {
  id: string;
  user_id: string;
  request_id: string;
  created_at: string;
  birth_date: string;
  birth_time: string;
  chart: ReturnType<typeof calculate>;
  personality: string;
  strengths: string;
  cautions: string;
  recommended_class: string | null;
  recommendation_reason: string | null;
  compatible_types: Array<{ element: string; tendency: string; reason: string }> | null;
  model: string;
};

const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const requestId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const secondRequestId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const chart = calculate({ date: "2000-01-01", time: "12:00", calendar: "solar", topic: "general" });
const interpretation = {
  personality: "차분한 방식으로 주변을 살피며 나아가는 편이에요.",
  strengths: "맡은 일을 꾸준히 실천하는 힘이 있습니다.",
  cautions: "가끔은 쉬면서 주변의 도움을 받아 보세요.",
  recommended_class: "바드",
  recommendation_reason: "주변을 차분하게 챙기는 성향이 동료를 지원하는 바드의 플레이와 잘 어울려요.",
  compatible_types: [
    { element: "목", tendency: "새로운 시도를 함께 즐기는 편이에요.", reason: "차분히 중심을 잡는 내 성향에 새로운 관점을 더하며 생각을 나눌 수 있어요." },
    { element: "수", tendency: "상대의 말을 듣고 여유롭게 생각하는 편이에요.", reason: "꾸준히 나아가는 내 모습과 만나 서로의 속도를 살피며 소통할 수 있어요." },
  ],
};

function row(id: string, userId = userA, request = requestId): Row {
  return {
    id, user_id: userId, request_id: request,
    created_at: "2026-09-23T00:00:00.000Z",
    birth_date: "2000-01-01", birth_time: "12:00:00", chart,
    ...interpretation, model: "test-model",
  };
}

type TestState = {
  userId: string | null;
  rows: Row[];
  geminiCalls: number;
  insertCalls: number;
  failInsert: boolean;
  failSelect: boolean;
  collisionRow: Row | null;
  inserted: Partial<Row> | null;
};

let state: TestState;
function reset(userId: string | null = userA) {
  process.env.GEMINI_API_KEY = "test-only-key";
  state = {
    userId, rows: [], geminiCalls: 0, insertCalls: 0,
    failInsert: false, failSelect: false, collisionRow: null, inserted: null,
  };
}

class Query {
  private action: "select" | "insert" | "delete" = "select";
  private filters: Array<[string, unknown]> = [];
  private insertValue: Partial<Row> | null = null;
  private fromIndex = 0;
  private toIndex = Number.MAX_SAFE_INTEGER;

  select() { return this; }
  eq(column: string, value: unknown) { this.filters.push([column, value]); return this; }
  order() { return this; }
  range(from: number, to: number) {
    this.fromIndex = from;
    this.toIndex = to;
    return this.finishMany();
  }
  insert(value: Partial<Row>) {
    this.action = "insert";
    this.insertValue = value;
    return this;
  }
  delete() { this.action = "delete"; return this; }
  maybeSingle() { return this.finishOne(); }
  single() { return this.finishOne(); }

  private filtered() {
    return state.rows.filter((item) =>
      item.user_id === state.userId &&
      this.filters.every(([key, value]) => item[key as keyof Row] === value));
  }
  private finishOne() {
    if (this.action === "insert") {
      state.insertCalls++;
      state.inserted = this.insertValue;
      if (state.failInsert) return { data: null, error: { code: "PGRST500" } };
      if (state.collisionRow) {
        state.rows.push(state.collisionRow);
        state.collisionRow = null;
        return { data: null, error: { code: "23505" } };
      }
      const newRow = {
        ...this.insertValue,
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        created_at: "2026-09-23T00:00:00.000Z",
      } as Row;
      state.rows.push(newRow);
      return { data: newRow, error: null };
    }
    if (state.failSelect) return { data: null, error: { code: "PGRST500" } };
    const found = this.filtered()[0] ?? null;
    if (this.action === "delete" && found) {
      state.rows = state.rows.filter((item) => item.id !== found.id);
      return { data: { id: found.id }, error: null };
    }
    return { data: found, error: null };
  }
  private finishMany() {
    if (state.failSelect) return { data: null, error: { code: "PGRST500" } };
    const sorted = this.filtered().sort((a, b) =>
      b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
    return { data: sorted.slice(this.fromIndex, this.toIndex + 1), error: null };
  }
}

const testDatabase = {
  getResultsClient() {
    if (!state.userId) return null;
    return {
      userId: state.userId,
      supabase: { from(table: string) {
        assert.equal(table, "saju_interpretations");
        return new Query();
      } },
    };
  },
  interpret() {
    state.geminiCalls++;
    return interpretation;
  },
};

const plugin: Plugin = {
  name: "isolated-auth-and-gemini",
  setup(bundler) {
    bundler.onResolve({ filter: /lib[\\/]supabase[\\/]results$/ }, () => ({ path: "auth", namespace: "test-stub" }));
    bundler.onResolve({ filter: /lib[\\/]saju[\\/]gemini$/ }, () => ({ path: "gemini", namespace: "test-stub" }));
    bundler.onLoad({ filter: /.*/, namespace: "test-stub" }, ({ path }) => ({
      contents: path === "auth"
        ? "export async function getResultsClient() { return globalThis.__dbRouteTest.getResultsClient() }"
        : `export const GEMINI_MODEL = "test-model";
           export class GeminiError extends Error { constructor(message, status) { super(message); this.status = status; } }
           export async function interpretWithGemini() { return globalThis.__dbRouteTest.interpret(); }`,
      loader: "js",
    }));
  },
};

type Route = { POST?: (request: Request) => Promise<Response>; GET?: (request: Request) => Promise<Response>;
  DELETE?: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response> };

async function loadRoute(path: string): Promise<Route> {
  const built = await build({
    entryPoints: [join(process.cwd(), path)], bundle: true, write: false,
    platform: "node", format: "cjs", packages: "external", plugins: [plugin],
  });
  const module = { exports: {} as Route };
  const localRequire = createRequire(join(process.cwd(), "package.json"));
  new Function("require", "module", "exports", built.outputFiles[0].text)(localRequire, module, module.exports);
  return module.exports;
}

let interpretRoute: Route;
let listRoute: Route;
let deleteRoute: Route;

test.before(async () => {
  (globalThis as typeof globalThis & { __dbRouteTest: typeof testDatabase }).__dbRouteTest = testDatabase;
  [interpretRoute, listRoute, deleteRoute] = await Promise.all([
    loadRoute("app/api/interpret/route.ts"),
    loadRoute("app/api/results/route.ts"),
    loadRoute("app/api/results/[id]/route.ts"),
  ]);
});

function request(body: unknown) {
  return new Request("http://localhost:3000/api/interpret", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

test("비로그인 해석은 Gemini와 DB를 사용하지 않고 거절한다", async () => {
  reset(null);
  const response = await interpretRoute.POST!(request({ date: "2000-01-01", time: "12:00", request_id: requestId }));
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(state.geminiCalls, 0);
  assert.equal(state.insertCalls, 0);
});

test("로그인 상태여도 Gemini 키가 없으면 호출 없이 안내한다", async () => {
  reset();
  const previous = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const response = await interpretRoute.POST!(request({ date: "2000-01-01", time: "12:00", request_id: requestId }));
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /API 키/);
    assert.equal(state.geminiCalls, 0);
  } finally {
    if (previous === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous;
  }
});

test("중복 request_id는 저장된 결과를 반환하고 Gemini를 다시 호출하지 않는다", async () => {
  reset();
  state.rows.push(row("11111111-1111-4111-8111-111111111111"));
  const response = await interpretRoute.POST!(request({ date: "2000-01-01", time: "12:00", request_id: requestId }));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.record.id, state.rows[0].id);
  assert.deepEqual(payload.record.recommendation, {
    recommendedClass: interpretation.recommended_class,
    recommendationReason: interpretation.recommendation_reason,
  });
  assert.deepEqual(payload.record.compatibleTypes, interpretation.compatible_types);
  assert.equal(state.geminiCalls, 0);
  assert.equal(state.insertCalls, 0);
});

test("새 해석은 검증된 사용자 ID와 서버 계산 결과로 한 번 저장한다", async () => {
  reset();
  const response = await interpretRoute.POST!(request({
    date: "2000-01-01", time: "12:00", request_id: requestId,
    user_id: userB, chart: { pillars: [] }, personality: "forged",
    compatible_types: [{ element: "금", tendency: "가짜", reason: "가짜" }],
  }));
  assert.equal(response.status, 200);
  assert.equal(state.geminiCalls, 1);
  assert.equal(state.insertCalls, 1);
  assert.equal(state.inserted?.user_id, userA);
  assert.deepEqual(state.inserted?.chart, chart);
  assert.equal(state.inserted?.personality, interpretation.personality);
  assert.equal(state.inserted?.recommended_class, interpretation.recommended_class);
  assert.equal(state.inserted?.recommendation_reason, interpretation.recommendation_reason);
  assert.deepEqual(state.inserted?.compatible_types, interpretation.compatible_types);
  const payload = await response.json();
  assert.equal(payload.record.id, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");
  assert.equal(payload.record.recommendation.recommendedClass, "바드");
  assert.deepEqual(payload.record.compatibleTypes, interpretation.compatible_types);
});

test("동시 저장 충돌이면 같은 request_id의 기록을 반환한다", async () => {
  reset();
  state.collisionRow = row("22222222-2222-4222-8222-222222222222");
  const response = await interpretRoute.POST!(request({ date: "2000-01-01", time: "12:00", request_id: requestId }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).record.id, "22222222-2222-4222-8222-222222222222");
  assert.deepEqual(parseDatabaseResult(state.rows[0])?.compatibleTypes, interpretation.compatible_types);
  assert.equal(state.rows.length, 1);
});

test("DB 저장 실패는 해석을 표시할 수 있게 돌려주되 저장 성공으로 표시하지 않는다", async () => {
  reset();
  state.failInsert = true;
  const response = await interpretRoute.POST!(request({ date: "2000-01-01", time: "12:00", request_id: requestId }));
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.saved, false);
  assert.deepEqual(payload.interpretation, interpretation);
  assert.equal(state.rows.length, 0);
});

test("과거 DB 기록은 추천 없이 조회하며 Gemini를 자동으로 다시 호출하지 않는다", async () => {
  reset();
  state.rows.push({ ...row("11111111-1111-4111-8111-111111111111"),
    recommended_class: null, recommendation_reason: null, compatible_types: null });
  const response = await interpretRoute.POST!(request({ date: "2000-01-01", time: "12:00", request_id: requestId }));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.record.recommendation, null);
  assert.equal(payload.record.compatibleTypes, null);
  assert.equal(state.geminiCalls, 0);
  assert.equal(state.insertCalls, 0);
});

test("DB 행에 추천 직업과 이유가 한쪽만 있으면 손상된 결과로 거절한다", () => {
  const sample = row("11111111-1111-4111-8111-111111111111");
  assert.equal(parseDatabaseResult({ ...sample, recommendation_reason: null }), null);
  assert.equal(parseDatabaseResult({ ...sample, recommended_class: null }), null);
});

test("DB 행은 이전 유형 없음과 새 유효 유형을 구분하고 손상된 유형을 거절한다", () => {
  const sample = row("11111111-1111-4111-8111-111111111111");
  assert.deepEqual(parseDatabaseResult(sample)?.compatibleTypes, interpretation.compatible_types);
  assert.equal(parseDatabaseResult({ ...sample, compatible_types: null })?.compatibleTypes, null);
  assert.equal(parseDatabaseResult({ ...sample, compatible_types: undefined })?.compatibleTypes, null);
  assert.equal(parseDatabaseResult({ ...sample, compatible_types: [interpretation.compatible_types[0]] }), null);
  assert.equal(parseDatabaseResult({ ...sample, compatible_types: [interpretation.compatible_types[0], interpretation.compatible_types[0]] }), null);
});

test("계정 목록은 기존 추천과 추천 없는 과거 기록을 모두 반환한다", async () => {
  reset();
  state.rows.push(row("11111111-1111-4111-8111-111111111111"));
  state.rows.push({ ...row("22222222-2222-4222-8222-222222222222", userA, secondRequestId),
    recommended_class: null, recommendation_reason: null, compatible_types: null });
  const response = await listRoute.GET!(new Request("http://localhost:3000/api/results"));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.records.length, 2);
  assert.equal(payload.records.find((item: { id: string }) => item.id === "11111111-1111-4111-8111-111111111111").recommendation.recommendedClass, "바드");
  assert.equal(payload.records.find((item: { id: string }) => item.id === "22222222-2222-4222-8222-222222222222").recommendation, null);
  assert.deepEqual(payload.records.find((item: { id: string }) => item.id === "11111111-1111-4111-8111-111111111111").compatibleTypes, interpretation.compatible_types);
  assert.equal(payload.records.find((item: { id: string }) => item.id === "22222222-2222-4222-8222-222222222222").compatibleTypes, null);
});

test("005 migration은 추천 필드 쌍의 누락을 허용하지 않고 과거 행을 보존한다", async () => {
  const names = (await readFile(join(process.cwd(), "supabase/migrations/20260923000200_add_lost_ark_recommendation.sql"), "utf8"));
  assert.match(names, /add column[^;]*recommended_class/i);
  assert.match(names, /add column[^;]*recommendation_reason/i);
  assert.match(names, /check\s*\(/i);
  assert.match(names, /recommended_class\s+is\s+null/i);
  assert.match(names, /recommendation_reason\s+is\s+null/i);
  assert.doesNotMatch(names, /update\s+public\.saju_interpretations/i);
});

test("008 기능 migration은 과거 행을 보존하면서 유형 배열 저장 열을 추가한다", async () => {
  const sql = await readFile(join(process.cwd(), "supabase/migrations/20260923000300_add_compatible_types.sql"), "utf8");
  assert.match(sql, /add column[^;]*compatible_types\s+jsonb/i);
  assert.doesNotMatch(sql, /update\s+public\.saju_interpretations/i);
  assert.doesNotMatch(sql, /drop\s+table/i);
});

test("계정 목록은 본인 기록만 반환하고 페이지를 나눈다", async () => {
  reset();
  state.rows.push(row("11111111-1111-4111-8111-111111111111", userB));
  for (let i = 0; i < 21; i++) {
    const hex = i.toString(16).padStart(12, "0");
    state.rows.push(row(`33333333-3333-4333-8333-${hex}`, userA, secondRequestId));
  }
  const response = await listRoute.GET!(new Request("http://localhost:3000/api/results"));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.records.length, 20);
  assert.equal(payload.nextCursor, "20");
  assert.ok(payload.records.every((item: { id: string }) => item.id !== "11111111-1111-4111-8111-111111111111"));
});

test("개별 삭제는 본인 기록만 지우며 타인·없는 ID에는 같은 404를 반환한다", async () => {
  reset();
  const ownId = "11111111-1111-4111-8111-111111111111";
  const foreignId = "22222222-2222-4222-8222-222222222222";
  state.rows.push(row(ownId), row(foreignId, userB));
  const remove = (id: string) => deleteRoute.DELETE!(new Request(`http://localhost:3000/api/results/${id}`, { method: "DELETE" }),
    { params: Promise.resolve({ id }) });
  const foreign = await remove(foreignId);
  const missing = await remove("33333333-3333-4333-8333-333333333333");
  assert.equal(foreign.status, 404);
  assert.equal(missing.status, 404);
  assert.deepEqual(await foreign.json(), await missing.json());
  assert.equal(state.rows.length, 2);
  assert.equal((await remove(ownId)).status, 200);
  assert.deepEqual(state.rows.map((item) => item.id), [foreignId]);
});

test("migration은 RLS 소유자 제한과 인증 사용자 최소 권한을 둔다", async () => {
  const sql = await readFile(join(process.cwd(), "supabase/migrations/20260923000100_create_saju_interpretations.sql"), "utf8");
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /grant select, insert, delete on table public\.saju_interpretations to authenticated/i);
  assert.doesNotMatch(sql, /grant\s+update\b/i);
  assert.match(sql, /for select to authenticated\s+using\s*\(user_id\s*=\s*\(select auth\.uid\(\)\)\)/i);
  assert.match(sql, /for insert to authenticated\s+with check\s*\(user_id\s*=\s*\(select auth\.uid\(\)\)\)/i);
  assert.match(sql, /for delete to authenticated\s+using\s*\(user_id\s*=\s*\(select auth\.uid\(\)\)\)/i);
  assert.match(sql, /unique\s*\(user_id, request_id\)/i);
});

test("화면은 비로그인 해석을 요청 전에 막고 기존 브라우저 기록을 유지한다", async () => {
  const source = await readFile(join(process.cwd(), "app/saju-form.tsx"), "utf8");
  const action = source.slice(source.indexOf("async function handleInterpret()"), source.indexOf("function handleOpenSaved("));
  assert.match(action, /if\s*\(!authUser\)/);
  assert.ok(action.indexOf("if (!authUser)") < action.indexOf('fetch("/api/interpret"'));
  assert.doesNotMatch(action, /saveResult\(/);
  assert.match(source, /loadHistory\(window\.localStorage\)/);
  assert.match(source, /이 브라우저에만 저장된 이전 결과/);
  assert.match(source, /<AuthControls onAuthChange=\{handleAuthChange\}/);
});
