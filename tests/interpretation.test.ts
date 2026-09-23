import test from "node:test";
import assert from "node:assert/strict";
import { calculate } from "../lib/saju/chart";
import { makeInterpretationPrompt, parseInterpretation, parseRecommendedInterpretation } from "../lib/saju/interpretation";
import { GEMINI_MODEL, GeminiError, interpretWithGemini } from "../lib/saju/gemini";

const chart = calculate({ date: "2000-01-01", time: "12:00", calendar: "solar", topic: "general" });
const interpretation = {
  personality: "차분하게 자신의 속도를 지키는 편이에요.",
  strengths: "맡은 일을 꾸준히 이어가는 힘이 있어요.",
  cautions: "가끔은 쉬어 가며 주변의 도움도 받아 보세요.",
  recommended_class: "바드",
  recommendation_reason: "차분히 주변을 돕는 모습이 동료를 지원하는 바드의 플레이와 잘 어울려요.",
};

test("Gemini 요청문에는 계산한 사주만 담고 원래 날짜와 시간은 넣지 않는다", () => {
  const prompt = makeInterpretationPrompt(chart);
  assert.ok(prompt.includes(`일간: ${chart.dayMaster.character}`));
  for (const pillar of chart.pillars) assert.ok(prompt.includes(`${pillar.label}: ${pillar.text}`));
  assert.ok(!prompt.includes("2000-01-01"));
  assert.ok(!prompt.includes("12:00"));
  assert.match(prompt, /로스트아크/);
  assert.match(prompt, /바드/);
  assert.match(prompt, /오락|재미/);
});

test("새 해석은 추천 직업과 이유까지 검사하고 공백을 정리한다", () => {
  assert.deepEqual(parseRecommendedInterpretation({ ...interpretation, personality: `  ${interpretation.personality}  `,
    recommendation_reason: `  ${interpretation.recommendation_reason}  ` }), interpretation);
  for (const invalid of [
    null,
    [],
    { ...interpretation, cautions: undefined },
    { ...interpretation, strengths: "짧음" },
    { ...interpretation, personality: " ".repeat(12) },
    { ...interpretation, cautions: "가".repeat(301) },
    { ...interpretation, recommended_class: "없는 직업" },
    { ...interpretation, recommended_class: "바드, 소서리스" },
    { ...interpretation, recommendation_reason: " " },
    { ...interpretation, recommendation_reason: "가".repeat(301) },
  ]) assert.throws(() => parseRecommendedInterpretation(invalid), /해석 형식/);
});

test("기존 브라우저 기록의 세 항목 해석 형식은 계속 읽을 수 있다", () => {
  const { recommended_class: _recommendedClass, recommendation_reason: _recommendationReason, ...oldInterpretation } = interpretation;
  assert.deepEqual(parseInterpretation(oldInterpretation), oldInterpretation);
});

test("Gemini 응답 성공 시 추천까지 읽고 인증값을 요청 본문에 넣지 않는다", async () => {
  let requestBody = "";
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(GEMINI_MODEL, "gemini-3.5-flash-lite");
    assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent");
    assert.equal(init?.method, "POST");
    assert.equal(new Headers(init?.headers).get("x-goog-api-key"), "test-key");
    requestBody = String(init?.body);
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(interpretation) }] } }] });
  };
  assert.deepEqual(await interpretWithGemini(chart, "test-key", fetcher), interpretation);
  assert.ok(!requestBody.includes("test-key"));
  assert.ok(!requestBody.includes("2000-01-01"));
  assert.ok(!requestBody.includes("12:00"));
  const request = JSON.parse(requestBody) as { generationConfig: { responseMimeType: string; responseSchema: { required: string[] } } };
  assert.equal(request.generationConfig.responseMimeType, "application/json");
  assert.deepEqual(request.generationConfig.responseSchema.required, ["personality", "strengths", "cautions", "recommended_class", "recommendation_reason"]);
});

test("Gemini 사용량 제한과 연결 실패를 각각 오류로 전달한다", async () => {
  const limited: typeof fetch = async () => new Response("", { status: 429 });
  await assert.rejects(interpretWithGemini(chart, "test-key", limited), (error: unknown) =>
    error instanceof GeminiError && error.status === 429);
  const failed: typeof fetch = async () => { throw new Error("offline"); };
  await assert.rejects(interpretWithGemini(chart, "test-key", failed), (error: unknown) =>
    error instanceof GeminiError && error.status === 504);
});

test("Gemini 결제 한도 응답은 결제 안내가 있는 오류로 전달한다", async () => {
  const paymentRequired: typeof fetch = async () => new Response("", { status: 402 });
  await assert.rejects(interpretWithGemini(chart, "test-key", paymentRequired), (error: unknown) =>
    error instanceof GeminiError && error.status === 402 && /결제|크레딧|잔액/.test(error.message));
});

test("Gemini 서버의 일시적인 503 오류 후 성공하면 해석을 반환한다", async () => {
  let attempts = 0;
  const fetcher: typeof fetch = async () => {
    attempts++;
    if (attempts === 1) return new Response("", { status: 503 });
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(interpretation) }] } }] });
  };
  assert.deepEqual(await interpretWithGemini(chart, "test-key", fetcher), interpretation);
  assert.equal(attempts, 2);
});

test("Gemini 503 오류가 계속되면 세 번만 요청하고 503 안내를 반환한다", async () => {
  let attempts = 0;
  const fetcher: typeof fetch = async () => {
    attempts++;
    return new Response("", { status: 503 });
  };
  await assert.rejects(interpretWithGemini(chart, "test-key", fetcher), (error: unknown) =>
    error instanceof GeminiError && error.status === 503 && /잠시 후 다시 시도/.test(error.message));
  assert.equal(attempts, 3);
});

test("Gemini가 잘못된 JSON이나 빠진 항목을 보내면 해석을 만들지 않는다", async () => {
  for (const content of ["{broken", JSON.stringify({ personality: interpretation.personality }),
    JSON.stringify({ ...interpretation, recommended_class: "없는 직업" }),
    JSON.stringify({ ...interpretation, recommendation_reason: " " })]) {
    const fetcher: typeof fetch = async () => Response.json({ candidates: [{ content: { parts: [{ text: content }] } }] });
    await assert.rejects(interpretWithGemini(chart, "test-key", fetcher), (error: unknown) =>
      error instanceof GeminiError && error.status === 502);
  }
});
