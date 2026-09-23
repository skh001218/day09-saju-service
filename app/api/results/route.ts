import { parseDatabaseResult } from "../../../lib/saju/db-history";
import { getResultsClient } from "../../../lib/supabase/results";

export const runtime = "nodejs";

function result(body: object, status: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  let auth;
  try {
    auth = await getResultsClient();
  } catch {
    return result({ error: "로그인 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요." }, 503);
  }
  if (!auth) return result({ error: "저장된 결과를 보려면 다시 로그인해 주세요." }, 401);

  const cursor = new URL(request.url).searchParams.get("cursor");
  if (cursor !== null && (!/^\d{1,6}$/.test(cursor) || Number(cursor) > 100000)) {
    return result({ error: "목록 위치를 확인해 주세요." }, 400);
  }
  const offset = cursor ? Number(cursor) : 0;
  const { data, error } = await auth.supabase
    .from("saju_interpretations")
    .select("id, created_at, birth_date, birth_time, chart, personality, strengths, cautions, recommended_class, recommendation_reason, compatible_types, model")
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + 20);
  if (error) return result({ error: "계정 기록을 불러오지 못했습니다. 다시 시도해 주세요." }, 503);

  const page = data ?? [];
  const records = page.slice(0, 20).map(parseDatabaseResult).filter((item) => item !== null);
  return result({ records, nextCursor: page.length > 20 ? String(offset + 20) : null }, 200);
}
