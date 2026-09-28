import { calculate, InputError, todayInKorea } from "../../../lib/saju/chart";
import { FORTUNE_VERSION, getDailyFortune, parseDailyFortune, type DailyFortune } from "../../../lib/saju/daily-fortune";
import { getResultsClient } from "../../../lib/supabase/results";

export const runtime = "nodejs";

const columns = "fortune_date, today_pillar, flow, action, caution, fortune_version";

function result(body: object, status: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function readStored(value: unknown, date: string): DailyFortune | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.fortune_version !== FORTUNE_VERSION) {
    // Older versions are still valid snapshots; reject only malformed versions.
    if (!Number.isInteger(row.fortune_version) || (row.fortune_version as number) < 1) return null;
  }
  const fortune = parseDailyFortune({
    date: row.fortune_date,
    todayPillar: row.today_pillar,
    flow: row.flow,
    action: row.action,
    caution: row.caution,
  });
  return fortune?.date === date ? fortune : null;
}

export async function POST(request: Request) {
  let source: Record<string, unknown>;
  try {
    if (Number(request.headers.get("content-length")) > 4096) {
      return result({ error: "입력 내용이 너무 깁니다." }, 413);
    }
    const text = await request.text();
    if (text.length > 4096) return result({ error: "입력 내용이 너무 깁니다." }, 413);
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    source = parsed as Record<string, unknown>;
  } catch {
    return result({ error: "입력 내용을 확인해 주세요." }, 400);
  }

  let chart;
  try {
    chart = calculate({
      date: source.date as string,
      time: source.time as string,
      calendar: "solar",
      topic: "general",
    });
  } catch (error) {
    return result({ error: error instanceof InputError ? error.message : "입력 내용을 확인해 주세요." }, 400);
  }

  let auth;
  try {
    auth = await getResultsClient();
  } catch {
    return result({ error: "로그인 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요." }, 503);
  }
  if (!auth) return result({ error: "오늘의 운세를 계정에 저장하려면 다시 로그인해 주세요." }, 401);

  const date = todayInKorea();
  const fortune = getDailyFortune(chart, date);
  const { supabase, userId } = auth;
  const findSaved = () => supabase
    .from("saju_daily_fortunes")
    .select(columns)
    .eq("user_id", userId)
    .eq("birth_date", source.date)
    .eq("birth_time", source.time)
    .eq("fortune_date", date)
    .maybeSingle();

  const { data: existing, error: lookupError } = await findSaved();
  if (lookupError) return result({ fortune, saved: false, error: "운세 저장 상태를 확인하지 못했습니다. 다시 시도해 주세요." }, 503);
  if (existing) {
    const stored = readStored(existing, date);
    if (!stored) return result({ fortune, saved: false, error: "저장된 운세를 읽을 수 없습니다. 다시 시도해 주세요." }, 503);
    return result({ fortune: stored, saved: true }, 200);
  }

  const { data: inserted, error: insertError } = await supabase
    .from("saju_daily_fortunes")
    .insert({
      user_id: userId,
      birth_date: source.date,
      birth_time: source.time,
      fortune_date: date,
      today_pillar: fortune.todayPillar,
      flow: fortune.flow,
      action: fortune.action,
      caution: fortune.caution,
      fortune_version: FORTUNE_VERSION,
    })
    .select(columns)
    .single();

  if (insertError?.code === "23505") {
    const { data: repeated, error: repeatedError } = await findSaved();
    const stored = !repeatedError && repeated ? readStored(repeated, date) : null;
    if (stored) return result({ fortune: stored, saved: true }, 200);
  }
  const stored = !insertError && inserted ? readStored(inserted, date) : null;
  if (!stored) return result({ fortune, saved: false, error: "오늘의 운세를 계정에 저장하지 못했습니다. 다시 시도해 주세요." }, 503);
  return result({ fortune: stored, saved: true }, 200);
}
