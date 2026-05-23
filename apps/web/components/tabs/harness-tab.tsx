"use client";
import type { HarnessSubview } from "./harness/subview-switch";
import { MemorySubview } from "./harness/memory-subview";
import { HooksSubview } from "./harness/hooks-subview";
import { AgentsSubview } from "./harness/agents-subview";
import { AdaptersSubview } from "./harness/adapters-subview";

export function HarnessTab(props: { subview: HarnessSubview }) {
  return (
    <div className="h-full min-h-0">
      {props.subview === "memory" && <MemorySubview />}
      {props.subview === "hooks" && <HooksSubview />}
      {props.subview === "agents" && <AgentsSubview />}
      {props.subview === "adapters" && <AdaptersSubview />}
    </div>
  );
}
