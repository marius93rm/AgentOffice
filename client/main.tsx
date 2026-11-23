import type { PluginSurfaceProps, PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { CrewView } from "./crew-view";
import { RenderErrorBoundary } from "./render-error";

export function CrewPanel(props: PluginWorkspacePanelProps) {
  return (
    <RenderErrorBoundary key={props.host.id + "/" + props.workspaceId}>
      <CrewView {...props} scope={props.workspaceId} />
    </RenderErrorBoundary>
  );
}

export function CrewSurface(props: PluginSurfaceProps) {
  return (
    <RenderErrorBoundary key={props.host.id}>
      <CrewView {...props} scope={null} />
    </RenderErrorBoundary>
  );
}
