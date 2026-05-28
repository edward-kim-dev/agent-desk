"use client";

export function TerminalSubviewSwitch(props: {
  sessionsOpen: boolean;
  onToggleSessions: () => void;
}) {
  return (
    <nav aria-label="터미널 서브뷰" className="flex items-stretch gap-7">
      <button
        type="button"
        aria-pressed={props.sessionsOpen}
        aria-expanded={props.sessionsOpen}
        onClick={props.onToggleSessions}
        className={[
          "cursor-pointer bg-transparent",
          "text-[10px] uppercase tracking-[0.24em] text-[#1a1208]",
          "border-t-2 border-x-0 border-b-0 pt-2 pb-0 px-0",
          "flex items-center gap-1.5 transition-opacity",
          props.sessionsOpen
            ? "border-[#1a1208] opacity-100 font-semibold"
            : "border-transparent opacity-55 hover:opacity-100",
        ].join(" ")}
      >
        Sessions
        <Chevron direction={props.sessionsOpen ? "up" : "down"} />
      </button>
    </nav>
  );
}

function Chevron(props: { direction: "up" | "down" }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      width="10"
      height="10"
      className="flex-shrink-0"
    >
      <path
        d={props.direction === "up" ? "M3 10l5-5 5 5" : "M3 6l5 5 5-5"}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
