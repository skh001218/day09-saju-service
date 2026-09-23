import { getElementRelations, type ElementName } from "../lib/saju/element-relations";
import styles from "./five-elements-relations.module.css";

const nodes: { name: ElementName; x: number; y: number; fill: string; text: string }[] = [
  { name: "목", x: 250, y: 60, fill: "#83e5c2", text: "#102b26" },
  { name: "화", x: 430, y: 185, fill: "#ff874f", text: "#342018" },
  { name: "토", x: 360, y: 390, fill: "#f9d65c", text: "#342a10" },
  { name: "금", x: 140, y: 390, fill: "#e8edf2", text: "#27313f" },
  { name: "수", x: 70, y: 185, fill: "#293b62", text: "#fff" },
];

const generationPaths = [
  "M 291 70 Q 371 84 405 145", // 목 → 화
  "M 442 226 Q 453 302 389 359", // 화 → 토
  "M 320 411 Q 250 452 180 411", // 토 → 금
  "M 111 360 Q 47 301 58 226", // 금 → 수
  "M 95 146 Q 129 84 209 70", // 수 → 목
];

const controlPaths = [
  "M 264 101 L 343 347", // 목 → 토
  "M 324 366 L 109 208", // 토 → 수
  "M 113 185 L 387 185", // 수 → 화
  "M 393 215 L 179 366", // 화 → 금
  "M 157 347 L 236 101", // 금 → 목
];

export default function FiveElementsRelations({ element }: { element: unknown }) {
  const relations = getElementRelations(element);

  return (
    <section className={styles.section} aria-labelledby="five-elements-relations-title">
      <h3 id="five-elements-relations-title">내 오행과 상생·상극</h3>
      {relations ? (
        <>
          <p className={styles.intro}>
            내 오행 유형: <strong>{relations.self}</strong> <span>(태어난 날의 일간 기준)</span>
          </p>
          <svg
            className={styles.diagram}
            viewBox="0 0 500 460"
            role="img"
            aria-labelledby="five-elements-diagram-title five-elements-diagram-description"
          >
            <title id="five-elements-diagram-title">내 오행 {relations.self} 유형을 강조한 오행 상생·상극 그림</title>
            <desc id="five-elements-diagram-description">
              진한 바깥 화살표는 목 화 토 금 수 순서의 상생, 속이 빈 안쪽 화살표는 목 토 수 화 금 순서의 상극을 나타냅니다.
            </desc>
            <defs>
              <marker id="generation-arrow" markerWidth="11" markerHeight="11" refX="9" refY="5.5" orient="auto" markerUnits="userSpaceOnUse">
                <path d="M 0 0 L 10 5.5 L 0 11 Z" fill="#1f2937" />
              </marker>
              <marker id="control-arrow" markerWidth="11" markerHeight="11" refX="9" refY="5.5" orient="auto" markerUnits="userSpaceOnUse">
                <path d="M 1 1 L 10 5.5 L 1 10 Z" fill="#fff" stroke="#59616d" strokeWidth="1.4" />
              </marker>
            </defs>
            {generationPaths.map((path) => (
              <path key={path} d={path} fill="none" stroke="#1f2937" strokeWidth="5" strokeLinecap="round" markerEnd="url(#generation-arrow)" />
            ))}
            {controlPaths.map((path) => (
              <path key={path} d={path} fill="none" stroke="#59616d" strokeWidth="2.5" markerEnd="url(#control-arrow)" />
            ))}
            {nodes.map(({ name, x, y, fill, text }) => {
              const isMine = name === relations.self;
              return (
                <g key={name}>
                  {isMine && <circle cx={x} cy={y} r="51" fill="none" stroke="#171a2b" strokeWidth="5" />}
                  <circle cx={x} cy={y} r="43" fill={fill} stroke="#263342" strokeWidth="1.5" />
                  <text x={x} y={y + 13} textAnchor="middle" fill={text} fontSize="38" fontWeight="700">{name}</text>
                  {isMine && <text x={x} y={y + 33} textAnchor="middle" fill={text} fontSize="15" fontWeight="700">나</text>}
                </g>
              );
            })}
          </svg>
          <div className={styles.legend} aria-label="화살표 범례">
            <span><i className={styles.generationArrow} aria-hidden="true" />상생 · 돕는 흐름</span>
            <span><i className={styles.controlArrow} aria-hidden="true" />상극 · 견제하는 흐름</span>
          </div>
          <div className={styles.cycles}>
            <p><strong>상생</strong> 목 → 화 → 토 → 금 → 수 → 목</p>
            <p><strong>상극</strong> 목 → 토 → 수 → 화 → 금 → 목</p>
          </div>
          <dl className={styles.relations}>
            <div><dt>나를 돕는 오행</dt><dd>{relations.generatedBy}</dd></div>
            <div><dt>내가 돕는 오행</dt><dd>{relations.generates}</dd></div>
            <div><dt>나를 견제하는 오행</dt><dd>{relations.controlledBy}</dd></div>
            <div><dt>내가 견제하는 오행</dt><dd>{relations.controls}</dd></div>
          </dl>
          <p className={styles.note}>전통적인 오행의 흐름을 그린 참고 자료예요. 실제 사람의 성격이나 두 사람의 궁합을 단정하지 않아요.</p>
        </>
      ) : (
        <p className={styles.note}>일간 오행을 확인할 수 없어 상생·상극 그림을 표시할 수 없습니다.</p>
      )}
    </section>
  );
}
