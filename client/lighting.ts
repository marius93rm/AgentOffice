import type { LightingMode } from "../shared/preferences";

export type RoomLight = "day" | "night" | "theme";

export function officeLight(mode: LightingMode, now: number, effects: boolean): { light: RoomLight; next: number | null } {
  if (!effects) return { light: "theme", next: null };
  if (mode !== "auto") return { light: mode, next: null };
  const at = new Date(now);
  const hour = at.getHours();
  const day = hour >= 7 && hour < 19;
  if (hour >= 19) at.setDate(at.getDate() + 1);
  at.setHours(day ? 19 : 7, 0, 0, 0);
  return { light: day ? "day" : "night", next: at.getTime() };
}
