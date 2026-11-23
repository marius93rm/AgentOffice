import type { PluginTheme } from "@getpaseo/plugin";

export const ART_THEMES: readonly [PluginTheme, PluginTheme] = [
  { colors: { surface0: "#fffdf7", surface1: "#f4f0e7", surface2: "#e5ded2", foreground: "#211e27",
    foregroundMuted: "#5e5964", border: "#cfc6ba", accent: "#24685c", accentForeground: "#ffffff",
    statusWarning: "#a75a10", statusSuccess: "#286c53", statusDanger: "#a63546" } },
  { colors: { surface0: "#131820", surface1: "#202731", surface2: "#313b47", foreground: "#f1ede4",
    foregroundMuted: "#b2b9c2", border: "#566170", accent: "#72c9ba", accentForeground: "#17251e",
    statusWarning: "#f0bb6c", statusSuccess: "#80d0a8", statusDanger: "#ff8c93" } },
];
