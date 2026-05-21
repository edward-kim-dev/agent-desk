"use client";
import { useState } from "react";
import { HarnessSubviewSwitch, type HarnessSubview } from "./harness/subview-switch";
import { MemorySubview } from "./harness/memory-subview";
import { HooksSubview } from "./harness/hooks-subview";
import { AgentsSubview } from "./harness/agents-subview";
import { AdaptersSubview } from "./harness/adapters-subview";

export function HarnessTab() {
  const [sub, setSub] = useState<HarnessSubview>("memory");
  return (
    <div className="grid h-full grid-rows-[auto_1fr]">
      <HarnessSubviewSwitch value={sub} onChange={setSub} />
      <div className="min-h-0">
        {sub === "memory" && <MemorySubview />}
        {sub === "hooks" && <HooksSubview />}
        {sub === "agents" && <AgentsSubview />}
        {sub === "adapters" && <AdaptersSubview />}
      </div>
    </div>
  );
}
