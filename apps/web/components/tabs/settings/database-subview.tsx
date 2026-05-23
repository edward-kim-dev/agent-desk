"use client";

export function DatabaseSubview() {
  return (
    <div data-stub="true" className="grid h-full grid-cols-[14rem_1fr] gap-6 p-4 text-sm">
      <aside className="text-xs">
        <fieldset disabled>
          <legend className="opacity-55">Mode</legend>
          <label className="mt-1 flex items-center gap-2">
            <input type="radio" name="db-mode" defaultChecked /> Local SQLite
          </label>
          <label className="mt-1 flex items-center gap-2">
            <input type="radio" name="db-mode" /> Remote Postgres
          </label>
        </fieldset>
        <div className="mt-6 opacity-55">Migration</div>
        <button disabled className="mt-1 border border-[var(--hill-rule)] px-2 py-1 text-xs">
          Local → Remote Wizard
        </button>
        <ol className="mt-3 list-decimal pl-4 opacity-55">
          <li>snapshot</li>
          <li>restore on PG</li>
          <li>switch mode</li>
        </ol>
      </aside>
      <section className="flex flex-col gap-3 text-xs">
        <div>
          <div className="opacity-55">Current</div>
          <div className="font-mono">SQLite (local)</div>
          <div className="font-mono opacity-55">
            path: agent-desk/data/agent-desk.sqlite
          </div>
        </div>
        <fieldset disabled className="flex flex-col gap-2">
          <legend className="opacity-55">Remote connection (Postgres)</legend>
          <label className="flex items-center gap-2">
            <span className="w-20">host</span>
            <input
              aria-label="host"
              disabled
              className="border border-[var(--hill-rule)] px-2 py-1"
              placeholder="db.example.com"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-20">port</span>
            <input
              aria-label="port"
              disabled
              className="border border-[var(--hill-rule)] px-2 py-1"
              defaultValue="5432"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-20">database</span>
            <input
              aria-label="database"
              disabled
              className="border border-[var(--hill-rule)] px-2 py-1"
              placeholder="agent_desk"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-20">user</span>
            <input
              aria-label="user"
              disabled
              className="border border-[var(--hill-rule)] px-2 py-1"
              placeholder="agent_desk"
            />
          </label>
          <div className="flex items-center gap-2">
            <span className="w-20">password</span>
            <span className="opacity-55">
              .env (AGENT_DESK_DB_PASSWORD)
            </span>
          </div>
        </fieldset>
        <div className="flex gap-2">
          <button disabled className="border border-[var(--hill-rule)] px-3 py-1">
            Test connection
          </button>
          <button disabled className="border border-[var(--hill-rule)] px-3 py-1">
            Save
          </button>
        </div>
      </section>
    </div>
  );
}
