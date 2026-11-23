import type { PluginTheme } from "@getpaseo/plugin";
import { useMemo, useState } from "react";
import { View } from "react-native";
import type { RoomSetting } from "../shared/preferences";
import type { RoomLight } from "./lighting";
import { buildForest, groupByWorkspace } from "./model";
import { layoutOffice } from "./office-model";
import type { PaseoAgent } from "./paseo-types";
import { sceneActor } from "./replay-model";
import { deviceCrispScale, TILE } from "./pixel";
import { ChairSprite, DeskSprite, FrameBackdrop, RoomBackdrop } from "./sprites";
import { radius } from "./ui";

export function RoomPreview({ theme, id, settings, light }: { theme: PluginTheme; id: string; settings: RoomSetting; light: RoomLight }) {
  const [width, setWidth] = useState(0);
  const office = useMemo(() => {
    const samples: PaseoAgent[] = Array.from({ length: 3 }, (_, index) => sceneActor({
      actor: { id: `preview${index}`, title: "Preview", workspaceId: id, role: "agent", createdAt: `2026-01-0${index + 1}T09:00:00.000Z` },
      at: Date.UTC(2026, 0, 4), state: "working",
    })!);
    return layoutOffice(groupByWorkspace(buildForest(samples, id), new Map()), { width: 18, preferences: { [id]: settings } });
  }, [id, settings]);
  const tile = deviceCrispScale(Math.min(width / (office.width * TILE), 166 / (office.height * TILE)), "down") * TILE;
  return <View accessible accessibilityRole="image" accessibilityLabel="Room design preview"
    onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}
    style={{ overflow: "hidden", borderRadius: radius.md, minHeight: 94, backgroundColor: theme.colors.surface0, alignItems: "center", justifyContent: "center" }}>
    {width > 0 ? <View style={{ width: office.width * tile, height: office.height * tile }}>
      {office.rooms.map((room) => <RoomBackdrop key={room.workspaceId} theme={theme} tile={tile} room={room} light={light} />)}
      {office.building ? <FrameBackdrop theme={theme} tile={tile} rooms={office.rooms} depth={office.building.depth} /> : null}
      {[...office.desks.values()].map((desk) => <View key={desk.agentId} style={{ position: "absolute", left: desk.cell.x * tile, top: desk.cell.y * tile }}>
        <View style={{ position: "absolute", left: tile / 2, top: tile }}><ChairSprite theme={theme} tile={tile} /></View>
        <DeskSprite theme={theme} tile={tile} screen="on" />
      </View>)}
    </View> : null}
  </View>;
}
