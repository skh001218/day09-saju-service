import test from "node:test";
import assert from "node:assert/strict";
import { calculate, type SajuInput } from "../lib/saju/chart";
import { getPersonalitySentence } from "../lib/saju/personality";

test("다섯 일간 오행에 각각 다른 쉬운 성향 문장 하나를 제공한다", () => {
  const expectedThemes = {
    목: "성장",
    화: "표현",
    토: "꾸준히",
    금: "정리",
    수: "유연하게",
  } as const;

  const sentences = Object.entries(expectedThemes).map(([element, theme]) => {
    const sentence = getPersonalitySentence(element);
    assert.ok(sentence.includes(theme), `${element} 문장의 핵심 뜻을 확인합니다.`);
    assert.match(sentence, /^[가-힣\s·,]+[.!?]$/);
    return sentence;
  });

  assert.equal(new Set(sentences).size, 5);
});

test("계산한 일간 오행으로 해당 성향 문장을 선택할 수 있다", () => {
  const input: SajuInput = {
    date: "2000-01-01",
    time: "12:00",
    calendar: "solar",
    topic: "general",
  };
  const chart = calculate(input);

  assert.equal(chart.dayMaster.element, "토");
  assert.match(getPersonalitySentence(chart.dayMaster.element), /꾸준히/);
});

test("지원하지 않는 오행으로 성향을 임의 생성하지 않는다", () => {
  for (const element of ["", "바람", "toString"]) {
    assert.throws(
      () => getPersonalitySentence(element),
      /지원하지 않는 일간 오행/,
    );
  }
});
