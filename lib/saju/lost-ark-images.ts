import type { LostArkClass } from "./lost-ark-classes";

type ImageRegion = {
  src: string;
  sourceWidth: number;
  sourceHeight: number;
  viewBox: string;
};

const warrior = "/lost-ark/warrior.png";
const martialArtist = "/lost-ark/martial-artist.png";
const gunner = "/lost-ark/gunner.png";
const mage = "/lost-ark/mage.png";
const assassin = "/lost-ark/assassin.png";
const specialist = "/lost-ark/specialist.png";

// 생성된 원본 합성 이미지에서 제목과 직업명 띠를 제외하고 캐릭터 영역만 보여준다.
// 저장 기록에는 이미지 경로를 넣지 않는다. 과거 기록도 직업명으로 같은 이미지를 찾는다.
const WARRIOR_TOP = ["0 92 384 510", "384 92 384 510", "768 92 384 510", "1152 92 384 510"];
const WARRIOR_BOTTOM = ["0 667 512 511", "512 667 512 511", "1024 667 512 511"];
const THREE_TOP = ["0 92 512 510", "512 92 512 510", "1024 92 512 510"];
const THREE_BOTTOM = ["0 667 512 511", "512 667 512 511", "1024 667 512 511"];
const HUNTER_BOTTOM = ["256 667 512 511", "768 667 512 511"];
const FOUR_MAGE = ["0 92 611 640", "611 92 611 640", "0 799 611 642", "611 799 611 642"];
const FOUR_OTHER = ["0 92 612 639", "612 92 613 639", "0 798 612 642", "612 798 613 642"];

function region(src: string, sourceWidth: number, sourceHeight: number, viewBox: string): ImageRegion {
  return { src, sourceWidth, sourceHeight, viewBox };
}

export const LOST_ARK_CLASS_IMAGES: Record<LostArkClass, ImageRegion> = {
  버서커: region(warrior, 1536, 1244, WARRIOR_TOP[0]),
  디스트로이어: region(warrior, 1536, 1244, WARRIOR_TOP[1]),
  워로드: region(warrior, 1536, 1244, WARRIOR_TOP[2]),
  홀리나이트: region(warrior, 1536, 1244, WARRIOR_TOP[3]),
  슬레이어: region(warrior, 1536, 1244, WARRIOR_BOTTOM[0]),
  발키리: region(warrior, 1536, 1244, WARRIOR_BOTTOM[1]),
  가디언나이트: region(warrior, 1536, 1244, WARRIOR_BOTTOM[2]),
  배틀마스터: region(martialArtist, 1536, 1244, THREE_TOP[0]),
  인파이터: region(martialArtist, 1536, 1244, THREE_TOP[1]),
  기공사: region(martialArtist, 1536, 1244, THREE_TOP[2]),
  창술사: region(martialArtist, 1536, 1244, THREE_BOTTOM[0]),
  스트라이커: region(martialArtist, 1536, 1244, THREE_BOTTOM[1]),
  브레이커: region(martialArtist, 1536, 1244, THREE_BOTTOM[2]),
  데빌헌터: region(gunner, 1536, 1244, THREE_TOP[0]),
  블래스터: region(gunner, 1536, 1244, THREE_TOP[1]),
  호크아이: region(gunner, 1536, 1244, THREE_TOP[2]),
  스카우터: region(gunner, 1536, 1244, HUNTER_BOTTOM[0]),
  건슬링어: region(gunner, 1536, 1244, HUNTER_BOTTOM[1]),
  바드: region(mage, 1222, 1507, FOUR_MAGE[0]),
  서머너: region(mage, 1222, 1507, FOUR_MAGE[1]),
  아르카나: region(mage, 1222, 1507, FOUR_MAGE[2]),
  소서리스: region(mage, 1222, 1507, FOUR_MAGE[3]),
  블레이드: region(assassin, 1225, 1504, FOUR_OTHER[0]),
  데모닉: region(assassin, 1225, 1504, FOUR_OTHER[1]),
  리퍼: region(assassin, 1225, 1504, FOUR_OTHER[2]),
  소울이터: region(assassin, 1225, 1504, FOUR_OTHER[3]),
  도화가: region(specialist, 1225, 1504, FOUR_OTHER[0]),
  기상술사: region(specialist, 1225, 1504, FOUR_OTHER[1]),
  환수사: region(specialist, 1225, 1504, FOUR_OTHER[2]),
  차원술사: region(specialist, 1225, 1504, FOUR_OTHER[3]),
};

export function findLostArkClassImage(name: string): ImageRegion | null {
  return Object.prototype.hasOwnProperty.call(LOST_ARK_CLASS_IMAGES, name)
    ? LOST_ARK_CLASS_IMAGES[name as LostArkClass]
    : null;
}
