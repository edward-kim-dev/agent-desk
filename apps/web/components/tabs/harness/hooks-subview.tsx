"use client";

export function HooksSubview() {
  return (
    <div data-stub="true" className="p-3 text-sm">
      <table className="w-full">
        <thead className="border-b text-left text-xs uppercase text-zinc-500">
          <tr>
            <th scope="col" className="px-3 py-2">Event</th>
            <th scope="col" className="px-3 py-2">Matcher</th>
            <th scope="col" className="px-3 py-2">Command</th>
            <th scope="col" className="px-3 py-2">Source</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={4} className="px-3 py-6 text-center text-zinc-500">
              no hooks loaded — coming in v0.3
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
