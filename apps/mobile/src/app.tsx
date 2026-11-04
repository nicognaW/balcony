import { parsePlaygroundLink } from "@balcony/client/playground";
import type { PlaygroundLink } from "@balcony/client/playground";
// The app: the pairing screen until this phone is paired, then the session
// list with Transcripts pushed over it. The playground (long-press the
// pairing title, or a `balcony://playground` link) runs over either, and
// leaving it returns to them as they were.
import { PairedContext, connectTo } from "@balcony/client/react";
import type { Paired, PairedConnection } from "@balcony/client/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { Linking, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { pairByCode, pairWith, queryClient } from "./lib/connection.ts";
import {
  forgetToken,
  loadSavedServer,
  loadServerAddress,
} from "./lib/saved-server.ts";
import { PairedApp } from "./paired-app.tsx";
import { PlaygroundApp } from "./playground/playground.tsx";
import { linkTo, startPlayground } from "./playground/run.ts";
import type { PlaygroundRun } from "./playground/run.ts";
import { PairScreen } from "./screens/pair-screen.tsx";
import type { Pairing } from "./screens/pair-screen.tsx";

type Startup =
  | { readonly kind: "loading" }
  | {
      readonly kind: "ready";
      readonly paired: PairedConnection | null;
      readonly lastServer: string | null;
    };

const realPairing: Pairing = { withCode: pairByCode, withQr: pairWith };

/**
 * The playground run open over the app, if any: started by a
 * `balcony://playground` link (at launch or while running) or by `open`.
 * Each start is a fresh run; the one it replaces is closed.
 */
const usePlayground = () => {
  const [run, setRun] = useState<PlaygroundRun | null>(null);

  useEffect(() => {
    if (run === null) {
      return;
    }

    return () => run.playground.close();
  }, [run]);

  useEffect(() => {
    const openLink = (url: string | null | undefined) => {
      const link =
        url === null || url === undefined ? null : parsePlaygroundLink(url);

      if (link !== null) {
        setRun(startPlayground(link));
      }
    };

    void Linking.getInitialURL().then(openLink);

    const subscription = Linking.addEventListener("url", ({ url }) =>
      openLink(url)
    );

    return () => subscription.remove();
  }, []);

  return {
    close: () => setRun(null),
    open: (link: PlaygroundLink) => setRun(startPlayground(link)),
    run,
  };
};

/** The app as it was before the playground: pairing, or the paired list. */
const Home = ({
  lastServer,
  onPaired,
  onPlayground,
  paired,
  refused,
}: {
  readonly lastServer: string | null;
  readonly onPaired: (next: PairedConnection) => void;
  readonly onPlayground: () => void;
  readonly paired: Paired | null;
  readonly refused: boolean;
}) =>
  paired === null ? (
    <PairScreen
      lastServer={lastServer}
      onPaired={onPaired}
      onTitleLongPress={onPlayground}
      pairing={realPairing}
      refused={refused}
    />
  ) : (
    <QueryClientProvider client={queryClient}>
      <PairedContext value={paired}>
        <PairedApp />
      </PairedContext>
    </QueryClientProvider>
  );

const App = () => {
  const [startup, setStartup] = useState<Startup>({ kind: "loading" });
  const [refused, setRefused] = useState(false);
  const playground = usePlayground();

  useEffect(() => {
    void Promise.all([loadSavedServer(), loadServerAddress()]).then(
      ([saved, lastServer]) =>
        setStartup({
          kind: "ready",
          lastServer,
          paired: saved === null ? null : connectTo(saved),
        })
    );
  }, []);

  const paired = startup.kind === "ready" ? startup.paired : null;

  const value = useMemo(
    (): Paired | null =>
      paired === null
        ? null
        : {
            ...paired,
            unpair: (reason) => {
              paired.connection.close();
              void forgetToken();
              queryClient.clear();
              setRefused(reason === "refused");
              setStartup({
                kind: "ready",
                lastServer: paired.server,
                paired: null,
              });
            },
          },
    [paired]
  );

  return (
    <SafeAreaProvider>
      <StatusBar />
      {/* Hidden, not unmounted, under the playground: leaving it finds the
          app as it was, screens and live data included. */}
      <View className={playground.run === null ? "flex-1" : "hidden"}>
        {startup.kind === "loading" ? null : (
          <Home
            lastServer={startup.lastServer}
            onPaired={(next) => {
              setRefused(false);
              setStartup({
                kind: "ready",
                lastServer: next.server,
                paired: next,
              });
            }}
            onPlayground={() => playground.open(linkTo("busy-day"))}
            paired={value}
            refused={refused}
          />
        )}
      </View>
      {playground.run === null ? null : (
        <PlaygroundApp
          key={playground.run.id}
          onExit={() => playground.close()}
          onScenario={(id) => playground.open(linkTo(id))}
          run={playground.run}
        />
      )}
    </SafeAreaProvider>
  );
};

export default App;
