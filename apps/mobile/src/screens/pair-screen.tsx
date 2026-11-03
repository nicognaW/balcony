import type { PairingRefusal } from "@balcony/client";
import type { PairedConnection } from "@balcony/client/react";
// Pairing: scan the QR code `balcony` prints, or type the Mac's address and
// the short code shown under the QR. Wording follows the web app's.
import {
  pairingFromQr,
  serverFromAddress,
} from "@balcony/client/server-address";
import type { AddressRefusal } from "@balcony/client/server-address";
import { CameraView, useCameraPermissions } from "expo-camera";
import type { BarcodeScanningResult } from "expo-camera";
import { useRef, useState } from "react";
import type { ComponentProps } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";

import { pairByCode, pairWith } from "../lib/connection.ts";

const CODE_MESSAGES: Record<PairingRefusal, string> = {
  expired:
    "That code has expired. Press Enter in the terminal running balcony for a new one.",
  locked:
    "Too many wrong tries. Press Enter in the terminal running balcony for a new one.",
  other: "Pairing failed. Try again.",
  unreachable:
    "Couldn't reach Balcony. Is this phone on the same Wi-Fi as your Mac?",
  wrong: "That isn't the code on your Mac. Check it and try again.",
};

const ADDRESS_MESSAGES: Record<AddressRefusal | "no-token", string> = {
  invalid:
    "That isn't an address. Type it as shown by balcony, e.g. 192.168.1.20:7766.",
  "no-token": "That QR code isn't one balcony printed.",
  "not-local":
    "Balcony only connects to Macs on your local network, without encryption. Use the Mac's LAN address.",
};

export interface PairScreenProps {
  /** The address last paired with, to start from. */
  readonly lastServer: string | null;
  /** The server refused the pairing this phone had. */
  readonly refused: boolean;
  readonly onPaired: (paired: PairedConnection) => void;
}

const Button = ({
  busy = false,
  label,
  onPress,
}: {
  readonly busy?: boolean;
  readonly label: string;
  readonly onPress: () => void;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityState={{ busy, disabled: busy }}
    className="bg-primary h-11 flex-row items-center justify-center gap-2 rounded-lg px-4 active:opacity-80"
    disabled={busy}
    onPress={onPress}
  >
    {busy ? <ActivityIndicator color="white" size="small" /> : null}
    <Text className="text-primary-foreground text-sm font-medium">{label}</Text>
  </Pressable>
);

const Field = ({
  label,
  ...props
}: {
  readonly label: string;
} & ComponentProps<typeof TextInput>) => (
  <View className="gap-1.5">
    <Text className="text-foreground text-sm font-medium">{label}</Text>
    <TextInput
      autoCapitalize="none"
      autoCorrect={false}
      className="bg-card border-input text-foreground h-11 rounded-lg border px-3 text-base"
      placeholderTextColorClassName="accent-muted-foreground"
      {...props}
    />
  </View>
);

// Third-party views take Uniwind classes through withUniwind.
const Camera = withUniwind(CameraView);
const SafeArea = withUniwind(SafeAreaView);

const Scanner = ({
  onScanned,
}: {
  readonly onScanned: (payload: string) => void;
}) => {
  const [permission, requestPermission] = useCameraPermissions();

  if (permission === null) {
    return <View className="bg-muted aspect-square rounded-xl" />;
  }

  if (!permission.granted) {
    return (
      <View className="bg-muted aspect-square items-center justify-center gap-3 rounded-xl p-6">
        <Text className="text-muted-foreground text-center text-sm">
          {permission.canAskAgain
            ? "Balcony needs the camera to scan the QR code balcony prints."
            : "Camera access is off. Allow it in Settings, or type the code below."}
        </Text>
        {permission.canAskAgain ? (
          <Button label="Allow camera" onPress={requestPermission} />
        ) : null}
      </View>
    );
  }

  return (
    <View className="aspect-square overflow-hidden rounded-xl">
      <Camera
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        className="flex-1"
        facing="back"
        onBarcodeScanned={({ data }: BarcodeScanningResult) => onScanned(data)}
      />
    </View>
  );
};

export const PairScreen = ({
  lastServer,
  onPaired,
  refused,
}: PairScreenProps) => {
  const [address, setAddress] = useState(
    () => lastServer?.replace(/^http:\/\//u, "") ?? ""
  );

  const [code, setCode] = useState("");

  const [message, setMessage] = useState<string | null>(
    refused ? "Balcony no longer accepts this phone. Pair it again." : null
  );

  const [busy, setBusy] = useState(false);
  // The scanner reports the same code many times a second.
  const lastScan = useRef<string>(null);

  const onScanned = (payload: string) => {
    if (busy || payload === lastScan.current) {
      return;
    }

    lastScan.current = payload;
    const scanned = pairingFromQr(payload);

    if ("refusal" in scanned) {
      setMessage(ADDRESS_MESSAGES[scanned.refusal]);

      return;
    }

    setBusy(true);
    void pairWith(scanned).then(onPaired);
  };

  const onSubmit = async () => {
    const parsed = serverFromAddress(address);

    if ("refusal" in parsed) {
      setMessage(ADDRESS_MESSAGES[parsed.refusal]);

      return;
    }

    setBusy(true);
    setMessage(null);
    const result = await pairByCode(parsed.server, code);

    if ("paired" in result) {
      onPaired(result.paired);

      return;
    }

    setBusy(false);
    setMessage(CODE_MESSAGES[result.refusal]);
  };

  return (
    <SafeArea className="bg-background flex-1">
      <KeyboardAvoidingView behavior="height" className="flex-1">
        <ScrollView
          contentContainerClassName="gap-5 p-5"
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-1">
            <Text className="text-foreground text-2xl font-semibold">
              Pair with your Mac
            </Text>
            <Text className="text-muted-foreground text-sm">
              Run balcony on your Mac and scan the QR code it prints.
            </Text>
          </View>
          <Scanner onScanned={onScanned} />
          <Text className="text-muted-foreground text-sm">
            Or type the address and the code shown under it.
          </Text>
          <Field
            inputMode="url"
            label="Address"
            onChangeText={setAddress}
            placeholder="192.168.1.20:7766"
            value={address}
          />
          <Field
            autoComplete="one-time-code"
            inputMode="numeric"
            label="Code"
            onChangeText={setCode}
            onSubmitEditing={onSubmit}
            placeholder="123 456"
            value={code}
          />
          {message === null ? null : (
            <Text
              accessibilityLiveRegion="polite"
              className="text-destructive-foreground text-sm"
            >
              {message}
            </Text>
          )}
          <Button busy={busy} label="Pair" onPress={onSubmit} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeArea>
  );
};
