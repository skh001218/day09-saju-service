import { calculate, InputError, todayInKorea } from "../../../lib/saju/chart";
import { TOPIC_FORTUNE_VERSION, parseDailyTopicFortune, type DailyTopicFortune } from "../../../lib/saju/daily-topic-fortune";
import { GEMINI_MODEL, GeminiError } from "../../../lib/saju/gemini";
import { generateDailyTopicFortune } from "../../../lib/saju/topic-gemini";
import { getResultsClient } from "../../../lib/supabase/results";

export const runtime = "nodejs";
const columns = "fortune_date, today_pillar, money, health, work, fortune_version, model";

function result(body: object, status: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function readStored(value: unknown, date: string, pillar: string): DailyTopicFortune | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (!Number.isInteger(row.fortune_version) || (row.fortune_version as number) < 1 ||
    typeof row.model !== "string" || !row.model.trim()) return null;
  const parsed = parseDailyTopicFortune({ date: row.fortune_date, todayPillar: row.today_pillar, money: row.money, health: row.health, work: row.work });
  return parsed?.date === date && parsed.todayPillar === pillar ? parsed : null;
}

export async function POST(request: Request) {
  let source: Record<string, unknown>;
  try {
    if (Number(request.headers.get("content-length")) > 4096) return result({ error: "입력 내용이 너무 깁니다." }, 413);
    const raw = await request.text();
    if (raw.length > 4096) return result({ error: "입력 내용이 너무 깁니다." }, 413);
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    source = value as Record<string, unknown>;
  } catch {
    return result({ error: "입력 내용을 확인해 주세요." }, 400);
  }

  let chart;
  try {
    chart = calculate({ date: source.date as string, time: source.time as string, calendar: "solar", topic: "general" });
  } catch (error) {
    return result({ error: error instanceof InputError ? error.message : "입력 내용을 확인해 주세요." }, 400);
  }

  let auth;
  try { auth = await getResultsClient(); }
  catch { return result({ error: "로그인 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요." }, 503); }
  if (!auth) return result({ error: "주제별 운세를 보려면 다시 로그인해 주세요." }, 401);
  const { supabase, userId } = auth;
  const { data: reading, error: readingError } = await supabase.from("saju_interpretations")
    .select("id").eq("user_id", userId).eq("birth_date", source.date).eq("birth_time", source.time).limit(1).maybeSingle();
  if (readingError) return result({ error: "계정 해석 기록을 확인하지 못했습니다. 다시 시도해 주세요." }, 503);
  if (!reading) return result({ error: "먼저 자세한 해석을 계정에 저장해 주세요." }, 403);

  const date = todayInKorea();
  const todayPillar = calculate({ date, time: "12:00", calendar: "solar", topic: "general" }).pillars[2].text;
  const findSaved = () => supabase.from("saju_daily_topic_fortunes").select(columns)
    .eq("user_id", userId).eq("birth_date", source.date).eq("birth_time", source.time).eq("fortune_date", date).maybeSingle();
  const { data: existing, error: lookupError } = await findSaved();
  if (lookupError) return result({ error: "주제별 운세 저장 상태를 확인하지 못했습니다. 다시 시도해 주세요." }, 503);
  if (existing) {
    const saved = readStored(existing, date, todayPillar);
    if (!saved) return result({ error: "저장된 주제별 운세를 읽을 수 없습니다. 다시 시도해 주세요." }, 503);
    return result({ fortune: saved, saved: true }, 200);
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return result({ error: "Gemini API 키가 설정되지 않았습니다. 설정 후 다시 시도해 주세요." }, 503);
  let fortune: DailyTopicFortune;
  try {
    const texts = await generateDailyTopicFortune(chart, date, todayPillar, apiKey);
    fortune = { date, todayPillar, ...texts };
  } catch (error) {
    return result({ error: error instanceof GeminiError ? error.message : "주제별 운세를 가져오지 못했습니다. 다시 시도해 주세요." }, error instanceof GeminiError ? error.status : 502);
  }

  const { data: inserted, error: insertError } = await supabase.from("saju_daily_topic_fortunes")
    .insert({ user_id: userId, birth_date: source.date, birth_time: source.time,
      fortune_date: date, today_pillar: todayPillar, money: fortune.money, health: fortune.health,
      work: fortune.work, fortune_version: TOPIC_FORTUNE_VERSION, model: GEMINI_MODEL })
    .select(columns).single();
  if (insertError?.code === "23505") {
    const { data: repeated, error: repeatedError } = await findSaved();
    if (repeatedError || !repeated) return result({ error: "저장된 주제별 운세를 확인하지 못했습니다. 다시 시도해 주세요." }, 503);
    const saved = readStored(repeated, date, todayPillar);
    if (!saved) return result({ error: "저장된 주제별 운세를 읽을 수 없습니다. 다시 시도해 주세요." }, 503);
    return result({ fortune: saved, saved: true }, 200);
  }
  const saved = !insertError && inserted ? readStored(inserted, date, todayPillar) : null;
  if (!saved) return result({ fortune, saved: false, error: "주제별 운세를 계정에 저장하지 못했습니다. 다시 시도해 주세요." }, 503);
  return result({ fortune: saved, saved: true }, 200);
}
