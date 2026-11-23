import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

const index = (length: number) => z.number().int().min(0).lt(length);
export const ACCESSORIES = ["none", "glasses", "pin", "scarf"] as const;
export const HEADGEAR = ["role", "none", "cap", "headset", "ears"] as const;

export const avatarConfig = z.object({
  version: z.literal(1),
  skin: index(5), hair: index(6), hairStyle: index(5),
  shirt: index(8), pants: index(3), outfit: index(4),
  accessory: z.enum(ACCESSORIES),
  headgear: z.enum(HEADGEAR),
});

export type AvatarConfig = z.output<typeof avatarConfig>;
export const avatarPreferences = defineSettings({
  id: "avatars", scope: "host", version: 1,
  schema: z.object({ avatars: z.record(z.string(), avatarConfig).default({}) }),
});
