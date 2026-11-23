import type { PluginClientContext } from "@getpaseo/plugin/client";

// Derive SDK types from the host-provided plugin API so a clean Git install
// does not need @getpaseo/client or its development dependencies on disk.
export type PaseoApi = PluginClientContext["paseo"];
export type PaseoAgent = Awaited<ReturnType<PaseoApi["agents"]["list"]>>["entries"][number]["agent"];
export type PaseoWorkspace = Awaited<ReturnType<PaseoApi["workspaces"]["list"]>>["entries"][number];
export type PaseoRequest = PaseoAgent["pendingPermissions"][number];
export type PaseoResponse = Parameters<ReturnType<PaseoApi["agents"]["ref"]>["respondToPermission"]>[0]["response"];

type Timeline = ReturnType<PaseoApi["agents"]["ref"]>["timeline"];
export type PaseoAgentTimelineEvent = Parameters<Parameters<Timeline["subscribe"]>[0]>[0];
