"use client";

import { useEffect, useState } from "react";
import { todayInKorea, type SajuChart } from "../lib/saju/chart";
import { getDailyFortune } from "../lib/saju/daily-fortune";

const KOREA_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function untilNextKoreanDay(now: Date): number {
  const koreaTime = now.getTime() + KOREA_OFFSET_MS;
  return DAY_MS - (koreaTime % DAY_MS) + 20;
}

export default function DailyFortuneSection({ chart }: { chart: SajuChart }) {
  const [date, setDate] = useState<string | null>(null);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const update = () => {
      const now = new Date();
      setDate(todayInKorea(now));
      timeout = setTimeout(update, untilNextKoreanDay(now));
    };
    const refresh = () => {
      clearTimeout(timeout);
      update();
    };
    update();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      clearTimeout(timeout);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  if (!date) return null;

  let fortune;
  try {
    fortune = getDailyFortune(chart, date);
  } catch {
    return (
      <section className="daily-fortune" aria-label="오늘의 운세">
        <h3>오늘의 운세</h3>
        <p>오늘의 운세를 계산할 수 없어요. 새로고침하거나 사주를 다시 계산해 주세요.</p>
      </section>
    );
  }

  const [year, month, day] = fortune.date.split("-").map(Number);
  return (
    <section className="daily-fortune" aria-label="오늘의 운세">
      <p className="daily-fortune-date">{year}년 {month}월 {day}일 · 오늘의 운세</p>
      <h3>오늘을 가볍게 읽어보세요</h3>
      <dl>
        <div><dt>오늘의 흐름</dt><dd>{fortune.flow}</dd></div>
        <div><dt>해볼 만한 행동</dt><dd>{fortune.action}</dd></div>
        <div><dt>주의할 점</dt><dd>{fortune.caution}</dd></div>
      </dl>
      <p className="daily-fortune-note">사주를 바탕으로 한 오락용 안내예요. 실제 일을 예측하거나 결과를 보장하지 않아요.</p>
    </section>
  );
}
