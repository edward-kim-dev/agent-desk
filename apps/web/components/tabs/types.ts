export type TabKey =
  | "home"
  | "terminal"
  | "wiki"
  | "graph"
  | "harness"
  | "settings";

export const TAB_LABELS: Record<TabKey, string> = {
  home: "Home",
  terminal: "Terminal",
  wiki: "Wiki",
  graph: "Graph",
  harness: "Harness",
  settings: "Settings",
};

export const TAB_ORDER: TabKey[] = [
  "home",
  "terminal",
  "wiki",
  "graph",
  "harness",
  "settings",
];
