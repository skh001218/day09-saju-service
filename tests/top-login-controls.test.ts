import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

test("첫 화면에서 로그인 영역이 제목과 사주 입력보다 먼저 나온다", async () => {
  const source = await readFile(join(process.cwd(), "app/saju-form.tsx"), "utf8");
  const markupStart = source.search(/\breturn\s*\(\s*<>/);
  assert.ok(markupStart >= 0, "페이지의 JSX 반환 영역이 있어야 합니다");
  const markup = source.slice(markupStart);
  assert.match(
    markup,
    /^return\s*\(\s*<>\s*<AuthControls onAuthChange=\{handleAuthChange\} \/>/,
    "로그인 영역은 페이지 콘텐츠의 첫 요소여야 합니다",
  );
  const login = markup.indexOf("<AuthControls onAuthChange={handleAuthChange} />");
  const heading = markup.indexOf('<header className="page-header">');
  const input = markup.indexOf('<section className="input-card"');

  assert.ok(login >= 0, "로그인 영역이 있어야 합니다");
  assert.ok(heading > login, "제목은 로그인 영역 뒤에 있어야 합니다");
  assert.ok(input > heading, "입력 영역은 제목 뒤에 있어야 합니다");
  assert.equal(markup.match(/<AuthControls onAuthChange=\{handleAuthChange\} \/>/g)?.length, 1);
});
