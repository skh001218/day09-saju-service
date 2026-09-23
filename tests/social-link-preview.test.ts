import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const title = "처음 만나는 쉬운 사주";
const description = "내 사주와 오행을 쉬운 말과 그림으로 알아보세요.";

test("011: Open Graph와 Twitter 공유 이미지는 유효한 1200×630 PNG다", async () => {
  for (const name of ["opengraph-image", "twitter-image"]) {
    const png = await readFile(join(root, "app", `${name}.png`));
    assert.ok(png.length > 10_000, `${name} should contain a rendered image`);
    assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    assert.equal(png.toString("ascii", 12, 16), "IHDR");
    assert.equal(png.readUInt32BE(16), 1200);
    assert.equal(png.readUInt32BE(20), 630);
    assert.equal(png.subarray(-8).toString("ascii", 0, 4), "IEND");
  }
});

test("011: 한국어 공유 제목·설명과 큰 Twitter 카드가 설정된다", async () => {
  const layout = await readFile(join(root, "app", "layout.tsx"), "utf8");
  assert.match(layout, /metadataBase:\s*new URL\("https:\/\/day09-saju-service\.vercel\.app"\)/);
  assert.ok(layout.includes(`title: "${title}"`));
  assert.ok(layout.includes(`description: "${description}"`));
  assert.match(layout, /openGraph:\s*\{[\s\S]*?type:\s*"website"/);
  assert.match(layout, /twitter:\s*\{[\s\S]*?card:\s*"summary_large_image"/);
  for (const name of ["opengraph-image", "twitter-image"]) {
    const alt = await readFile(join(root, "app", `${name}.alt.txt`), "utf8");
    assert.ok(alt.includes(title));
    for (const element of ["목", "화", "토", "금", "수"]) assert.ok(alt.includes(element));
  }
});
