import { timingSafeEqual } from "node:crypto";
import { calculate, todayInKorea } from "../../../../lib/saju/chart";
import { getDailyFortune } from "../../../../lib/saju/daily-fortune";
import { createAdminClient } from "../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

const PAGE_SIZE = 100;

function result(body: object, status: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function authorized(header: string | null, secret: string): boolean {
  const actual = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || cronSecret.length < 16) {
    return result({ error: "예약 작업 설정이 없습니다." }, 503);
  }
  if (!authorized(request.headers.get("authorization"), cronSecret)) {
    return result({ error: "인증되지 않은 요청입니다." }, 401);
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return result({ error: "데이터베이스 설정이 없습니다." }, 503);
  }
  const date = todayInKorea();
  let cursor = "";
  let saved = 0;

  while (true) {
    let query = admin.from("saju_profiles")
      .select("user_id, birth_date, birth_time")
      .order("user_id", { ascending: true })
      .limit(PAGE_SIZE);
    if (cursor) query = query.gt("user_id", cursor);
    const { data: profiles, error } = await query;
    if (error || !profiles) return result({ error: "프로필 목록을 가져오지 못했습니다.", saved }, 503);
    if (profiles.length === 0) break;

    const rows = [];
    for (const profile of profiles) {
      try {
        const chart = calculate({
          date: profile.birth_date,
          time: String(profile.birth_time).slice(0, 5),
          calendar: "solar",
          topic: "general",
        });
        const fortune = getDailyFortune(chart, date);
        rows.push({
          user_id: profile.user_id,
          fortune_date: date,
          today_pillar: fortune.todayPillar,
          flow: fortune.flow,
          action: fortune.action,
          caution: fortune.caution,
          generated_at: new Date().toISOString(),
        });
      } catch {
        return result({ error: "저장된 출생정보로 운세를 계산하지 못했습니다.", saved }, 503);
      }
    }

    const written = await admin.from("daily_fortunes").upsert(rows, {
      onConflict: "user_id,fortune_date",
    });
    if (written.error) return result({ error: "운세를 저장하지 못했습니다.", saved }, 503);
    saved += rows.length;
    cursor = profiles[profiles.length - 1].user_id;
    if (profiles.length < PAGE_SIZE) break;
  }

  return result({ date, saved }, 200);
}
