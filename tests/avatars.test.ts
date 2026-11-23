import { expect, it } from "vitest";
import { ACCESSORIES, HEADGEAR, avatarConfig } from "../shared/avatar";
import { defaultAvatar } from "../client/avatar-model";
import { CHARACTER_FRAMES, character, type Facing } from "../client/pixel/characters";
import { normalizeRole, ROLES, type LobbyRole } from "../client/roles";

it("uses a repeatable versioned appearance and rejects corrupt persisted options", () => {
  expect(avatarConfig.parse(defaultAvatar("worker"))).toEqual(defaultAvatar("worker"));
  expect(avatarConfig.safeParse({ ...defaultAvatar("worker"), hair: 99 }).success).toBe(false);
  expect(normalizeRole(" Security_Reviewer ")).toBe("security");
  expect(normalizeRole("mystery")).toBe("agent");
});

it("draws every role and both avatar overlays through the walk and seat change", () => {
  const directions = ["down", "up", "left", "right"] as const satisfies readonly Facing[];
  for (const role of Object.keys(ROLES) as LobbyRole[]) {
    for (const accessory of ACCESSORIES) for (const headgear of HEADGEAR) {
      const look = { ...defaultAvatar(role + accessory), accessory, headgear };
      for (const facing of directions) for (const pose of ["walk", "settle", "sit"] as const) {
        for (let frame = 0; frame < CHARACTER_FRAMES[pose]; frame++) {
          const sprite = character({ role, look, facing, pose, frame });
          expect(sprite.anchor).toEqual({ x: 8, y: 24 });
          expect(sprite.pixels.some(Boolean)).toBe(true);
        }
      }
    }
  }
});
