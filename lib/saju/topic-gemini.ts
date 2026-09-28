import type { SajuChart } from "./chart";
import { GEMINI_MODEL, GeminiError } from "./gemini";
import { parseTopicTexts } from "./daily-topic-fortune";

export function makeDailyTopicPrompt(chart: SajuChart, date: string, todayPillar: string): string {
  const pillars = chart.pillars.map((item) => ({ stem: item.stem, branch: item.branch, stemElement: item.stemElement, branchElement: item.branchElement }));
  return `당신은 전통 사주를 쉬운 한국어의 오락용 하루 안내로 풀어 씁니다. 아래 계산값만 참고하고 계산을 다시 하지 마세요.\n${JSON.stringify({ date, pillars, dayMaster: chart.dayMaster, elements: chart.elements, todayPillar })}\n금전운(money)은 지출 점검 등 가벼운 생활 제안, 건강운(health)은 휴식과 생활 습관의 일반적 제안, 직장운(work)은 누구나 읽을 수 있는 업무·협업의 일반적 제안을 각각 한국어 1~2문장으로 작성하세요. 직업 상태나 특정 직장을 추정하지 마세요. 수익률·투자 종목·대출 결정, 질병명·진단·치료·약 복용, 합격·승진·해고 예측, 길흉 점수, 불안을 주는 단정은 금지합니다. 각 항목은 공백 제거 후 10~300자입니다.`;
}

export async function generateDailyTopicFortune(
  chart: SajuChart,
  date: string,
  todayPillar: string,
  apiKey: string,
  fetcher: typeof fetch = fetch,
) {
  let response: Response;
  try {
    response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: makeDailyTopicPrompt(chart, date, todayPillar) }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: { money: { type: "STRING" }, health: { type: "STRING" }, work: { type: "STRING" } },
            required: ["money", "health", "work"],
          },
        },
      }),
      signal: AbortSignal.timeout(25000),
      cache: "no-store",
    });
  } catch {
    throw new GeminiError("주제별 운세 연결이 지연되거나 실패했습니다. 다시 시도해 주세요.", 504);
  }
  if (!response.ok) {
    if (response.status === 429) throw new GeminiError("Gemini 사용량 제한에 도달했습니다. 잠시 후 다시 시도해 주세요.", 429);
    throw new GeminiError("주제별 운세를 가져오지 못했습니다. 다시 시도해 주세요.", 502);
  }
  try {
    const data: unknown = await response.json();
    const parts = (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }> })?.candidates?.[0]?.content?.parts;
    const raw = parts?.find((part) => typeof part.text === "string")?.text;
    if (typeof raw !== "string") throw new Error();
    const texts = parseTopicTexts(JSON.parse(raw));
    if (!texts) throw new Error();
    return texts;
  } catch {
    throw new GeminiError("주제별 운세 응답 형식이 올바르지 않습니다. 다시 시도해 주세요.", 502);
  }
}
