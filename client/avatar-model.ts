import type { AvatarConfig } from "../shared/avatar";
import { lookFor } from "./pixel/palette";

export function defaultAvatar(seed: string): AvatarConfig {
  const { skin, hair, hairStyle, shirt, pants, outfit = 0 } = lookFor(seed);
  return { version: 1, skin, hair, hairStyle, shirt, pants, outfit, accessory: "none", headgear: "role" };
}
