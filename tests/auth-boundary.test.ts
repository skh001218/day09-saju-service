import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET as authCallback } from "../app/auth/callback/route";
import { proxy } from "../proxy";
import { isSupabaseConfigured } from "../lib/supabase/client";

test("설정이 없으면 로그인 가능 상태로 오인하지 않는다", () => {
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  try {
    assert.equal(isSupabaseConfigured(), false);
  } finally {
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = oldKey;
  }
});

test("인증 취소와 코드 누락은 실패 안내로 돌아가며 외부 next 주소를 따르지 않는다", async () => {
  const cancelled = await authCallback(new NextRequest(
    "http://localhost:3000/auth/callback?error=access_denied&next=https://evil.example",
  ));
  assert.equal(cancelled.status, 307);
  assert.equal(cancelled.headers.get("location"), "http://localhost:3000/?auth_error=cancelled");
  assert.equal(cancelled.headers.get("cache-control"), "private, no-store");

  const missing = await authCallback(new NextRequest(
    "http://localhost:3000/auth/callback?next=https://evil.example",
  ));
  assert.equal(missing.headers.get("location"), "http://localhost:3000/?auth_error=failed");
});

test("인증 설정이 없는 개발 환경에서는 콜백 코드도 세션으로 확정하지 않는다", async () => {
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  try {
    const response = await authCallback(new NextRequest(
      "http://localhost:3000/auth/callback?code=fake-code",
    ));
    assert.equal(response.headers.get("location"), "http://localhost:3000/?auth_error=failed");
  } finally {
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = oldKey;
  }
});

test("인증 설정이 없어도 공개 페이지의 세션 proxy는 요청을 막지 않는다", async () => {
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  try {
    const response = await proxy(new NextRequest("http://localhost:3000/"));
    assert.equal(response.status, 200);
  } finally {
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = oldKey;
  }
});
