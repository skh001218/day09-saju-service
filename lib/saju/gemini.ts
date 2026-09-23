import type { SajuChart } from "./chart";
import {
  makeInterpretationPrompt,
  parseRecommendedInterpretation,
  type RecommendedInterpretation,
} from "./interpretation";

export const GEMINI_MODEL = "gemini-3.5-flash-lite";

export class GeminiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export async function interpretWithGemini(
  chart: SajuChart,
  apiKey: string,
  fetcher: typeof fetch = fetch,
): Promise<RecommendedInterpretation> {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: makeInterpretationPrompt(chart) }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          personality: { type: "STRING" },
          strengths: { type: "STRING" },
          cautions: { type: "STRING" },
          recommended_class: { type: "STRING" },
          recommendation_reason: { type: "STRING" },
          compatible_types: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                element: { type: "STRING", enum: ["목", "화", "토", "금", "수"] },
                tendency: { type: "STRING" },
                reason: { type: "STRING" },
              },
              required: ["element", "tendency", "reason"],
            },
            minItems: 2,
            maxItems: 3,
          },
        },
        required: ["personality", "strengths", "cautions", "recommended_class", "recommendation_reason", "compatible_types"],
      },
    },
  });

  let response: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await fetcher(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body,
          signal: AbortSignal.timeout(25000),
          cache: "no-store",
        },
      );
    } catch {
      if (attempt === 2) {
        throw new GeminiError("Gemini 연결이 지연되거나 실패했습니다. 다시 시도해 주세요.", 504);
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      continue;
    }

    if (response.status !== 503 || attempt === 2) break;
    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
  }

  if (!response) {
    throw new GeminiError("Gemini 연결이 지연되거나 실패했습니다. 다시 시도해 주세요.", 504);
  }

  if (!response.ok) {
    console.warn("Gemini 요청 실패 상태:", response.status);
    if (response.status === 402) {
      throw new GeminiError("Gemini 계정의 사용 가능 잔액이 없습니다. Google AI Studio에서 결제 상태를 확인해 주세요.", 402);
    }
    if (response.status === 429) {
      throw new GeminiError("Gemini 사용량 제한에 도달했습니다. 잠시 후 다시 시도해 주세요.", 429);
    }
    if (response.status === 503) {
      throw new GeminiError("Gemini 서버가 잠시 바쁩니다. 잠시 후 다시 시도해 주세요.", 503);
    }
    throw new GeminiError("Gemini 해석을 가져오지 못했습니다. 다시 시도해 주세요.", 502);
  }

  try {
    const data: unknown = await response.json();
    const text = (
      data as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: unknown }> };
        }>;
      }
    )?.candidates?.[0]?.content?.parts?.find(
      (part) => typeof part.text === "string",
    )?.text;
    if (typeof text !== "string") throw new Error("빈 응답");
    return parseRecommendedInterpretation(JSON.parse(text));
  } catch {
    throw new GeminiError("Gemini 해석 형식이 올바르지 않습니다. 다시 시도해 주세요.", 502);
  }
}
