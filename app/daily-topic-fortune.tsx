"use client";

import { useEffect, useState } from "react";
import { todayInKorea } from "../lib/saju/chart";
import { parseDailyTopicFortune, type DailyTopicFortune } from "../lib/saju/daily-topic-fortune";

const DAY_MS = 86_400_000;
const KOREA_OFFSET_MS = 9 * 3_600_000;

function untilNextKoreanDay(now: Date) {
  return DAY_MS - ((now.getTime() + KOREA_OFFSET_MS) % DAY_MS) + 20;
}

type State = { key: string; status: "loading" | "saved" | "unsaved" | "error" | "login"; fortune?: DailyTopicFortune; message?: string };

export default function DailyTopicFortuneSection({ birthDate, birthTime, userId, recordId }: {
  birthDate: string;
  birthTime: string;
  userId: string;
  recordId: string;
}) {
  const [date, setDate] = useState<string | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timeout);
      const now = new Date();
      setDate(todayInKorea(now));
      timeout = setTimeout(refresh, untilNextKoreanDay(now));
    };
    refresh();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      clearTimeout(timeout);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  useEffect(() => {
    if (!date) return;
    const key = `${userId}|${recordId}|${birthDate}|${birthTime}|${date}`;
    const controller = new AbortController();
    let active = true;
    setState({ key, status: "loading" });
    async function load() {
      try {
        const response = await fetch("/api/daily-topic-fortune", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: birthDate, time: birthTime }),
          cache: "no-store",
          signal: controller.signal,
        });
        const body: unknown = await response.json().catch(() => ({}));
        if (!active) return;
        const payload = body && typeof body === "object" ? body as Record<string, unknown> : {};
        const fortune = parseDailyTopicFortune(payload.fortune);
        if (fortune && fortune.date !== date) {
          setDate(todayInKorea());
          return;
        }
        if (response.ok && payload.saved === true && fortune) {
          setState({ key, status: "saved", fortune });
        } else if (fortune && payload.saved === false) {
          setState({ key, status: "unsaved", fortune, message: "주제별 운세를 계정에 저장하지 못했습니다. 다시 시도해 주세요." });
        } else if (response.status === 401) {
          setState({ key, status: "login", message: "로그인이 만료됐습니다. 다시 로그인해 주세요." });
        } else {
          setState({ key, status: "error", message: typeof payload.error === "string" ? payload.error : "주제별 운세를 가져오지 못했습니다. 다시 시도해 주세요." });
        }
      } catch {
        if (active) setState({ key, status: "error", message: "주제별 운세를 가져오지 못했습니다. 다시 시도해 주세요." });
      }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [date, birthDate, birthTime, userId, recordId, retry]);

  const key = `${userId}|${recordId}|${birthDate}|${birthTime}|${date}`;
  const current = state?.key === key ? state : null;
  const [year, month, day] = date?.split("-").map(Number) ?? [];
  return (
    <section className="daily-topic-fortune" aria-label="오늘의 금전운 건강운 직장운">
      <h4>오늘의 금전운·건강운·직장운</h4>
      {date && <p className="daily-fortune-date">{year}년 {month}월 {day}일</p>}
      {(!date || !current || current.status === "loading") && <p role="status">주제별 운세를 불러오는 중...</p>}
      {current?.fortune && <dl>
        <div><dt>금전운</dt><dd>{current.fortune.money}</dd></div>
        <div><dt>건강운</dt><dd>{current.fortune.health}</dd></div>
        <div><dt>직장운</dt><dd>{current.fortune.work}</dd></div>
      </dl>}
      {current?.status === "saved" && <p role="status">계정에 저장됐어요.</p>}
      {current && ["unsaved", "error", "login"].includes(current.status) && <div role="status">
        <p>{current.message}</p>
        {current.status !== "login" && <button type="button" onClick={() => setRetry((value) => value + 1)}>주제별 운세 다시 시도</button>}
      </div>}
      <p className="daily-fortune-note">사주를 바탕으로 한 오락용 안내예요. 재정·건강·직업 결정을 대신하지 않아요.</p>
    </section>
  );
}
