"use client";

import { useEffect, useState } from "react";
import { todayInKorea, type SajuChart } from "../lib/saju/chart";
import { getDailyFortune, parseDailyFortune, type DailyFortune } from "../lib/saju/daily-fortune";

const KOREA_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function untilNextKoreanDay(now: Date): number {
  const koreaTime = now.getTime() + KOREA_OFFSET_MS;
  return DAY_MS - (koreaTime % DAY_MS) + 20;
}

type SaveState = {
  key: string;
  status: "saving" | "saved" | "unsaved" | "login";
  fortune?: DailyFortune;
  error?: string;
};

export default function DailyFortuneSection({ chart, birthDate, birthTime, userId }: {
  chart: SajuChart;
  birthDate: string;
  birthTime: string;
  userId: string | null;
}) {
  const [date, setDate] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState | null>(null);
  const [retry, setRetry] = useState(0);

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

  useEffect(() => {
    if (!date || !userId) return;
    try {
      getDailyFortune(chart, date);
    } catch {
      return;
    }

    const key = `${userId}|${birthDate}|${birthTime}|${date}`;
    const controller = new AbortController();
    let active = true;
    setSaveState({ key, status: "saving" });
    async function save() {
      try {
        const response = await fetch("/api/daily-fortune", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: birthDate, time: birthTime }),
          cache: "no-store",
          signal: controller.signal,
        });
        const body: unknown = await response.json().catch(() => ({}));
        if (!active) return;
        const payload = body && typeof body === "object" ? body as Record<string, unknown> : {};
        const saved = parseDailyFortune(payload.fortune);
        if (response.ok && payload.saved === true && saved?.date === date) {
          setSaveState({ key, status: "saved", fortune: saved });
        } else if (response.status === 401) {
          setSaveState({ key, status: "login", error: "계정 저장을 계속하려면 다시 로그인해 주세요." });
        } else {
          setSaveState({ key, status: "unsaved", error: typeof payload.error === "string"
            ? payload.error : "오늘의 운세를 계정에 저장하지 못했습니다. 다시 시도해 주세요." });
        }
      } catch {
        if (active) setSaveState({ key, status: "unsaved", error: "오늘의 운세를 계정에 저장하지 못했습니다. 다시 시도해 주세요." });
      }
    }
    void save();
    return () => { active = false; controller.abort(); };
  }, [chart, birthDate, birthTime, userId, date, retry]);

  if (!date) return null;

  let localFortune;
  try {
    localFortune = getDailyFortune(chart, date);
  } catch {
    return (
      <section className="daily-fortune" aria-label="오늘의 운세">
        <h3>오늘의 운세</h3>
        <p>오늘의 운세를 계산할 수 없어요. 새로고침하거나 사주를 다시 계산해 주세요.</p>
      </section>
    );
  }

  const key = userId ? `${userId}|${birthDate}|${birthTime}|${date}` : null;
  const currentSave = saveState?.key === key ? saveState : null;
  const fortune = currentSave?.status === "saved" && currentSave.fortune
    ? currentSave.fortune : localFortune;
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
      {userId && (
        <div className="daily-fortune-save" role="status" aria-live="polite">
          {(!currentSave || currentSave.status === "saving") && <p>계정에 저장하는 중...</p>}
          {currentSave?.status === "saved" && <p>계정에 저장됐어요.</p>}
          {(currentSave?.status === "unsaved" || currentSave?.status === "login") && (
            <>
              <p>{currentSave.error}</p>
              {currentSave.status === "unsaved" && (
                <button type="button" onClick={() => setRetry((value) => value + 1)}>저장 다시 시도</button>
              )}
            </>
          )}
        </div>
      )}
      <p className="daily-fortune-note">사주를 바탕으로 한 오락용 안내예요. 실제 일을 예측하거나 결과를 보장하지 않아요.</p>
    </section>
  );
}
