// The Android app's Expo config. There is no iOS build.
import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  android: {
    // Permissions Expo's template adds that Balcony never uses.
    blockedPermissions: [
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.SYSTEM_ALERT_WINDOW",
      "android.permission.VIBRATE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
    ],
    package: "dev.balcony.mobile",
    // The camera is only for scanning the pairing QR code.
    permissions: ["android.permission.CAMERA"],
  },
  name: "Balcony",
  orientation: "portrait",
  platforms: ["android"],
  plugins: [
    [
      "expo-camera",
      {
        cameraPermission: "Balcony scans the QR code balcony prints to pair.",
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
    "expo-secure-store",
    "./plugins/with-local-cleartext.cjs",
    "./plugins/with-gwp-asan-off.cjs",
  ],
  scheme: "balcony",
  slug: "balcony",
  userInterfaceStyle: "automatic",
  version: "0.0.0",
};

export default config;
