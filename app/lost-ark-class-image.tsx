import { findLostArkClassImage } from "../lib/saju/lost-ark-images";

type Props = { className: string };

export function LostArkClassImage({ className }: Props) {
  const image = findLostArkClassImage(className);
  if (!image) return null;

  return (
    <figure className="recommended-class-figure">
      <svg
        className="recommended-class-image"
        viewBox={image.viewBox}
        role="img"
        aria-label={`${className}를 표현한 생성 이미지`}
        preserveAspectRatio="xMidYMid meet"
      >
        <image href={image.src} width={image.sourceWidth} height={image.sourceHeight} />
      </svg>
      <figcaption>직업을 표현한 생성 이미지 · 로스트아크 공식 아트가 아닙니다.</figcaption>
    </figure>
  );
}
