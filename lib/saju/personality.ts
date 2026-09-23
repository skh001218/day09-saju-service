const sentences = {
  목: "새로운 것을 배우고 차근차근 성장하는 성향으로 풀이해요.",
  화: "생각과 마음을 활발하게 표현하는 성향으로 풀이해요.",
  토: "차분하게 중심을 잡고 맡은 일을 꾸준히 이어가는 성향으로 풀이해요.",
  금: "기준을 세우고 일을 분명하게 정리하는 성향으로 풀이해요.",
  수: "상황을 살피고 유연하게 생각하는 성향으로 풀이해요.",
} as const;

export function getPersonalitySentence(element: string): string {
  if (!Object.hasOwn(sentences, element)) {
    throw new Error("지원하지 않는 일간 오행입니다.");
  }

  return sentences[element as keyof typeof sentences];
}
