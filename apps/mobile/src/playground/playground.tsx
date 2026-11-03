// Playground mode: the real screens against the in-process fake server from
// @balcony/client/playground, with no Balcony server. A banner at the bottom
// names the scenario and leads to the controls and out. The app's own
// pairing and query cache are left as they were.
import type { ConnectionState } from "@balcony/client";
import { pairingOutcome } from "@balcony/client";
import { scenarios } from "@balcony/client/playground";
import type {
  Playground,
  PlaygroundConnectionState,
  Scenario,
  ScenarioId,
} from "@balcony/client/playground";
import {
  PairedContext,
  orpcOf,
  useConnectionState,
} from "@balcony/client/react";
import type { Paired, PairedConnection } from "@balcony/client/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { CheckIcon, XIcon } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";

import { Icon } from "../components/icon.tsx";
import { PairedApp } from "../paired-app.tsx";
import { PairScreen } from "../screens/pair-screen.tsx";
import type { Pairing } from "../screens/pair-screen.tsx";
import type { PlaygroundRun } from "./run.ts";

const SafeArea = withUniwind(SafeAreaView);
const InsetArea = withUniwind(SafeAreaProvider);

const CONNECTIONS: readonly {
  readonly state: PlaygroundConnectionState;
  readonly label: string;
}[] = [
  { label: "Connected", state: "connected" },
  { label: "Connecting", state: "connecting" },
  { label: "Reconnecting", state: "reconnecting" },
  { label: "Refused", state: "refused" },
];

/** The scenarios by the panel's groups, in order. */
const GROUPS = new Map<Scenario["group"], Scenario[]>([
  ["Data", []],
  ["Connection", []],
  ["Pairing", []],
]);

for (const scenario of scenarios) {
  GROUPS.get(scenario.group)?.push(scenario);
}

const Chip = ({
  label,
  onPress,
  selected,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly selected: boolean;
}) => (
  <Pressable
    accessibilityRole="radio"
    accessibilityState={{ selected }}
    className={`rounded-full border px-3 py-1.5 active:opacity-70 ${selected ? "bg-primary border-primary" : "border-border bg-card"}`}
    onPress={onPress}
  >
    <Text
      className={`text-xs font-medium ${selected ? "text-primary-foreground" : "text-foreground"}`}
    >
      {label}
    </Text>
  </Pressable>
);

const ActionButton = ({
  disabled = false,
  label,
  onPress,
}: {
  readonly disabled?: boolean;
  readonly label: string;
  readonly onPress: () => void;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityState={{ disabled }}
    className="border-border bg-card min-h-10 flex-1 items-center justify-center rounded-lg border px-3 active:opacity-70 disabled:opacity-40"
    disabled={disabled}
    onPress={onPress}
  >
    <Text className="text-foreground text-center text-sm font-medium">
      {label}
    </Text>
  </Pressable>
);

const SectionTitle = ({ children }: { readonly children: string }) => (
  <Text className="text-muted-foreground text-xs font-medium uppercase">
    {children}
  </Text>
);

const ScenarioOption = ({
  onPress,
  scenario,
  selected,
}: {
  readonly onPress: () => void;
  readonly scenario: Scenario;
  readonly selected: boolean;
}) => (
  <Pressable
    accessibilityRole="radio"
    accessibilityState={{ selected }}
    className={`flex-row items-start gap-3 rounded-lg border p-3 active:opacity-70 ${selected ? "border-primary bg-card" : "border-border bg-card"}`}
    onPress={onPress}
  >
    <View className="min-w-0 flex-1 gap-0.5">
      <Text className="text-foreground text-sm font-medium">
        {scenario.label}
      </Text>
      <Text className="text-muted-foreground text-xs">
        {scenario.description}
      </Text>
    </View>
    <View className="size-5 shrink-0 items-center justify-center">
      {selected ? (
        <Icon icon={CheckIcon} size={16} tone="info-foreground" />
      ) : null}
    </View>
  </Pressable>
);

const Panel = ({
  onClose,
  onExit,
  onScenario,
  playground,
  visible,
}: {
  readonly onClose: () => void;
  readonly onExit: () => void;
  readonly onScenario: (id: ScenarioId) => void;
  readonly playground: Playground;
  readonly visible: boolean;
}) => {
  const [connection, setConnection] = useState(playground.getConnection);
  const hasSessions = playground.getSessions().length > 0;

  // The fake's connection also changes by itself (pairing accepts a token).
  useEffect(
    () => playground.subscribe(() => setConnection(playground.getConnection())),
    [playground]
  );

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <SafeAreaProvider>
        <SafeArea className="bg-background flex-1">
          <View className="border-border flex-row items-center border-b px-4 py-3">
            <Text
              accessibilityRole="header"
              className="text-foreground flex-1 text-lg font-semibold"
            >
              Playground
            </Text>
            <Pressable
              accessibilityLabel="Close the controls"
              accessibilityRole="button"
              className="size-9 items-center justify-center rounded-full active:opacity-60"
              hitSlop={8}
              onPress={onClose}
            >
              <Icon icon={XIcon} size={20} tone="foreground" />
            </Pressable>
          </View>
          <ScrollView contentContainerClassName="gap-5 p-4">
            <Text className="text-muted-foreground text-sm">
              Every screen runs against built-in data. Nothing here reaches your
              Mac or changes your pairing.
            </Text>
            <View className="gap-2">
              <SectionTitle>Connection</SectionTitle>
              <View className="flex-row flex-wrap gap-2">
                {CONNECTIONS.map((option) => (
                  <Chip
                    key={option.state}
                    label={option.label}
                    onPress={() => playground.setConnection(option.state)}
                    selected={connection === option.state}
                  />
                ))}
              </View>
            </View>
            <View className="gap-2">
              <SectionTitle>Live</SectionTitle>
              <View className="flex-row gap-2">
                <ActionButton
                  disabled={!hasSessions}
                  label="Append to Transcript"
                  onPress={() => playground.append()}
                />
                <ActionButton
                  disabled={!hasSessions}
                  label="Change status"
                  onPress={() => playground.toggleStatus()}
                />
              </View>
            </View>
            {[...GROUPS].map(([group, members]) => (
              <View className="gap-2" key={group}>
                <SectionTitle>{group}</SectionTitle>
                {members.map((scenario) => (
                  <ScenarioOption
                    key={scenario.id}
                    onPress={() => onScenario(scenario.id)}
                    scenario={scenario}
                    selected={scenario.id === playground.scenario.id}
                  />
                ))}
              </View>
            ))}
            <Pressable
              accessibilityRole="button"
              className="bg-primary h-11 items-center justify-center rounded-lg active:opacity-80"
              onPress={onExit}
            >
              <Text className="text-primary-foreground text-sm font-medium">
                Exit playground
              </Text>
            </Pressable>
          </ScrollView>
        </SafeArea>
      </SafeAreaProvider>
    </Modal>
  );
};

