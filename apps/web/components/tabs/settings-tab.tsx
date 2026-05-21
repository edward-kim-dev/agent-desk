"use client";
import { useState } from "react";
import {
  SettingsSubviewSwitch,
  type SettingsSubview,
} from "./settings/subview-switch";
import { GeneralSubview } from "./settings/general-subview";
import { DatabaseSubview } from "./settings/database-subview";
import { CliCatalogSubview } from "./settings/cli-catalog-subview";
import { AuthSubview } from "./settings/auth-subview";
import { AboutSubview } from "./settings/about-subview";

export function SettingsTab() {
  const [sub, setSub] = useState<SettingsSubview>("general");
  return (
    <div className="grid h-full grid-rows-[auto_1fr]">
      <SettingsSubviewSwitch value={sub} onChange={setSub} />
      <div className="min-h-0 overflow-y-auto">
        {sub === "general" && <GeneralSubview />}
        {sub === "database" && <DatabaseSubview />}
        {sub === "cli-catalog" && <CliCatalogSubview />}
        {sub === "auth" && <AuthSubview />}
        {sub === "about" && <AboutSubview />}
      </div>
    </div>
  );
}
