# The Android app allows cleartext and refuses non-local servers itself

Balcony speaks plain HTTP and `ws://` on the LAN, and the Android app must not speak plain HTTP to anything else. Android's network security config can allow cleartext per exact domain or IP (`<domain-config>`), but not per IP range, and the Mac's LAN address is only known when the phone pairs. So the config's `<base-config>` allows cleartext and trusts only the system CAs (`apps/mobile/plugins/with-local-cleartext.cjs`), and the app enforces the rule: every server address, typed or scanned from the QR code, goes through `serverFromAddress` / `pairingFromQr` in `@balcony/client/server-address`, which refuse anything but a private, loopback or link-local IP (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, fc00::/7, fe80::/10, ::1), `localhost`, or a `.local` / `.home.arpa` name. The saved address is checked again when the app starts. The app makes no other network requests.

Rejected:

- **A `<domain-config>` per address**: the address isn't known at build time, and a list of every private IP is out of reach (65k addresses for 192.168/16 alone).
- **Cleartext off, with `localhost` and `.local` domains only**: Balcony prints an IP address in its QR code, and Android doesn't reliably resolve mDNS names, so most pairings would fail.
- **HTTPS with a self-signed certificate**: out of scope for v1 (spec #1); it would need trust-on-first-use pinning in both clients.

## Consequences

- The guard is in JavaScript, not in the OS: a future feature that fetches from the internet would be allowed cleartext by the config. Such a feature should use HTTPS, or the config should be revisited.
- Carrier-grade NAT (100.64/10, which Tailscale uses) is refused, since remote access off the LAN is out of scope; adding it is a one-line change in `server-address.ts` with a test.
- A hostname is checked by name, not by what it resolves to: a `.local` name is trusted to be on the LAN.
