// Turns off GWP-ASan, Android's sampling heap checker, for the app.
//
// With it on, the app sometimes died with a native SIGSEGV at launch on the
// CI emulator, which failed playground-screenshots runs at random.
const { withAndroidManifest } = require("expo/config-plugins");

module.exports = function withGwpAsanOff(config) {
  return withAndroidManifest(config, (next) => {
    const [application] = next.modResults.manifest.application ?? [];

    if (application === undefined) {
      throw new Error("AndroidManifest.xml has no <application> element.");
    }

    application.$["android:gwpAsanMode"] = "never";

    return next;
  });
};
