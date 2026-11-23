import { Text, View } from "react-native";
import { Sprite, deviceCrispScale, officePalette, prop, tile } from "./pixel";
import { ROLES, type LobbyRole } from "./roles";
import { CharacterSprite } from "./sprites";
import { radius, space } from "./ui";

import { ART_THEMES } from "./art-themes";

const fixtures = ["desk", "chair", "plant", "sofa", "bookshelf", "readingLamp"] as const;
const people = Object.keys(ROLES) as LobbyRole[];

export function ArtPreview() {
  const scale = deviceCrispScale(2);
  return (
    <View style={{ gap: space.md }}>
      {ART_THEMES.map((theme, index) => (
        <View key={index} style={{ gap: space.sm, padding: space.md, borderRadius: radius.lg, backgroundColor: theme.colors.surface1 }}>
          <Text accessibilityRole="header" style={{ color: theme.colors.foreground, fontSize: 16, fontWeight: "600" }}>
            {index === 0 ? "Daylight palette" : "Dark palette"}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "flex-end", flexWrap: "wrap", gap: space.sm }}>
            {fixtures.map((fixture) => <Sprite key={fixture} sprite={prop(fixture)} palette={officePalette(theme)} scale={scale} />)}
            <Sprite sprite={tile("floorMosaic")} palette={officePalette(theme)} scale={scale} />
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {people.map((role) => (
              <View key={role} accessible accessibilityLabel={ROLES[role].title} style={{ alignItems: "center", width: 68 }}>
                <CharacterSprite theme={theme} agentId={role} tile={16 * scale} role={role} pose="stand" heading="down" />
                <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>{ROLES[role].title}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}
