import { calculate, InputError, type SajuInput } from "../../../lib/saju/chart";
import { isUuid, parseDatabaseResult } from "../../../lib/saju/db-history";
import { GEMINI_MODEL, GeminiError, interpretWithGemini } from "../../../lib/saju/gemini";
import { getResultsClient } from "../../../lib/supabase/results";

export const runtime = "nodejs";

function result(body: object, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    if (Number(request.headers.get("content-length")) > 4096) {
      return result({ error: "입력 내용이 너무 깁니다." }, 413);
    }
    const text = await request.text();
    if (text.length > 4096) return result({ error: "입력 내용이 너무 깁니다." }, 413);
    body = JSON.parse(text);
  } catch {
    return result({ error: "입력 내용을 확인해 주세요." }, 400);
  }

  const source = body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};
  const input: SajuInput = {
    date: source.date as string,
    time: source.time as string,
    calendar: "solar",
    topic: "general",
  };

  let chart;
  try {
    chart = calculate(input);
  } catch (error) {
    return result(
      { error: error instanceof InputError ? error.message : "입력 내용을 확인해 주세요." },
      400,
    );
  }

  if (!isUuid(source.request_id)) {
    return result({ error: "해석 요청 정보를 확인해 주세요. 다시 시도해 주세요." }, 400);
  }
  const requestId = source.request_id;

  let auth;
  try {
    auth = await getResultsClient();
  } catch {
    return result({ error: "로그인 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요." }, 503);
  }
  if (!auth) return result({ error: "자세한 해석을 보려면 다시 로그인해 주세요." }, 401);

  const { supabase, userId } = auth;
  const { data: existing, error: existingError } = await supabase
    .from("saju_interpretations")
    .select("id, created_at, birth_date, birth_time, chart, personality, strengths, cautions, recommended_class, recommendation_reason, compatible_types, model")
    .eq("user_id", userId)
    .eq("request_id", requestId)
    .maybeSingle();
  if (existingError) {
    return result({ error: "저장된 결과를 확인하지 못했습니다. 다시 시도해 주세요." }, 503);
  }
  if (existing) {
    const record = parseDatabaseResult(existing);
    if (!record) return result({ error: "저장된 결과를 읽을 수 없습니다. 다시 시도해 주세요." }, 503);
    return result({ interpretation: {
      ...record.interpretation,
      ...(record.recommendation ? {
        recommended_class: record.recommendation.recommendedClass,
        recommendation_reason: record.recommendation.recommendationReason,
      } : {}),
      ...(record.compatibleTypes ? { compatible_types: record.compatibleTypes } : {}),
    }, model: record.model, record }, 200);
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return result({ error: "Gemini API 키가 설정되지 않았습니다. 설정 후 다시 시도해 주세요." }, 503);
  }

  let interpretation;
  try {
    interpretation = await interpretWithGemini(chart, apiKey);
  } catch (error) {
    if (error instanceof GeminiError) {
      return result({ error: error.message }, error.status);
    }
    return result({ error: "해석을 가져오지 못했습니다. 다시 시도해 주세요." }, 502);
  }

  const { data: inserted, error: insertError } = await supabase
    .from("saju_interpretations")
    .insert({
      user_id: userId,
      request_id: requestId,
      birth_date: input.date,
      birth_time: input.time,
      chart,
      ...interpretation,
      model: GEMINI_MODEL,
    })
    .select("id, created_at, birth_date, birth_time, chart, personality, strengths, cautions, recommended_class, recommendation_reason, compatible_types, model")
    .single();

  if (insertError?.code === "23505") {
    const { data: repeated, error: repeatedError } = await supabase
      .from("saju_interpretations")
      .select("id, created_at, birth_date, birth_time, chart, personality, strengths, cautions, recommended_class, recommendation_reason, compatible_types, model")
      .eq("user_id", userId)
      .eq("request_id", requestId)
      .maybeSingle();
    const record = !repeatedError && repeated ? parseDatabaseResult(repeated) : null;
    if (record) return result({ interpretation: {
      ...record.interpretation,
      ...(record.recommendation ? {
        recommended_class: record.recommendation.recommendedClass,
        recommendation_reason: record.recommendation.recommendationReason,
      } : {}),
      ...(record.compatibleTypes ? { compatible_types: record.compatibleTypes } : {}),
    }, model: record.model, record }, 200);
  }
  const record = !insertError && inserted ? parseDatabaseResult(inserted) : null;
  if (!record) {
    return result({
      interpretation,
      model: GEMINI_MODEL,
      saved: false,
      error: "해석은 생성됐지만 계정에 저장하지 못했습니다. 다시 시도해 주세요.",
    }, 503);
  }
  return result({ interpretation: record.interpretation, model: record.model, record }, 200);
}
