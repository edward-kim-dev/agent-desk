"use client";

const FILES = ["CLAUDE.md", "AGENTS.md", "GEMINI.md"];
const DUMMY_DIFFS = [
  "L23: 메모리 규칙 문구 차이",
  "L41: 훅 소개 순서",
  "L78: 어댑터 설정 키 차이",
  "L102: 위키 참조 경로",
  "L150: 종결 안내 톤",
];

export function MemorySubview() {
  return (
    <div data-stub="true" className="grid h-full grid-cols-[16rem_1fr]">
      <aside className="overflow-y-auto border-r border-[var(--hill-rule)] p-3 text-sm">
        <div className="font-semibold uppercase opacity-55">Files</div>
        <ul className="mt-2 flex flex-col gap-1 font-mono text-xs">
          {FILES.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
        <fieldset disabled className="mt-4 text-xs">
          <legend className="opacity-55">Source of truth</legend>
          {FILES.map((f, i) => (
            <label key={f} className="mt-1 flex items-center gap-2">
              <input type="radio" name="sot" defaultChecked={i === 0} />
              {f}
            </label>
          ))}
        </fieldset>
      </aside>
      <section className="flex flex-col p-3 text-sm">
        <div className="opacity-75">
          CLAUDE.md ↔ AGENTS.md
        </div>
        <div className="mt-1 text-xs text-amber-700">⚠ {DUMMY_DIFFS.length} 불일치 항목</div>
        <ul className="mt-2 list-disc pl-5 text-xs opacity-65">
          {DUMMY_DIFFS.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
        <div className="mt-4 flex gap-2">
          <button disabled className="border border-[var(--hill-rule)] px-3 py-1 text-xs">
            수동 편집
          </button>
          <button disabled className="border border-[var(--hill-rule)] px-3 py-1 text-xs">
            수정 세션 열기 → Terminal
          </button>
        </div>
        <div className="mt-6 border border-dashed border-[var(--hill-rule)] p-4 text-center text-xs opacity-55">
          diff view — coming in v0.3
        </div>
      </section>
    </div>
  );
}
