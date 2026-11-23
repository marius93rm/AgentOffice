import type { PluginSurfaceProps, PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { CrewView } from "./crew-view";

export function CrewPanel(props: PluginWorkspacePanelProps) {
  return <CrewView key={props.host.id + "/" + props.workspaceId} {...props} scope={props.workspaceId} />;
}

export function CrewSurface(props: PluginSurfaceProps) {
  return <CrewView key={props.host.id} {...props} scope={null} />;
}
