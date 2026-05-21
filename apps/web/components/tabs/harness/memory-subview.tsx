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
      <aside className="overflow-y-auto border-r p-3 text-sm">
        <div className="font-semibold uppercase text-zinc-500">Files</div>
        <ul className="mt-2 flex flex-col gap-1 font-mono text-xs">
          {FILES.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
        <fieldset disabled className="mt-4 text-xs">
          <legend className="text-zinc-500">Source of truth</legend>
          {FILES.map((f, i) => (
            <label key={f} className="mt-1 flex items-center gap-2">
              <input type="radio" name="sot" defaultChecked={i === 0} />
              {f}
            </label>
          ))}
        </fieldset>
      </aside>
      <section className="flex flex-col p-3 text-sm">
        <div className="text-zinc-700 dark:text-zinc-300">
          CLAUDE.md ↔ AGENTS.md
        </div>
        <div className="mt-1 text-xs text-amber-700">⚠ {DUMMY_DIFFS.length} 불일치 항목</div>
        <ul className="mt-2 list-disc pl-5 text-xs text-zinc-600 dark:text-zinc-400">
          {DUMMY_DIFFS.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
        <div className="mt-4 flex gap-2">
          <button disabled className="rounded border px-3 py-1 text-xs">
            수동 편집
          </button>
          <button disabled className="rounded border px-3 py-1 text-xs">
            수정 세션 열기 → Terminal
          </button>
        </div>
        <div className="mt-6 rounded border border-dashed p-4 text-center text-xs text-zinc-500">
          diff view — coming in v0.3
        </div>
      </section>
    </div>
  );
}
