export type TabKey = "terminal" | "wiki" | "graph" | "harness" | "settings";

export const TAB_LABELS: Record<TabKey, string> = {
  terminal: "Terminal",
  wiki: "Wiki",
  graph: "Graph",
  harness: "Harness",
  settings: "Settings",
};

export const TAB_ORDER: TabKey[] = ["terminal", "wiki", "graph", "harness", "settings"];
