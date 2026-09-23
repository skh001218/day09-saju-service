import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { InputError, validateInput, type SajuInput } from "../lib/saju/chart";

const validInput: SajuInput = {
  date: "2000-01-01",
  time: "12:59",
  calendar: "solar",
  topic: "general",
};

test("생년월일은 정확한 네 자리 연도와 실제 달력 날짜만 허용한다", () => {
  for (const date of ["99999-09-31", "99999-09-30", "2000-9-01", "2000-09-1", "2000/09/01", "2000-09-31", "1989-12-31"]) {
    assert.throws(
      () => validateInput({ ...validInput, date }),
      (error: unknown) => error instanceof InputError && error.field === "date",
      date,
    );
  }
  assert.equal(validateInput({ ...validInput, date: "2000-02-29" }).date, "2000-02-29");
});

test("미래 출생일은 계산하지 않는다", () => {
  const tomorrowInKorea = new Date(Date.now() + (9 + 24) * 60 * 60 * 1000)
    .toISOString().slice(0, 10);
  assert.throws(
    () => validateInput({ ...validInput, date: tomorrowInKorea }),
    (error: unknown) => error instanceof InputError && error.field === "date",
  );
});

test("출생시간은 오전/오후 표시나 초 없이 24시간 HH:mm만 허용한다", () => {
  for (const time of ["오후 12:59", "12:59 PM", "12:59:00", "1:05", "24:00", "12:60"]) {
    assert.throws(
      () => validateInput({ ...validInput, time }),
      (error: unknown) => error instanceof InputError && error.field === "time",
      time,
    );
  }
  for (const time of ["00:00", "09:05", "12:59", "23:59"]) {
    assert.equal(validateInput({ ...validInput, time }).time, time);
  }
});

test("생년월일·출생시간 입력칸은 기존 날짜·시간 선택기를 유지하고 허용 범위를 제한한다", () => {
  const source = readFileSync(join(process.cwd(), "app", "saju-form.tsx"), "utf8");
  const inputs = new Map<string, string>();
  for (const id of ["date", "time"]) {
    const idIndex = source.indexOf(`id="${id}"`);
    assert.notEqual(idIndex, -1, `${id} 입력칸이 있어야 합니다.`);
    const start = source.lastIndexOf("<input", idIndex);
    const end = source.indexOf("/>", idIndex);
    assert.ok(start >= 0 && end > idIndex, `${id} 입력칸을 읽을 수 있어야 합니다.`);
    inputs.set(id, source.slice(start, end + 2));
  }

  const dateInput = inputs.get("date")!;
  assert.match(dateInput, /type="date"/);
  assert.match(dateInput, /min="1990-01-01"/);
  assert.match(dateInput, /max=\{todayInKorea\(\)\}/);
  assert.match(dateInput, /onBlur=/);

  const timeInput = inputs.get("time")!;
  assert.match(timeInput, /type="time"/);
  assert.match(timeInput, /min="00:00"/);
  assert.match(timeInput, /max="23:59"/);
  assert.match(timeInput, /step=\{?60\}?/);
  assert.match(timeInput, /onBlur=/);
});
