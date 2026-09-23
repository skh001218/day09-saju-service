import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { calculate } from "../lib/saju/chart";
import {
  ELEMENT_CONTROL_CYCLE,
  ELEMENT_GENERATION_CYCLE,
  getElementRelations,
} from "../lib/saju/element-relations";

test("009: 상생·상극 순환은 다섯 오행을 각각 한 번씩 거친다", () => {
  assert.deepEqual([...ELEMENT_GENERATION_CYCLE], ["목", "화", "토", "금", "수"]);
  assert.deepEqual([...ELEMENT_CONTROL_CYCLE], ["목", "토", "수", "화", "금"]);
  assert.equal(new Set(ELEMENT_GENERATION_CYCLE).size, 5);
  assert.equal(new Set(ELEMENT_CONTROL_CYCLE).size, 5);
});

test("009: 각 일간 오행에서 생하고 생받는 대상, 극하고 극받는 대상이 정확하다", () => {
  const expected = [
    { self: "목", generates: "화", generatedBy: "수", controls: "토", controlledBy: "금" },
    { self: "화", generates: "토", generatedBy: "목", controls: "금", controlledBy: "수" },
    { self: "토", generates: "금", generatedBy: "화", controls: "수", controlledBy: "목" },
    { self: "금", generates: "수", generatedBy: "토", controls: "목", controlledBy: "화" },
    { self: "수", generates: "목", generatedBy: "금", controls: "화", controlledBy: "토" },
  ];
  for (const item of expected) {
    assert.deepEqual(getElementRelations(item.self), item);
  }
});

test("009: 손상된 일간 오행을 다른 오행으로 추측하지 않는다", () => {
  for (const value of [null, undefined, "", "나무", " 木", "목 ", 0, [], {}, { element: "목" }]) {
    assert.equal(getElementRelations(value), null);
  }
});

test("009: 기존 계산 결과의 일간으로 관계를 구해도 사주 결과는 변하지 않는다", () => {
  const chart = calculate({ date: "2000-01-01", time: "12:00", calendar: "solar", topic: "general" });
  const before = JSON.stringify(chart);
  const relations = getElementRelations(chart.dayMaster.element);
  assert.ok(relations);
  assert.equal(relations.self, chart.dayMaster.element);
  assert.equal(JSON.stringify(chart), before);
});

test("009: 계산 및 기록 화면에 같은 일간 기반 도식을 표시한다", async () => {
  const form = await readFile(join(process.cwd(), "app/saju-form.tsx"), "utf8");
  const diagram = await readFile(join(process.cwd(), "app/five-elements-relations.tsx"), "utf8");
  assert.match(form, /<FiveElementsRelations\s+element=\{chart\.dayMaster\.element\}/);
  assert.match(diagram, /<svg\b/);
  assert.match(diagram, /상생/);
  assert.match(diagram, /상극/);
  assert.match(diagram, /내 오행/);
  assert.match(diagram, /getElementRelations\(element\)/);
  assert.match(diagram, /role="img"/);
  assert.match(diagram, /aria-labelledby="five-elements-diagram-title five-elements-diagram-description"/);
  assert.match(diagram, /<title\b/);
  assert.match(diagram, /<desc\b/);
  assert.match(diagram, /목 → 화 → 토 → 금 → 수 → 목/);
  assert.match(diagram, /목 → 토 → 수 → 화 → 금 → 목/);
  for (const label of ["나를 돕는 오행", "내가 돕는 오행", "나를 견제하는 오행", "내가 견제하는 오행"]) {
    assert.ok(diagram.includes(label));
  }
  assert.match(diagram, /일간 오행을 확인할 수 없어/);
  assert.match(diagram, /markerEnd="url\(#generation-arrow\)"/);
  assert.match(diagram, /markerEnd="url\(#control-arrow\)"/);
});
