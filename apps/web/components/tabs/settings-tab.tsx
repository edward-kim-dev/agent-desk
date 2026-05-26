"use client";
import type { SettingsSubview } from "./settings/subview-switch";
import { GeneralSubview } from "./settings/general-subview";
import { WorkspacesSubview } from "./settings/workspaces-subview";
import { DatabaseSubview } from "./settings/database-subview";
import { CliCatalogSubview } from "./settings/cli-catalog-subview";
import { AuthSubview } from "./settings/auth-subview";
import { AboutSubview } from "./settings/about-subview";

export function SettingsTab(props: {
  subview: SettingsSubview;
  onWorkspacesChanged: () => void;
}) {
  return (
    <div className="h-full min-h-0 overflow-y-auto">
      {props.subview === "general" && <GeneralSubview />}
      {props.subview === "workspaces" && (
        <WorkspacesSubview onChanged={props.onWorkspacesChanged} />
      )}
      {props.subview === "database" && <DatabaseSubview />}
      {props.subview === "cli-catalog" && <CliCatalogSubview />}
      {props.subview === "auth" && <AuthSubview />}
      {props.subview === "about" && <AboutSubview />}
    </div>
  );
}
