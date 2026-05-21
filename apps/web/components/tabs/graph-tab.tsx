"use client";

const LAYERS = ["sources", "concepts", "entities", "decisions", "synthesis", "infra"];
const CLAIM_TYPES = ["source", "analysis", "unverified", "gap"];

export function GraphTab() {
  return (
    <div
      data-stub="true"
      className="grid h-full grid-cols-[16rem_1fr_18rem]"
    >
      <aside className="overflow-y-auto border-r p-3 text-xs">
        <div className="font-semibold uppercase text-zinc-500">Filters</div>
        <fieldset disabled className="mt-2 flex flex-col gap-1">
          <legend className="text-zinc-500">Layer</legend>
          {LAYERS.map((l) => (
            <label key={l} className="flex items-center gap-2">
              <input type="checkbox" defaultChecked />
              {l}
            </label>
          ))}
          <legend className="mt-3 text-zinc-500">Claim type</legend>
          {CLAIM_TYPES.map((c) => (
            <label key={c} className="flex items-center gap-2">
              <input type="checkbox" defaultChecked={c === "source"} />
              {c}
            </label>
          ))}
          <label className="mt-3 flex items-center gap-2">
            <input type="checkbox" /> broken only
          </label>
        </fieldset>
      </aside>
      <section className="flex flex-col">
        <div className="flex items-center gap-2 border-b px-3 py-2 text-xs">
          <label className="flex items-center gap-2">
            search
            <input
              aria-label="search"
              disabled
              placeholder="🔍 (coming in v0.3)"
              className="rounded border px-2 py-1"
            />
          </label>
          <span className="flex-1" />
          <label className="flex items-center gap-2">
            layout
            <select disabled className="rounded border px-2 py-1">
              <option>force</option>
            </select>
          </label>
          <button disabled className="rounded border px-2 py-1">
            reset
          </button>
        </div>
        <div className="grid flex-1 place-items-center">
          <div className="rounded border border-dashed p-6 text-center text-sm text-zinc-500">
            <svg width="160" height="100" viewBox="0 0 160 100" aria-hidden>
              <line x1="20" y1="50" x2="80" y2="20" stroke="currentColor" />
              <line x1="80" y1="20" x2="140" y2="50" stroke="currentColor" />
              <line x1="80" y1="20" x2="80" y2="80" stroke="currentColor" />
              <circle cx="20" cy="50" r="6" fill="currentColor" />
              <circle cx="80" cy="20" r="6" fill="currentColor" />
              <circle cx="140" cy="50" r="6" fill="currentColor" />
              <circle cx="80" cy="80" r="6" fill="currentColor" />
            </svg>
            <div className="mt-3">Graph rendering — coming in v0.3</div>
          </div>
        </div>
      </section>
      <aside className="overflow-y-auto border-l p-3 text-xs">
        <div className="font-semibold uppercase text-zinc-500">Selected node</div>
        <div className="mt-2 text-zinc-500">no selection</div>
      </aside>
    </div>
  );
}
