import { calculate, InputError, todayInKorea } from "../../../lib/saju/chart";
import { getDailyFortune } from "../../../lib/saju/daily-fortune";
import { createAdminClient } from "../../../lib/supabase/admin";
import { getResultsClient } from "../../../lib/supabase/results";

export const runtime = "nodejs";

function result(body: object, status: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  let auth;
  try {
    auth = await getResultsClient();
  } catch {
    return result({ error: "로그인 서비스를 사용할 수 없습니다." }, 503);
  }
  if (!auth) return result({ error: "출생정보를 저장하려면 로그인해 주세요." }, 401);

  let input: { date?: unknown; time?: unknown };
  let chart;
  try {
    const body = await request.text();
    if (body.length > 1024) return result({ error: "입력 내용이 너무 깁니다." }, 413);
    input = JSON.parse(body);
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error();
    chart = calculate({ date: input.date as string, time: input.time as string, calendar: "solar", topic: "general" });
  } catch (error) {
    return result({ error: error instanceof InputError ? error.message : "입력 내용을 확인해 주세요." }, 400);
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return result({ error: "출생정보 저장 설정이 없습니다." }, 503);
  }

  const { error } = await admin.from("saju_profiles").upsert({
    user_id: auth.userId,
    birth_date: input.date as string,
    birth_time: input.time as string,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) return result({ error: "출생정보를 저장하지 못했습니다. 다시 시도해 주세요." }, 503);

  try {
    const fortune = getDailyFortune(chart, todayInKorea());
    const { error: fortuneError } = await admin.from("daily_fortunes").upsert({
      user_id: auth.userId,
      fortune_date: fortune.date,
      today_pillar: fortune.todayPillar,
      flow: fortune.flow,
      action: fortune.action,
      caution: fortune.caution,
      generated_at: new Date().toISOString(),
    }, { onConflict: "user_id,fortune_date" });
    if (fortuneError) throw new Error();
  } catch {
    return result({ saved: false, error: "오늘 운세를 계정에 저장하지 못했습니다. 다시 계산하면 재시도할 수 있어요." }, 503);
  }
  return result({ saved: true }, 200);
}
