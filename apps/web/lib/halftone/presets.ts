import type { ObjectConfig } from "./types";

/**
 * sondaven.com 의 실제 hero 씬에서 사용하는 blackPoint / whitePoint 값을
 * 오브젝트 타입별로 미리 묶어둡니다.
 *
 * 사용 예:
 *   { ...PRESETS.cloud, x:'5%', y:'10%', width:'50%', height:'30%' }
 */
export const PRESETS = {
  /** 일반 이미지 — 풀밭, 헤이 등 */
  image: {
    xSquares: 140,
    minSquareWidth: "-2%",
    maxSquareWidth: "102%",
    threshold: 255,
    gamma: 1.0,
    blackPoint: 10,
    whitePoint: 225,
    bgOpacity: 0,
    fillOpacity: 1,
  } satisfies ObjectConfig,

  /** 원경 산 — 부드러운 그래디언트 */
  mountain: {
    xSquares: 120,
    minSquareWidth: "-2%",
    maxSquareWidth: "102%",
    threshold: 255,
    gamma: 1.0,
    blackPoint: 25,
    whitePoint: 200,
    bgOpacity: 0,
    fillOpacity: 1,
  } satisfies ObjectConfig,

  /** 구름 — 부드러운 명도, 어두운 영역 강조 */
  cloud: {
    xSquares: 100,
    minSquareWidth: "-2%",
    maxSquareWidth: "102%",
    threshold: 255,
    gamma: 1.0,
    blackPoint: 25,
    whitePoint: 255,
    bgOpacity: 0,
    fillOpacity: 1,
  } satisfies ObjectConfig,

  /** 소나무 등 디테일한 실루엣 — 좁은 범위로 고대비 */
  tree: {
    xSquares: 150,
    minSquareWidth: "-2%",
    maxSquareWidth: "102%",
    threshold: 255,
    gamma: 1.0,
    blackPoint: 55,
    whitePoint: 175,
    bgOpacity: 0,
    fillOpacity: 1,
  } satisfies ObjectConfig,

  /** 양·작은 동물 — 미세한 움직임 표현 */
  sheep: {
    xSquares: 180,
    minSquareWidth: "-2%",
    maxSquareWidth: "102%",
    threshold: 255,
    gamma: 1.0,
    blackPoint: 15,
    whitePoint: 255,
    bgOpacity: 0,
    fillOpacity: 1,
  } satisfies ObjectConfig,

  /** 새 — 명도 반전 (밝은 새 → 막대) */
  bird: {
    xSquares: 120,
    minSquareWidth: "-2%",
    maxSquareWidth: "102%",
    threshold: 255,
    gamma: 1.0,
    blackPoint: 255,
    whitePoint: 0,
    bgOpacity: 0,
    fillOpacity: 1,
  } satisfies ObjectConfig,

  /** 텍스트 — 로고용. 흰 배경 + 검정 글자 가정 */
  text: {
    xSquares: 200,
    minSquareWidth: "-2%",
    maxSquareWidth: "102%",
    threshold: 235,
    gamma: 1.0,
    blackPoint: 0,
    whitePoint: 255,
    bgOpacity: 0,
    fillOpacity: 1,
  } satisfies ObjectConfig,
} as const;

export type PresetName = keyof typeof PRESETS;
