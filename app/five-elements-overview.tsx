import { getElementOverview } from "../lib/saju/elements-overview";
import styles from "./five-elements-overview.module.css";

export default function FiveElementsOverview({ elements }: { elements: unknown }) {
  const overview = getElementOverview(elements);

  return (
    <section className={styles.overview} aria-labelledby="five-elements-title">
      <h3 id="five-elements-title">오행 살펴보기</h3>
      {overview ? (
        <>
          <p className={styles.intro}>
            일간은 태어난 날의 천간 한 글자이고, 아래 개수는 네 기둥의 대표 오행 여덟 글자를 센 값입니다.
          </p>
          <dl className={styles.list}>
            {overview.map(({ name, meaning, count }) => (
              <div className={styles.item} key={name}>
                <dt>{name}</dt>
                <dd className={styles.count}>{count}개</dd>
                <dd className={styles.meaning}>{meaning}</dd>
              </div>
            ))}
          </dl>
          <p className={styles.caution}>
            이 숫자는 사주 글자 8개의 대표 오행을 단순히 센 값입니다. 계절의 영향이나 숨은 오행(지장간)은 반영하지 않아, 오행의 강약·부족함이나 실제 성격을 단정할 수 없습니다.
          </p>
        </>
      ) : (
        <p className={styles.caution}>오행 개수를 표시할 수 없습니다.</p>
      )}
    </section>
  );
}
