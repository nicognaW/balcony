// Seam C: what the pairing screens tell the user when a short code didn't
// pair, from the playground's fake of the contract.
import { describe, expect, it } from "@effect/vitest";

import { pairingOutcome, pairingRefusalMessage } from "../src/index.ts";
import { createPlayground } from "../src/playground/index.ts";
import type { ScenarioId } from "../src/playground/index.ts";

const open = (scenario: ScenarioId) =>
  createPlayground({ autoplayMs: null, now: () => 0, scenario });

describe("a wrong pairing code", () => {
  it("says how many tries are left, down to the last one", async () => {
    const playground = open("pairing-wrong");

    /** What the screen shows after one more wrong try. */
    const tryWrongCode = async () => {
      const outcome = await pairingOutcome(
        playground.client.pairing.exchange({ code: "000 000" })
      );

      return "refusal" in outcome ? pairingRefusalMessage(outcome) : "paired";
    };

    expect(await tryWrongCode()).toBe(
      "That isn't the code on your Mac. Check it and try again (4 tries left)."
    );
    expect(await tryWrongCode()).toBe(
      "That isn't the code on your Mac. Check it and try again (3 tries left)."
    );
    await tryWrongCode();
    expect(await tryWrongCode()).toBe(
      "That isn't the code on your Mac. Check it and try again (1 try left)."
    );
    expect(await tryWrongCode()).toBe(
      "Too many wrong tries. Press Enter in the terminal running balcony for a new one."
    );
    playground.close();
  });
});
