// Catches a screen that throws in the playground, shows the error where the
// screen was, and logs its JavaScript stack to logcat (ReactNativeJS), so a
// CI screenshot or log names the failing function.
import { Component } from "react";
import type { ReactNode } from "react";
import { ScrollView, Text } from "react-native";

interface State {
  readonly error: Error | null;
}

export class PlaygroundErrorBoundary extends Component<
  { readonly children: ReactNode },
  State
> {
  constructor(props: { readonly children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    // oxlint-disable-next-line no-console -- the playground's debug log.
    console.warn(`[playground] ${error.message}\n${error.stack ?? ""}`);

    return { error };
  }

  override render() {
    const { error } = this.state;

    if (error === null) {
      return this.props.children;
    }

    return (
      <ScrollView contentContainerClassName="gap-2 p-4">
        <Text className="text-destructive-foreground text-base font-semibold">
          {error.message}
        </Text>
        <Text className="text-muted-foreground font-mono text-xs">
          {error.stack}
        </Text>
      </ScrollView>
    );
  }
}
