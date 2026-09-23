import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/interpret/route";

function request(body: unknown): Request {
  return new Request("http://localhost/api/interpret", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("유효하지 않은 입력은 Gemini 호출 전에 거절한다", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => { called = true; throw new Error("Unexpected call"); }) as typeof fetch;
  try {
    for (const body of [
      { date: "1989-12-31", time: "12:00" },
      { date: "2000-01-01", time: "24:00" },
    ]) {
      const response = await POST(request(body));
      assert.equal(response.status, 400);
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      assert.equal(typeof (await response.json()).error, "string");
    }
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("중복 저장 방지용 요청 ID가 없으면 해석을 시작하지 않는다", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => { called = true; throw new Error("Unexpected call"); }) as typeof fetch;
  try {
    const response = await POST(request({ date: "2000-01-01", time: "12:00" }));
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /요청 정보/);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
