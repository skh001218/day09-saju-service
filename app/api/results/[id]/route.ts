import { isUuid } from "../../../../lib/saju/db-history";
import { getResultsClient } from "../../../../lib/supabase/results";

export const runtime = "nodejs";

function result(body: object, status: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let auth;
  try {
    auth = await getResultsClient();
  } catch {
    return result({ error: "로그인 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요." }, 503);
  }
  if (!auth) return result({ error: "기록을 삭제하려면 다시 로그인해 주세요." }, 401);

  const { id } = await context.params;
  if (!isUuid(id)) return result({ error: "기록을 찾을 수 없습니다." }, 404);
  const { data, error } = await auth.supabase
    .from("saju_interpretations")
    .delete()
    .eq("user_id", auth.userId)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return result({ error: "기록을 삭제하지 못했습니다. 다시 시도해 주세요." }, 503);
  if (!data) return result({ error: "기록을 찾을 수 없습니다." }, 404);
  return result({ deleted: true }, 200);
}
