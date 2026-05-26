/**
 * 공통 버튼 스타일 — Tailwind className 상수.
 *
 * 컴포넌트 추상화 대신 className 만 공유. 호출부는 그대로 `<button>` 을 사용한다.
 * 크기 변형이 필요할 땐 `${btnGhost} px-2 py-1 text-[10px] ...` 처럼 덮어쓰면 된다.
 */

// `bg-*` 유틸리티가 변형마다 다르므로 base 에는 두지 않는다. 두 군데에 같이 두면
// Tailwind 생성 순서에 따라 transparent 가 솔리드를 덮어버리는 사례가 있었다.
const base =
  "cursor-pointer border px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] transition-colors disabled:cursor-not-allowed disabled:opacity-40";

/** 기본 보조 버튼 — 하이라인 outline, transparent bg, hover 시 옅은 fill */
export const btnGhost =
  `${base} bg-transparent border-[var(--hill-rule)] text-[#1a1208] hover:bg-[#1a1208]/[0.04]`;

/** 위험 보조 버튼 — 빨간 outline, transparent bg */
export const btnGhostDanger =
  `${base} bg-transparent border-red-700/50 text-red-700 hover:bg-red-700/[0.05]`;

/** 주 액션 — 솔리드 `#1a1208`, 흰 글자 */
export const btnPrimary =
  `${base} bg-[#1a1208] border-[#1a1208] text-white hover:bg-black ` +
  "disabled:bg-transparent disabled:border-[var(--hill-rule)] disabled:text-[#1a1208]/40";

/** 주 위험 액션 — 솔리드 빨간 */
export const btnPrimaryDanger =
  `${base} bg-red-700 border-red-700 text-white hover:bg-red-800`;
