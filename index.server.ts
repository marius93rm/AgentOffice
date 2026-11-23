import type { PluginServerContext } from "@getpaseo/plugin/server";
import { avatarPreferences } from "./shared/avatar";
import { lobbyPreferences } from "./shared/preferences";
import { registerInbox } from "./server/inbox";

export default function contribute(server: PluginServerContext) {
  server.registerSettings(avatarPreferences);
  server.registerSettings(lobbyPreferences);
  return registerInbox(server);
}
