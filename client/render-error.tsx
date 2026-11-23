import { Component, type ErrorInfo, type ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";

interface RenderErrorBoundaryProps {
  children: ReactNode;
}

interface RenderErrorBoundaryState {
  error: Error | null;
  componentStack: string;
}

/** Keeps a render failure inside the plugin surface and exposes the component path for diagnosis. */
export class RenderErrorBoundary extends Component<RenderErrorBoundaryProps, RenderErrorBoundaryState> {
  state: RenderErrorBoundaryState = { error: null, componentStack: "" };

  static getDerivedStateFromError(error: Error): Partial<RenderErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(_error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? "" });
  }

  render() {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 12, backgroundColor: "#101317" }}>
        <Text style={{ color: "#f1f3f5", fontSize: 18, fontWeight: "600" }}>Agent Lobby could not render.</Text>
        <Text selectable style={{ color: "#d3d8df", fontSize: 14, lineHeight: 20 }}>
          {error.message || error.name || "Unknown render error"}
        </Text>
        {componentStack ? (
          <ScrollView style={{ maxHeight: 280 }}>
            <Text selectable style={{ color: "#aeb7c2", fontFamily: "monospace", fontSize: 12, lineHeight: 18 }}>
              {componentStack.slice(0, 6000)}
            </Text>
          </ScrollView>
        ) : null}
      </View>
    );
  }
}
