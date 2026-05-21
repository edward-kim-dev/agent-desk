"use client";

export function GeneralSubview() {
  return (
    <div data-stub="true" className="flex flex-col gap-4 p-4 text-sm">
      <fieldset disabled>
        <legend className="text-xs uppercase text-zinc-500">Theme</legend>
        <div className="mt-2 flex gap-4 text-xs">
          {["auto", "light", "dark"].map((t, i) => (
            <label key={t} className="flex items-center gap-2">
              <input type="radio" name="theme" defaultChecked={i === 0} />
              {t}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="text-xs text-zinc-500">About agent-desk v0.2</div>
    </div>
  );
}
