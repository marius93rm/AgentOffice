import type { PluginTheme } from "@getpaseo/plugin";
import { memo, useContext, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { Mover, MotionPaused, type Move } from "./motion";
import { canPetOccupy, petFloor, petHome, petOccupants, petPlan, type Pet, type PetStep } from "./pet-model";
import type { Presence, Room } from "./office-model";
import { CatSprite } from "./sprites";

export const RoomPet = memo(function RoomPet({ theme, room, tile, people, still }: {
  theme: PluginTheme;
  room: Room;
  tile: number;
  people: ReadonlyMap<string, Presence>;
  still: boolean;
}) {
  const hidden = useContext(MotionPaused);
  const floor = useMemo(() => petFloor(room), [room]);
  const home = useMemo(() => petHome(room, floor), [room, floor]);
  const [state, setState] = useState<{ pet: Pet; move: Move | null; at: number } | null>(() => home ? {
    pet: { species: "cat", roomId: room.workspaceId, at: home, pose: "sleeping", heading: "right" },
    move: null, at: Date.now() + 1600,
  } : null);
  const route = useRef<PetStep[]>([]);
  const turn = useRef(0);
  const current = useRef(people);
  current.current = people;

  useEffect(() => {
    if (still || hidden || !home || !state) return;
    const { pet } = state;
    const timer = setTimeout(() => {
      const occupants = petOccupants(room, current.current);
      if (route.current.length === 0) route.current = petPlan(room, floor, current.current, pet.at, ++turn.current);
      const step = route.current.shift();
      if (!step || !canPetOccupy(step, occupants)) {
        // If its return tile is occupied, the cat waits on its perch.
        const perched = !floor.has(`${Math.floor(pet.at.x)},${pet.at.y}`);
        route.current = step && perched ? [step, ...route.current] : [];
        setState({ ...state, at: Date.now() + 700 });
        return;
      }
      const moving = step.at.x !== pet.at.x || step.at.y !== pet.at.y;
      const move = { x: (step.at.x + 0.5) * tile, y: (step.at.y + 0.91) * tile, ms: moving ? step.ms : 0 };
      const heading = step.at.x === pet.at.x ? pet.heading : step.at.x < pet.at.x ? "left" : "right";
      setState({ pet: { ...pet, at: step.at, pose: step.pose, heading }, move, at: Date.now() + step.ms });
    }, Math.max(20, state.at - Date.now()));
    return () => clearTimeout(timer);
  }, [state, hidden, still, home, room, floor, tile]);
  const pet = state?.pet;
  const move = state?.move;
  const shown = still && home ? { at: home, heading: "right" as const, pose: "sleeping" as const } : pet;
  if (!shown) return null;
  const position = still || !move ? { x: (shown.at.x + 0.5) * tile, y: (shown.at.y + 0.91) * tile, ms: 0 } : move;
  return <Mover move={position} pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, zIndex: shown.at.y }}>
    <View accessible accessibilityLabel="Office cat">
      <CatSprite theme={theme} tile={tile} pose={shown.pose} heading={shown.heading} still={still || hidden} />
    </View>
  </Mover>;
});
