/**
 * Halftone — sondaven 스타일 WebGL halftone dither 모듈
 *
 * 한 캔버스에 여러 오브젝트(이미지/영상/텍스트)를 sondaven 방식의
 * fragment shader 로 합성합니다.
 */

export type ObjectType = "image" | "video" | "text";

/** sondaven 셰이더 uniform 1:1 대응 */
export interface ObjectConfig {
  /** 캔버스 내 위치/크기 — 숫자는 px, 문자열은 % 또는 vw 지원 */
  x?: string | number;
  y?: string | number;
  width?: string | number;
  height?: string | number;

  /** 격자 가로 셀 수 */
  xSquares?: number;
  /** 격자 세로 셀 수 — 미지정 시 영역 비율에서 역산 */
  ySquares?: number;

  /** 막대 최소/최대 폭 — 셀폭 % 또는 px. 음수, 100% 초과 가능 */
  minSquareWidth?: string | number;
  maxSquareWidth?: string | number;

  /** 밝기 임계값 (0~255). 초과 시 bg로 처리 */
  threshold?: number;
  /** 감마 보정. 1.0 이 비활성 */
  gamma?: number;
  /** 레벨 리매핑 — 0~255 */
  blackPoint?: number;
  /** 레벨 리매핑 — 0~255. blackPoint > whitePoint 면 명도 반전 */
  whitePoint?: number;

  /** 막대 외부 픽셀의 불투명도 */
  bgOpacity?: number;
  /** 막대 픽셀의 불투명도 */
  fillOpacity?: number;
}

export interface TextOptions {
  /** 폰트 패밀리 */
  family?: string;
  /** 폰트 크기 (px) */
  size?: number;
  /** 폰트 두께 (CSS font-weight) */
  weight?: number | string;
  /** 자간 (em) */
  letterSpacing?: number;
  /** 글자 색 (hex) */
  color?: string;
  /** 배경 색 (hex) — 'transparent' 가능 */
  background?: string;
  /** 좌우 여백 (px) */
  paddingX?: number;
  /** 상하 여백 (px) */
  paddingY?: number;
}

export interface SceneObject {
  /** 디버그용 이름 — 캡션·로깅에 사용 */
  name?: string;
  type: ObjectType;
  /** image / video 용 경로 */
  src?: string;
  /** type='text' 일 때 텍스트 내용 */
  text?: string;
  /** type='text' 일 때 텍스트 스타일 */
  textOptions?: TextOptions;
  config: ObjectConfig;
}

export interface HalftoneOptions {
  /** 그릴 오브젝트 목록 — 배열 순서대로 그려지며 나중일수록 앞쪽 */
  objects: SceneObject[];
  /** 캔버스 가로/세로 비율 — width / height */
  aspectRatio?: number;
  /** 모든 오브젝트의 기본 config 를 덮어쓰기 */
  defaultConfig?: ObjectConfig;
  /** 막대 색 hex 또는 [r,g,b] (0~1) */
  fillColor?: string | [number, number, number];
  /** 배경 색 hex 또는 [r,g,b] */
  bgColor?: string | [number, number, number];
  /** 인접 셀 침식 반경 — 0~3. 기본 2 (5×5) */
  neighborRadius?: number;
  /** DPR 상한 — sondaven 기본 1.5 */
  dprCap?: number;
  /** 로드 완료 콜백 */
  onReady?: () => void;
  /** 모든 로드 실패 콜백 */
  onError?: (err: Error) => void;
}

/** 외부에서 인스턴스 제어용 */
export interface HalftoneHandle {
  /** 오브젝트 config 를 부분 업데이트 — 다음 프레임부터 반영 */
  setConfig(nameOrIndex: string | number, patch: Partial<ObjectConfig>): void;
  /** 현재 오브젝트 config 읽기 */
  getConfig(nameOrIndex: string | number): ObjectConfig | undefined;
  /** 렌더 일시정지 / 재개 */
  pause(): void;
  resume(): void;
  /** WebGL 컨텍스트·텍스처·영상 해제 */
  destroy(): void;
}