const STATE_LABELS: Record<ConnectionState, string> = {
  connected: "",
  connecting: " · connecting",
  reconnecting: " · reconnecting",
};

/** Always on screen while in the playground: what it is, and the way out. */
const Banner = ({
  onControls,
  onExit,
  playground,
}: {
  readonly onControls: () => void;
  readonly onExit: () => void;
  readonly playground: Playground;
}) => {
  const state = useConnectionState(playground);

  return (
    <SafeArea
      className="bg-foreground flex-row items-center gap-1 px-3 py-1.5"
      edges={["bottom", "left", "right"]}
    >
      <Pressable
        accessibilityHint="Opens the playground's controls"
        accessibilityRole="button"
        className="min-w-0 flex-1 py-1.5 active:opacity-70"
        onPress={onControls}
      >
        <Text className="text-background text-xs" numberOfLines={1}>
          <Text className="font-semibold">Playground</Text>
          {` · ${playground.scenario.label}${STATE_LABELS[state]}`}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        className="shrink-0 rounded-md px-2.5 py-1.5 active:opacity-70"
        hitSlop={4}
        onPress={onControls}
      >
        <Text className="text-background text-xs font-medium">Controls</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="Exit playground"
        accessibilityRole="button"
        className="bg-background shrink-0 rounded-md px-2.5 py-1.5 active:opacity-70"
        hitSlop={4}
        onPress={onExit}
      >
        <Text className="text-foreground text-xs font-medium">Exit</Text>
      </Pressable>
    </SafeArea>
  );
};

/** The pairing screen, when shown: null shows the paired screens. */
type PairingShown = { readonly refused: boolean } | null;

const openingPairing = (run: PlaygroundRun): PairingShown =>
  run.screen === "pair" ? { refused: false } : null;

/**
 * The playground's screens for one run. Key it by the run's id: a new run
 * starts over at its opening screen.
 */
export const PlaygroundApp = ({
  onExit,
  onScenario,
  run,
}: {
  readonly onExit: () => void;
  readonly onScenario: (id: ScenarioId) => void;
  readonly run: PlaygroundRun;
}) => {
  const { playground, queryClient } = run;
  // Unset until the user changes them, so they start as the link asked.
  const [pairingChoice, setPairingChoice] = useState<PairingShown>();
  const [panelChoice, setPanelChoice] = useState<boolean>();

  const pairing =
    pairingChoice === undefined ? openingPairing(run) : pairingChoice;

  const panelOpen = panelChoice ?? run.screen === "panel";

  const connected = useMemo(
    (): PairedConnection => ({
      connection: playground,
      orpc: orpcOf(playground),
      server: playground.scenario.server,
    }),
    [playground]
  );

  const paired = useMemo(
    (): Paired => ({
      ...connected,
      unpair: (reason) => {
        queryClient.clear();
        setPairingChoice({ refused: reason === "refused" });
      },
    }),
    [connected, queryClient]
  );

  const fakePairing = useMemo(
    (): Pairing => ({
      withCode: async (_server, code) => {
        const outcome = await pairingOutcome(
          playground.client.pairing.exchange({ code })
        );

        return "refusal" in outcome ? outcome : { paired: connected };
      },
      withQr: () => {
        playground.setConnection("connected");

        return Promise.resolve(connected);
      },
    }),
    [connected, playground]
  );

  return (
    <View className="bg-background flex-1">
      {/* Its own insets: the banner takes the bottom one. */}
      <InsetArea className="flex-1">
        {pairing === null ? (
          <QueryClientProvider client={queryClient}>
            <PairedContext value={paired}>
              <PairedApp initialState={run.initialState} />
            </PairedContext>
          </QueryClientProvider>
        ) : (
          <PairScreen
            lastServer={playground.scenario.server}
            onPaired={() => setPairingChoice(null)}
            pairing={fakePairing}
            refused={pairing.refused}
          />
        )}
      </InsetArea>
      <Banner
        onControls={() => setPanelChoice(true)}
        onExit={onExit}
        playground={playground}
      />
      <Panel
        onClose={() => setPanelChoice(false)}
        onExit={onExit}
        onScenario={onScenario}
        playground={playground}
        visible={panelOpen}
      />
    </View>
  );
};
