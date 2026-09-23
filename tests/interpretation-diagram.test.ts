import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

async function readForm() {
  return (await readFile(join(process.cwd(), "app/saju-form.tsx"), "utf8")).replace(/\r\n/g, "\n");
}

function between(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `구간 시작이 없습니다: ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(to, -1, `구간 끝이 없습니다: ${end}`);
  return source.slice(from, to);
}

test("010: 계산 결과에는 개수만, 자세한 해석 결과에는 오행 상생·상극 그림을 표시한다", async () => {
  const source = await readForm();
  const calculated = between(source, '<section className="result"', "{interpretation && (");
  const reading = between(source, "{interpretation && (", "\n              </section>\n            )}");

  assert.match(calculated, /<FiveElementsOverview elements=\{chart\.elements\}/);
  assert.doesNotMatch(calculated, /<FiveElementsRelations\b/);
  assert.match(reading, /<section className="interpretation" aria-label="자세한 사주 해석">/);
  assert.match(reading, /<FiveElementsRelations element=\{chart\.dayMaster\.element\}/);
  assert.equal((source.match(/<FiveElementsRelations\b/g) ?? []).length, 1);
});

test("010: 해석 성공, 저장 실패 후 유효한 해석, 계정·브라우저 기록 재열기에서 해석을 표시한다", async () => {
  const source = await readForm();
  const request = between(source, "async function handleInterpret()", "function handleOpenSaved(");
  const saved = between(source, "function handleOpenSaved(", "function handleOpenAccount(");
  const account = between(source, "function handleOpenAccount(", "async function handleDeleteAccount(");

  assert.match(request, /if \(payload\.saved === false && payload\.interpretation\)[\s\S]*?setInterpretation\(parseInterpretation\(reading\)\)/);
  assert.match(request, /const record = parseDatabaseResult\(payload\.record\);[\s\S]*?setInterpretation\(record\.interpretation\)/);
  assert.match(saved, /setChart\(record\.chart\);[\s\S]*?setInterpretation\(record\.interpretation\)/);
  assert.match(account, /setChart\(record\.chart\);[\s\S]*?setInterpretation\(record\.interpretation\)/);
});

test("010: 새 입력·재계산·해석 요청 시 이전 그림을 숨기고, 오류에는 유효한 해석을 만들지 않는다", async () => {
  const source = await readForm();
  const input = between(source, "function handleInputChange()", "function handleInvalidInputOnBlur(");
  const submit = between(source, "function handleSubmit(", "async function handleInterpret()");
  const request = between(source, "async function handleInterpret()", "function handleOpenSaved(");

  assert.match(input, /setChart\(null\);[\s\S]*?setInterpretation\(null\)/);
  assert.match(submit, /setInterpretation\(null\);[\s\S]*?setChart\(calculate\(input\)\)/);
  assert.match(request, /setLoading\(true\);[\s\S]*?setInterpretation\(null\)/);
  assert.match(request, /if \(!response\.ok\) \{[\s\S]*?if \(payload\.saved === false && payload\.interpretation\)/);
  assert.match(request, /catch \(caught\) \{[\s\S]*?setInterpretationError\(/);
});
