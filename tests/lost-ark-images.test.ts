import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { LOST_ARK_CLASSES } from "../lib/saju/lost-ark-classes";
import { LOST_ARK_CLASS_IMAGES, findLostArkClassImage } from "../lib/saju/lost-ark-images";
import { calculate } from "../lib/saju/chart";
import { parseDatabaseResult } from "../lib/saju/db-history";

test("005 이미지: 허용된 직업 30개를 빠짐없이 일대일 매핑한다", () => {
  const classNames = LOST_ARK_CLASSES.map(({ name }) => name);
  assert.equal(classNames.length, 30);
  assert.equal(new Set(classNames).size, 30);
  assert.deepEqual(Object.keys(LOST_ARK_CLASS_IMAGES).sort(), [...classNames].sort());
  for (const name of classNames) assert.deepEqual(findLostArkClassImage(name), LOST_ARK_CLASS_IMAGES[name]);
  assert.equal(findLostArkClassImage("없는 직업"), null);
  assert.equal(findLostArkClassImage("constructor"), null);
});

test("005 이미지: 모든 파일이 존재하며 지정된 자르기 영역이 이미지 안에 있다", async () => {
  const usedRegions = new Set<string>();
  for (const [name, image] of Object.entries(LOST_ARK_CLASS_IMAGES)) {
    assert.match(image.src, /^\/lost-ark\/[a-z-]+\.png$/);
    const png = await readFile(join(process.cwd(), "public", image.src.slice(1)));
    assert.equal(png.subarray(1, 4).toString(), "PNG", name);
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    assert.equal(image.sourceWidth, width, name);
    assert.equal(image.sourceHeight, height, name);
    const [x, y, cropWidth, cropHeight] = image.viewBox.split(" ").map(Number);
    assert.ok([x, y, cropWidth, cropHeight].every(Number.isInteger), name);
    assert.ok(x >= 0 && y >= 0 && cropWidth > 0 && cropHeight > 0, name);
    assert.ok(x + cropWidth <= width && y + cropHeight <= height, name);
    const key = `${image.src}:${image.viewBox}`;
    assert.equal(usedRegions.has(key), false, `${name}: 이미지 영역 중복`);
    usedRegions.add(key);
  }
});

test("005 이미지: 추천이 없는 과거 DB 기록도 추천/이미지 없이 열 수 있다", () => {
  const chart = calculate({ date: "2000-01-01", time: "12:00", calendar: "solar", topic: "general" });
  const old = parseDatabaseResult({
    id: "11111111-1111-4111-8111-111111111111",
    created_at: "2026-09-23T00:00:00.000Z",
    birth_date: "2000-01-01",
    birth_time: "12:00:00",
    chart,
    personality: "차분하게 자신의 속도를 지키는 편이에요.",
    strengths: "맡은 일을 꾸준히 이어가는 힘이 있어요.",
    cautions: "가끔은 쉬어 가며 주변의 도움도 받아 보세요.",
    recommended_class: null,
    recommendation_reason: null,
    model: "gemini-test",
  });
  assert.ok(old);
  assert.equal(old.recommendation, null);
});

test("005 이미지: 화면은 추천이 있을 때만 이미지를 표시하고 비공식 생성 이미지임을 알린다", async () => {
  const form = await readFile(join(process.cwd(), "app/saju-form.tsx"), "utf8");
  const component = await readFile(join(process.cwd(), "app/lost-ark-class-image.tsx"), "utf8");
  assert.match(form, /recommendation\s*\?\s*\(/);
  assert.match(form, /<LostArkClassImage className=\{recommendation\.recommendedClass\}/);
  assert.match(component, /if \(!image\) return null/);
  assert.match(component, /로스트아크 공식 아트가 아닙니다/);
});
