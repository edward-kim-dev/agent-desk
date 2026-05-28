import type { ITheme } from "@xterm/xterm";

/**
 * Light terminal theme for agent-desk.
 *
 * xterm.js default ANSI bright colours assume a dark background:
 *   brightWhite (#ffffff) and white (#e5e5e5) are completely or nearly
 *   invisible on our white (#ffffff) background.
 *
 * We remap those to warm grays that remain readable while preserving the
 * character of the original palette.  Other colours are left at xterm.js
 * defaults since they're already legible on white.
 */
export const TERMINAL_THEME: ITheme = {
  background: "#ffffff",
  foreground: "#1a1208",
  cursor: "#1a1208",
  cursorAccent: "#ffffff",
  selectionBackground: "rgba(26, 18, 8, 0.2)",

  // ANSI 7  (white)       — default #e5e5e5 → barely visible on white bg
  white: "#a09890",
  // ANSI 15 (brightWhite) — default #ffffff → completely invisible on white bg
  brightWhite: "#c8c0b8",

  // Bright yellow (#fce94f) and bright cyan (#34e2e2) are also hard to read
  // on white; darken them slightly.
  brightYellow: "#b08800",
  brightCyan: "#008fa8",
};
