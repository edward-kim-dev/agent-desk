# DESIGN.md

agent-desk 의 디자인 시스템 및 시각 요소 가이드. 참조 사이트: [sondaven.com](https://sondaven.com).

---

## Halftone Dither

브랜드의 핵심 시각 요소. 이미지·영상을 WebGL fragment shader 로 후처리하여
세로 막대(halftone bar) 패턴으로 표현한다. sondaven 의 셰이더를 1:1 복제했다.

### 어디서 쓰는가

| 위치 | 컴포넌트 | 용도 |
|---|---|---|
| Home 탭 | `HalftoneScene` | meadow · tree · cloud 3-layer 합성 hero |
| (향후) 로딩·랜딩·서브뷰 시각 요소 | `HalftoneScene` | 풍경·인물 합성 |

### 기본 원칙

1. **시각적 노이즈가 아니라 정보의 일부.** 모션이 끊임없이 흐르므로 사용자의 작업 시야를
   가리는 곳(터미널·에디터)에는 사용하지 않는다.
2. **막대 색은 `#1a1208`(가까운 검정), 배경은 화면 배경색을 그대로 통과.** `bgOpacity = 0`
   으로 막대 사이는 투명하게 두어 페이지 색이 비치게 한다.
3. **격자 셀 수는 의미가 있다.** 굵은 막대(낮은 cols) = 인상, 가는 막대(높은 cols) = 디테일.
   풍경은 100~150, 작은 동물은 180+.
4. **막대 폭은 `-2% ~ 102%`.** 음수에서 자연스럽게 사라지고 100% 초과에서 합쳐진다.
   이 값은 손대지 않는다.

### 색 토큰

```
fill          #1a1208     halftone 막대
background    transparent 또는 페이지 배경 (현재 흰색)
text-onlight  #1a1208     일반 본문
text-muted    rgba(26,18,8,0.55) ~ 0.7
border-soft   rgba(26,18,8,0.10 ~ 0.15)   → --hill-rule
```

### 타이포그래피

- 본문: system sans (`-apple-system, BlinkMacSystemFont, "Segoe UI", Inter`) 300~400, line-height 1.6~1.7
- 캡션/메타: 500~600, **uppercase**, letter-spacing 0.22~0.24em, 10~11px
- 헤드라인: 300, letter-spacing -0.025em, `clamp(32px, 4.6vw, 64px)`
- 코드/숫자: `ui-monospace`, 11.5~13px. 터미널은 D2Coding Ligature 13px

---

## 모듈 구조

```
apps/web/lib/halftone/                  순수 TypeScript (React 비의존)
├── types.ts        ObjectConfig, SceneObject, HalftoneOptions
├── shader.ts       VERT_SRC + buildFragSrc(neighborRadius)
├── text.ts         makeTextCanvas — type:'text' 오브젝트용 (현재 호출부 없음)
├── presets.ts      PRESETS.{image,mountain,cloud,tree,sheep,bird,text}
├── core.ts         Halftone — WebGL 엔진, 다중 오브젝트 합성
└── index.ts        public API

apps/web/components/halftone/           React 래퍼
├── halftone-scene.tsx   범용 씬
└── index.ts

apps/web/public/assets/halftone/        에셋 (sondaven 출처)
├── meadow.webp      풀밭 (Home Hero 배경)
├── cloud.mp4        구름
└── tree.mp4         소나무
```

### API 한눈에

```tsx
import { HalftoneScene } from "@/components/halftone";
import { PRESETS } from "@/lib/halftone";

<HalftoneScene
  aspectRatio={2.2}
  objects={[
    { type: "image", src: "/assets/halftone/meadow.webp",
      config: { ...PRESETS.image, x: 0, y: "35%", width: "100%", height: "65%" } },
    { type: "video", src: "/assets/halftone/tree.mp4",
      config: { ...PRESETS.tree, x: "76%", y: "10%", width: "20%", height: "60%" } },
    { type: "video", src: "/assets/halftone/cloud.mp4",
      config: { ...PRESETS.cloud, x: "14%", y: "4%", width: "40%", height: "54%" } },
  ]}
/>
```

---

## 셰이더 핵심 설정

| 파라미터 | 의미 | 기본 |
|---|---|---|
| `xSquares` | 가로 셀 수 | 100 (preset 별) |
| `ySquares` | 세로 셀 수 | 영역 비율에서 자동 |
| `minSquareWidth` | 막대 최소 폭 (셀 % 또는 px) | `-2%` |
| `maxSquareWidth` | 막대 최대 폭 | `102%` |
| `blackPoint` | 레벨 리매핑 하한 (0~255) | 0 |
| `whitePoint` | 상한 (0~255), 반전 가능 | 255 |
| `threshold` | bg 컷오프 (0~255) | 255 (컷오프 없음) |
| `bgOpacity` | 막대 외 픽셀 알파 | 0 (투명) |
| `fillOpacity` | 막대 알파 | 1 |
| `neighborRadius` | 인접 셀 침식 반경 (5×5=2) | 2 |
| `dprCap` | DPR 상한 | 1.5 (sondaven 그대로) |

### Preset 값 (sondaven 의 실제 hero 씬에서 추출)

| Preset | xSq | blackPoint | whitePoint | 비고 |
|---|---|---|---|---|
| `image` | 140 | 10 | 225 | 일반 이미지 |
| `mountain` | 120 | 25 | 200 | 부드러운 원경 |
| `cloud` | 100 | 25 | 255 | 부드러운 그래디언트 |
| `tree` | 150 | 55 | 175 | 좁은 범위 → 고대비 |
| `sheep` | 180 | 15 | 255 | 미세 디테일 |
| `bird` | 120 | **255** | **0** | **명도 반전** (밝은 새 → 막대) |
| `text` | 200 | 0 | 255 | 로고용 (현재 미사용) |

### 다중 오브젝트 합성 규칙

- 한 캔버스 위에 N개 오브젝트를 같은 셰이더로 그리며, `u_bounds` 사각형으로 클리핑한다.
- **배열 순서가 z-order**. 늦게 그린 오브젝트가 앞쪽에 보인다.
- 권장 순서: 베이스 이미지 → 원경 산 → 중경(나무·집) → 근경(동물) → 하늘 요소(구름·새).

---

## 에셋 출처

현재 에셋은 모두 [sondaven.com](https://sondaven.com) 의 CDN 에서 가져왔다. 상용 배포
전에는 **자체 촬영/제작 에셋으로 교체** 필요. 파일명·역할은 유지하면 코드 변경 없이
대체 가능하다.

### 새 에셋을 만들 때의 권장 가이드

- **영상**: 1080p, MP4 (H.264), 5~8초 루프, 알파 채널 없이 **어두운 피사체 + 밝은 배경**.
  검정 영역(`rgb < 0.01`)은 셰이더가 자동 discard.
- **이미지**: AVIF/WebP, **흰 배경 + 어두운 피사체**. 알파 채널 사용 시 `tc.a < 0.01` 도 discard.
- **새 같은 반전 표현**이 필요한 경우: `blackPoint:255, whitePoint:0` 으로 명도 반전.

---

## 접근성

- 데코용 `<canvas>` 는 의미 없는 그림. `<figure>` 안에 두고 `<figcaption>` 으로 의미 부여.
- WebGL 미지원 환경에서는 모듈이 throw 하므로 호출부에서 fallback (단순 텍스트) 처리.

## 성능

- WebGL 컨텍스트는 인스턴스마다 별도. 한 페이지에 5개 이상 동시 사용 금지 권장.
- 영상 텍스처는 매 프레임 `texSubImage2D` 업로드. 영상이 화면 밖일 땐 컴포넌트를
  unmount 하거나 `pause()` 호출로 GPU 부하 차단.
- `ResizeObserver` 가 부모 폭 변화에 반응하여 자동 재계산.

## 향후

- [ ] 스크롤 트리거 기반 패럴랙스 (GSAP ScrollTrigger 도입 시점에 합의)
- [ ] 자체 제작 에셋으로 sondaven 출처 영상 교체
- [ ] WebGL2 / 인스턴싱으로 다수 오브젝트 단일-호출 최적화
