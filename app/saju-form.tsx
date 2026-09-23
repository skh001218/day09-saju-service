"use client";

import { useEffect, useRef, useState, type FocusEvent, type FormEvent } from "react";
import {
  calculate,
  InputError,
  todayInKorea,
  type SajuChart,
  type SajuInput,
} from "../lib/saju/chart";
import { getPersonalitySentence } from "../lib/saju/personality";
import {
  deleteResult,
  loadHistory,
  type SavedResult,
} from "../lib/saju/history";
import { parseInterpretation, parseRecommendedInterpretation, type Interpretation, type Recommendation } from "../lib/saju/interpretation";
import { parseDatabaseResult, type DatabaseResult } from "../lib/saju/db-history";
import AuthControls from "./auth-controls";
import FiveElementsOverview from "./five-elements-overview";
import { LostArkClassImage } from "./lost-ark-class-image";

type AuthUser = { id: string; email?: string };

export default function SajuForm() {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [dateInputVersion, setDateInputVersion] = useState(0);
  const [timeInputVersion, setTimeInputVersion] = useState(0);
  const [chart, setChart] = useState<SajuChart | null>(null);
  const [calculatedInput, setCalculatedInput] = useState<SajuInput | null>(null);
  const [interpretation, setInterpretation] = useState<Interpretation | null>(null);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [history, setHistory] = useState<SavedResult[]>([]);
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null | undefined>(undefined);
  const [accountHistory, setAccountHistory] = useState<DatabaseResult[]>([]);
  const [accountCursor, setAccountCursor] = useState<string | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [error, setError] = useState("");
  const [interpretationError, setInterpretationError] = useState("");
  const [storageNotice, setStorageNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const requestNumber = useRef(0);
  const pendingRequest = useRef<AbortController | null>(null);
  const interpretationRequestId = useRef<string | null>(null);
  const activeUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    try {
      const saved = loadHistory(window.localStorage);
      setHistory(saved.records);
      if (saved.warning) {
        setStorageNotice("일부 저장된 결과를 읽지 못했습니다. 정상 기록은 계속 볼 수 있어요.");
      }
    } catch {
      setStorageNotice("브라우저 저장소를 사용할 수 없습니다. 해석 결과가 저장되지 않을 수 있어요.");
    }
    return () => pendingRequest.current?.abort();
  }, []);

  useEffect(() => {
    if (!authUser) return;
    const controller = new AbortController();
    void loadAccountHistory(null, controller.signal);
    return () => controller.abort();
  }, [authUser?.id]);

  async function loadAccountHistory(cursor: string | null, signal?: AbortSignal) {
    if (!activeUserId.current) return;
    setAccountLoading(true);
    setAccountError("");
    try {
      const url = cursor ? `/api/results?cursor=${encodeURIComponent(cursor)}` : "/api/results";
      const response = await fetch(url, { cache: "no-store", signal });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = payload && typeof payload === "object" && "error" in payload &&
          typeof payload.error === "string" ? payload.error : "계정 기록을 불러오지 못했습니다.";
        throw new Error(message);
      }
      if (!payload || typeof payload !== "object" || !("records" in payload) ||
          !Array.isArray(payload.records)) throw new Error("계정 기록 형식이 올바르지 않습니다.");
      const records = payload.records.map(parseDatabaseResult)
        .filter((item): item is DatabaseResult => item !== null);
      if (signal?.aborted || activeUserId.current !== authUser?.id) return;
      setAccountHistory((previous) => cursor
        ? [...previous, ...records.filter((item) => !previous.some((saved) => saved.id === item.id))]
        : records);
      const next = "nextCursor" in payload ? payload.nextCursor : null;
      setAccountCursor(typeof next === "string" ? next : null);
    } catch (caught) {
      if (signal?.aborted || activeUserId.current !== authUser?.id) return;
      setAccountError(caught instanceof Error ? caught.message : "계정 기록을 불러오지 못했습니다.");
    } finally {
      if (!signal?.aborted && activeUserId.current === authUser?.id) setAccountLoading(false);
    }
  }

  function handleAuthChange(user: AuthUser | null) {
    const nextId = user?.id ?? null;
    if (activeUserId.current !== nextId) {
      stopPendingRequest();
      interpretationRequestId.current = null;
      setAccountHistory([]);
      setAccountCursor(null);
      setAccountError("");
      setInterpretationError("");
      setRecommendation(null);
      if (activeSavedId === null) setInterpretation(null);
      if (activeAccountId !== null) {
        setDate("");
        setTime("");
        setChart(null);
        setCalculatedInput(null);
        setInterpretation(null);
        setRecommendation(null);
        setActiveAccountId(null);
      }
      activeUserId.current = nextId;
    }
    setAuthUser(user);
  }

  function stopPendingRequest() {
    requestNumber.current += 1;
    pendingRequest.current?.abort();
    pendingRequest.current = null;
    setLoading(false);
  }

  function handleInputChange() {
    stopPendingRequest();
    interpretationRequestId.current = null;
    setChart(null);
    setCalculatedInput(null);
    setInterpretation(null);
    setRecommendation(null);
    setActiveSavedId(null);
    setActiveAccountId(null);
    setError("");
    setInterpretationError("");
    setStorageNotice("");
  }

  function handleInvalidInputOnBlur(event: FocusEvent<HTMLInputElement>, field: "date" | "time") {
    const input = event.currentTarget;
    if (input.validity.valid || (input.value === "" && !input.validity.badInput)) return;
    if (field === "date") {
      setDate("");
      setDateInputVersion((version) => version + 1);
    } else {
      setTime("");
      setTimeInputVersion((version) => version + 1);
    }
    handleInputChange();
    setError(field === "date"
      ? "생년월일은 1990년 1월 1일부터 오늘까지의 실제 날짜를 선택해 주세요."
      : "출생시간은 실제 시각을 선택해 주세요.");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    stopPendingRequest();
    interpretationRequestId.current = null;
    setInterpretation(null);
    setRecommendation(null);
    setActiveSavedId(null);
    setActiveAccountId(null);
    setInterpretationError("");
    setStorageNotice("");
    const input: SajuInput = {
      date,
      time,
      calendar: "solar",
      topic: "general",
      question: "",
    };

    try {
      setChart(calculate(input));
      setCalculatedInput(input);
      setError("");
    } catch (caught) {
      setChart(null);
      setCalculatedInput(null);
      setError(
        caught instanceof InputError
          ? caught.message
          : "계산하지 못했습니다. 입력을 확인해주세요.",
      );
    }
  }

  async function handleInterpret() {
    if (!chart || !calculatedInput || loading || pendingRequest.current) return;
    if (!authUser) {
      setInterpretationError("자세한 해석을 보려면 먼저 Google로 로그인해 주세요.");
      return;
    }
    const currentRequest = ++requestNumber.current;
    const controller = new AbortController();
    const requestId = interpretationRequestId.current ?? crypto.randomUUID();
    interpretationRequestId.current = requestId;
    pendingRequest.current = controller;
    setLoading(true);
    setActiveSavedId(null);
    setActiveAccountId(null);
    setInterpretationError("");
    setStorageNotice("");
    setInterpretation(null);
    setRecommendation(null);

    try {
      const response = await fetch("/api/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: calculatedInput.date,
          time: calculatedInput.time,
          request_id: requestId,
        }),
        signal: controller.signal,
        cache: "no-store",
      });
      const data: unknown = await response.json().catch(() => ({}));
      if (currentRequest !== requestNumber.current) return;
      const payload = data as {
        error?: unknown;
        interpretation?: unknown;
        record?: unknown;
        saved?: unknown;
      };
      if (!response.ok) {
        if (payload.saved === false && payload.interpretation) {
          try {
            const reading = parseRecommendedInterpretation(payload.interpretation);
            setInterpretation(parseInterpretation(reading));
            setRecommendation({
              recommendedClass: reading.recommended_class,
              recommendationReason: reading.recommendation_reason,
            });
            setStorageNotice("해석은 표시했지만 계정에 저장되지 않았습니다.");
          } catch {
            // A malformed response must not be shown as an interpretation.
          }
        }
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : "해석을 가져오지 못했습니다. 다시 시도해 주세요.",
        );
      }

      const record = parseDatabaseResult(payload.record);
      if (!record) {
        throw new Error("계정 저장 상태를 확인하지 못했습니다. 다시 시도해 주세요.");
      }
      setInterpretation(record.interpretation);
      setRecommendation(record.recommendation);
      setAccountHistory((previous) => [record, ...previous.filter((item) => item.id !== record.id)]);
      setActiveAccountId(record.id);
      interpretationRequestId.current = null;
    } catch (caught) {
      if (currentRequest !== requestNumber.current) return;
      setInterpretationError(
        caught instanceof Error && !(caught instanceof TypeError)
          ? caught.message
          : "해석을 가져오지 못했습니다. 다시 시도해 주세요.",
      );
    } finally {
      if (currentRequest === requestNumber.current) {
        setLoading(false);
        pendingRequest.current = null;
      }
    }
  }

  function handleOpenSaved(record: SavedResult) {
    stopPendingRequest();
    interpretationRequestId.current = null;
    setDate(record.date);
    setTime(record.time);
    setChart(record.chart);
    setCalculatedInput({
      date: record.date,
      time: record.time,
      calendar: "solar",
      topic: "general",
    });
    setInterpretation(record.interpretation);
    setRecommendation(null);
    setActiveSavedId(record.id);
    setActiveAccountId(null);
    setError("");
    setInterpretationError("");
    setStorageNotice("");
  }

  function handleOpenAccount(record: DatabaseResult) {
    stopPendingRequest();
    interpretationRequestId.current = null;
    setDate(record.date);
    setTime(record.time);
    setChart(record.chart);
    setCalculatedInput({
      date: record.date,
      time: record.time,
      calendar: "solar",
      topic: "general",
    });
    setInterpretation(record.interpretation);
    setRecommendation(record.recommendation);
    setActiveSavedId(null);
    setActiveAccountId(record.id);
    setError("");
    setInterpretationError("");
    setStorageNotice("");
  }

  async function handleDeleteAccount(id: string) {
    if (!window.confirm("이 계정 결과를 삭제할까요? 삭제 후에는 되돌릴 수 없습니다.")) return;
    const ownerId = authUser?.id;
    setAccountError("");
    try {
      const response = await fetch(`/api/results/${encodeURIComponent(id)}`, {
        method: "DELETE",
        cache: "no-store",
      });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = payload && typeof payload === "object" && "error" in payload &&
          typeof payload.error === "string" ? payload.error : "계정 결과를 삭제하지 못했습니다.";
        throw new Error(message);
      }
      if (!ownerId || activeUserId.current !== ownerId) return;
      setAccountHistory((previous) => previous.filter((item) => item.id !== id));
      if (activeAccountId === id) {
        stopPendingRequest();
        setDate("");
        setTime("");
        setChart(null);
        setCalculatedInput(null);
        setInterpretation(null);
        setRecommendation(null);
        setActiveAccountId(null);
      }
    } catch (caught) {
      setAccountError(caught instanceof Error ? caught.message : "계정 결과를 삭제하지 못했습니다.");
    }
  }

  function handleDeleteSaved(id: string) {
    if (!window.confirm("이 저장된 결과를 삭제할까요? 삭제 후에는 되돌릴 수 없습니다.")) return;
    try {
      setHistory(deleteResult(window.localStorage, id));
      setStorageNotice("");
      if (activeSavedId === id) {
        stopPendingRequest();
        setDate("");
        setTime("");
        setChart(null);
        setCalculatedInput(null);
        setInterpretation(null);
        setRecommendation(null);
        setActiveSavedId(null);
      }
    } catch {
      setStorageNotice("저장된 결과를 삭제하지 못했습니다. 다시 시도해 주세요.");
    }
  }

  return (
    <>
      <AuthControls onAuthChange={handleAuthChange} />
      <header className="page-header">
        <h1>내 사주를 확인해보세요.</h1>
        <p className="intro">
          생년월일과 태어난 시간을 입력하면 기본 사주를 계산합니다.
        </p>
      </header>
      <section className="input-card" aria-labelledby="input-title">
      <h2 id="input-title">언제 태어나셨나요?</h2>
      <p className="form-intro">양력 생년월일과 태어난 시간을 입력해주세요.</p>
      <form onSubmit={handleSubmit}>
        <label htmlFor="date">생년월일</label>
        <input
          key={`date-${dateInputVersion}`}
          id="date"
          name="date"
          type="date"
          min="1990-01-01"
          max={todayInKorea()}
          value={date}
          required
          onChange={(event) => {
            setDate(event.target.value);
            handleInputChange();
          }}
          onBlur={(event) => handleInvalidInputOnBlur(event, "date")}
        />

        <label htmlFor="time">출생시간</label>
        <input
          key={`time-${timeInputVersion}`}
          id="time"
          name="time"
          type="time"
          min="00:00"
          max="23:59"
          step={60}
          value={time}
          required
          onChange={(event) => {
            setTime(event.target.value);
            handleInputChange();
          }}
          onBlur={(event) => handleInvalidInputOnBlur(event, "time")}
        />

        <button type="submit">내 사주 알아보기</button>
      </form>

      <div className="feedback" aria-live="polite">
        {error && <p className="error">{error}</p>}
        {chart && (
          <section className="result" aria-labelledby="result-title">
            <p className="result-label">계산 결과</p>
            <h2 id="result-title" className="day-pillar">
              {chart.pillars[2].korean}일주
            </h2>
            <p className="day-master">
              일간은 {chart.dayMaster.korean}
              {chart.dayMaster.element}({chart.dayMaster.character})입니다.
            </p>
            <div className="personality-summary">
              <p className="personality-label">쉽게 읽는 기본 성향</p>
              <p className="personality-sentence">
                {getPersonalitySentence(chart.dayMaster.element)}
              </p>
              <p className="personality-note">
                일간 오행에 따른 전통적 해석이며, 실제 성격을 단정하지 않아요.
              </p>
            </div>
            <dl className="pillars">
              {chart.pillars.map((item) => (
                <div key={item.label}>
                  <dt>{item.label}</dt>
                  <dd>{item.text}</dd>
                </div>
              ))}
            </dl>
            <p className="note">{chart.method}</p>
            <FiveElementsOverview elements={chart.elements} />
            <div className="interpret-action">
              <p>
                자세한 해석을 요청하면 계산된 사주 정보가 Gemini로 전달됩니다.
                생년월일과 출생시간 원문은 Gemini에 보내지 않습니다.
              </p>
              {!authUser && (
                <p>자세한 해석과 새 결과 저장은 Google 로그인 후 가능합니다.</p>
              )}
              <button
                type="button"
                onClick={handleInterpret}
                disabled={loading}
              >
                {loading
                  ? "해석을 가져오는 중..."
                  : !authUser
                    ? "Google 로그인 후 해석하기"
                  : interpretationError
                    ? "다시 시도"
                    : interpretation
                      ? "새 해석 받기"
                      : "자세히 해석하기"}
              </button>
            </div>
            {interpretationError && (
              <p className="error" role="alert">{interpretationError}</p>
            )}
            {interpretation && (
              <section className="interpretation" aria-label="자세한 사주 해석">
                <h3>자세한 사주 해석</h3>
                <div>
                  <h4>성향</h4>
                  <p>{interpretation.personality}</p>
                </div>
                <div>
                  <h4>강점</h4>
                  <p>{interpretation.strengths}</p>
                </div>
                <div>
                  <h4>주의점</h4>
                  <p>{interpretation.cautions}</p>
                </div>
                <div className="game-recommendation">
                  <h4>어울리는 로스트아크 직업</h4>
                  {recommendation ? (
                    <>
                      <p className="recommended-class">{recommendation.recommendedClass}</p>
                      <LostArkClassImage className={recommendation.recommendedClass} />
                      <p>{recommendation.recommendationReason}</p>
                      <p className="interpretation-note">
                        사주를 바탕으로 한 오락용 제안이며, 게임 실력이나 적성을 보장하지 않습니다.
                        로스트아크 공식 추천이 아닙니다.
                      </p>
                    </>
                  ) : (
                    <p>이전 기록에는 직업 추천이 없습니다.</p>
                  )}
                </div>
                <p className="interpretation-note">
                  전통적 사주 해석을 참고용으로 풀어쓴 내용이며, 실제 성격이나 미래를 확정하지 않습니다.
                </p>
              </section>
            )}
          </section>
        )}
        {storageNotice && <p className="storage-notice" role="status">{storageNotice}</p>}
      </div>
      {authUser && (
        <section className="saved-results account-results" aria-labelledby="account-results-title">
          <h2 id="account-results-title">내 계정에 저장된 결과</h2>
          <p className="history-note">새 해석은 계정에 저장되어 다른 기기에서도 볼 수 있습니다.</p>
          {accountError && <p className="error" role="alert">{accountError}</p>}
          {accountLoading && accountHistory.length === 0 && <p>계정 기록을 불러오는 중...</p>}
          {!accountLoading && accountHistory.length === 0 && !accountError && (
            <p className="history-empty">계정에 저장된 해석이 없습니다.</p>
          )}
          {accountHistory.length > 0 && (
            <ul className="history-list">
              {accountHistory.map((record) => (
                <li key={record.id}>
                  <span>{record.date} · {record.time} · {record.chart.pillars[2].korean}일주</span>
                  <div className="history-actions">
                    <button type="button" onClick={() => handleOpenAccount(record)}>다시 열기</button>
                    <button
                      type="button"
                      className="delete-button"
                      aria-label={`${record.date} ${record.time} 계정 결과 삭제`}
                      onClick={() => void handleDeleteAccount(record.id)}
                    >
                      삭제
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {accountCursor && (
            <button type="button" disabled={accountLoading} onClick={() => void loadAccountHistory(accountCursor)}>
              {accountLoading ? "불러오는 중..." : "더 보기"}
            </button>
          )}
          {accountError && (
            <button type="button" onClick={() => void loadAccountHistory(null)}>다시 불러오기</button>
          )}
        </section>
      )}
      <section className="saved-results" aria-labelledby="saved-results-title">
        <h2 id="saved-results-title">이 브라우저에만 저장된 이전 결과</h2>
        <p className="history-note">
          예전에 저장한 결과는 계정으로 자동 이전되지 않습니다. 같은 브라우저를 쓰는 사람도 볼 수 있어요.
        </p>
        {history.length === 0 ? (
          <p className="history-empty">저장된 해석이 없습니다.</p>
        ) : (
          <ul className="history-list">
            {history.map((record) => (
              <li key={record.id}>
                <span>{record.date} · {record.time} · {record.chart.pillars[2].korean}일주</span>
                <div className="history-actions">
                  <button type="button" onClick={() => handleOpenSaved(record)}>다시 열기</button>
                  <button
                    type="button"
                    className="delete-button"
                    aria-label={`${record.date} ${record.time} 결과 삭제`}
                    onClick={() => handleDeleteSaved(record.id)}
                  >
                    삭제
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
    </>
  );
}
