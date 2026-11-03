# The terminal is the pairing screen for the short code

Balcony is a CLI server, so the "pairing screen" the short code is tied to is the terminal running `balcony`. A six-digit code is printed under the QR code at start, and pressing Enter prints a fresh one. Only the latest code is live: a new code replaces the old one, and a code is gone once it pairs a phone, after 10 minutes, or after 5 wrong tries. The terminal says when the code has expired. A phone exchanges the code for the long-lived token through `pairing.exchange`, the one procedure that needs no token.

Wrong tries are counted per code, not per phone or address: on a shared Wi-Fi, a guesser gets at most 5 tries out of a million per code the user chose to show. Locking out the user's own phone is the cost; the user presses Enter for a new code. A code showing only while a separate "pair" command or key is held was rejected, because the code is then missing at the one moment it's needed (the QR scan just failed) and the user has to learn a second step.

## Consequences

- Restarting `balcony` issues a new code; codes aren't saved. The token still is, so paired phones stay paired.
- The refusal reasons are part of the contract (`PAIRING_CODE_WRONG` with `attemptsLeft`, `PAIRING_CODE_EXPIRED`, `PAIRING_CODE_LOCKED`), so the web and Android apps word them the same way. A used code reads as expired.
- Expiry reads the server's injectable clock (`now` in `startServer`), so tests move time instead of waiting.
