import type { SajuChart } from "./chart";
import { GEMINI_MODEL, GeminiError } from "./gemini";
import { parseTopicTexts } from "./daily-topic-fortune";

type TopicTexts = { money: string; health: string; work: string };

export function makeDailyTopicPrompt(chart: SajuChart, date: string, todayPillar: string, retryIndex = 0, otherTopics: TopicTexts[] = []): string {
  const pillars = chart.pillars.map((item) => ({ label: item.label, korean: item.korean, stem: item.stem, branch: item.branch, stemElement: item.stemElement, branchElement: item.branchElement }));
  const retry = retryIndex ? "앞서 작성한 문구가 다른 출생 사주의 문구와 같았습니다. 각 항목의 관점과 구체적인 제안을 새로 바꾸세요.\n" : "";
  const avoid = otherTopics.length ? `다른 출생 사주에 이미 사용한 제안입니다. 아래 문구와 같은 행동·소재를 반복하지 말고 각 항목에서 다른 생활 제안을 선택하세요.\n${JSON.stringify(otherTopics.slice(0, 5))}\n` : "";
  return `당신은 전통 사주를 쉬운 한국어의 오락용 하루 안내로 풀어 씁니다. 아래 계산값만 참고하고 계산을 다시 하지 마세요.\n${JSON.stringify({ date, pillars, dayMaster: chart.dayMaster, elements: chart.elements, todayPillar })}\n각 항목은 출생 사주의 연·월·일·시 기둥과 오늘 일주를 함께 살펴 해당 사주에 맞는 다른 생활 제안을 만드세요. 입력과 무관한 공통 문구를 반복하지 마세요. 사주 조합을 문장에 기계적으로 나열하지 마세요.\n${avoid}${retry}금전운(money)은 구매 우선순위·구독 확인·지출 기록·예산 정리 중 이 사주에 맞는 가벼운 생활 제안 하나를, 건강운(health)은 수면·휴식·움직임·수분·주변 환경 중 하나를, 직장운(work)은 업무 순서·정리·협업·학습·소통 중 하나를 선택하세요. 모두가 같은 주제를 선택하거나 항상 지출 점검·차와 스트레칭·동료 소통을 반복하지 마세요. 각각 한국어 1~2문장으로 작성하세요. 직업 상태나 특정 직장을 추정하지 마세요. 수익률·투자 종목·대출 결정, 질병명·진단·치료·약 복용, 합격·승진·해고 예측, 길흉 점수, 불안을 주는 단정은 금지합니다. 각 항목은 공백 제거 후 10~300자입니다.`;
}

export async function generateDailyTopicFortune(
  chart: SajuChart,
  date: string,
  todayPillar: string,
  apiKey: string,
  fetcher: typeof fetch = fetch,
  retryIndex = 0,
  otherTopics: TopicTexts[] = [],
) {
  let response: Response;
  try {
    response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: makeDailyTopicPrompt(chart, date, todayPillar, retryIndex, otherTopics) }] }],
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
