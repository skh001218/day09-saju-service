export const ELEMENT_GENERATION_CYCLE = ["목", "화", "토", "금", "수"] as const;
export const ELEMENT_CONTROL_CYCLE = ["목", "토", "수", "화", "금"] as const;

export type ElementName = (typeof ELEMENT_GENERATION_CYCLE)[number];

export type ElementRelations = {
  self: ElementName;
  generates: ElementName;
  generatedBy: ElementName;
  controls: ElementName;
  controlledBy: ElementName;
};

export function getElementRelations(value: unknown): ElementRelations | null {
  const generationIndex = ELEMENT_GENERATION_CYCLE.findIndex((name) => name === value);
  if (generationIndex < 0) return null;

  const controlIndex = ELEMENT_CONTROL_CYCLE.findIndex((name) => name === value);
  const self = ELEMENT_GENERATION_CYCLE[generationIndex];
  return {
    self,
    generates: ELEMENT_GENERATION_CYCLE[(generationIndex + 1) % 5],
    generatedBy: ELEMENT_GENERATION_CYCLE[(generationIndex + 4) % 5],
    controls: ELEMENT_CONTROL_CYCLE[(controlIndex + 1) % 5],
    controlledBy: ELEMENT_CONTROL_CYCLE[(controlIndex + 4) % 5],
  };
}
