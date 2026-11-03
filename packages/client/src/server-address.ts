// The Balcony server the mobile app pairs with: typed as an address next to
// the short code, or scanned from the QR code `balcony` prints. The app
// speaks plain HTTP, so only local network addresses are accepted (see
// docs/adr/0004-cleartext-only-to-local-addresses.md).

/** The port `balcony` listens on unless `BALCONY_PORT` says otherwise. */
export const DEFAULT_PORT = 7766;

/**
 * invalid: not an address. not-local: an address outside the local network.
 * no-token: a scanned code without a pairing token.
 */
export type AddressRefusal = "invalid" | "not-local";

export type ServerAddress =
  | { readonly server: string }
  | { readonly refusal: AddressRefusal };

export type ScannedPairing =
  | { readonly server: string; readonly token: string }
  | { readonly refusal: AddressRefusal | "no-token" };

/** Private (RFC 1918), loopback and link-local IPv4 ranges: start, prefix. */
const LOCAL_IPV4: readonly (readonly [string, number])[] = [
  ["10.0.0.0", 8],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
];

/** The address as a number, or null when it isn't dotted-decimal IPv4. */
const ipv4 = (hostname: string): number | null => {
  const parts = hostname.split(".");

  if (parts.length !== 4 || !parts.every((part) => /^\d{1,3}$/u.test(part))) {
    return null;
  }

  return parts.reduce((address, part) => address * 256 + Number(part), 0);
};

const isLocalIpv4 = (address: number): boolean =>
  LOCAL_IPV4.some(([start, prefix]) => {
    const first = ipv4(start) ?? 0;

    return address >= first && address < first + 2 ** (32 - prefix);
  });

/** Loopback, unique local (fc00::/7) and link-local (fe80::/10) IPv6. */
const isLocalIpv6 = (address: string): boolean => {
  if (address === "::1") {
    return true;
  }

  const first = Number.parseInt(address.split(":")[0] ?? "", 16);

  return (
    // oxlint-disable-next-line no-bitwise -- prefix masks on a 16-bit group.
    (first & 0xfe_00) === 0xfc_00 || (first & 0xff_c0) === 0xfe_80
  );
};

/**
 * Whether a URL hostname (as `URL` normalises it) is on the local network:
 * a private, loopback or link-local IP, `localhost`, or an mDNS `.local` or
 * `.home.arpa` name.
 */
export const isLocalNetworkHost = (hostname: string): boolean => {
  const host = hostname.toLowerCase().replace(/\.$/u, "");

  if (host.startsWith("[") && host.endsWith("]")) {
    return isLocalIpv6(host.slice(1, -1));
  }

  const address = ipv4(host);

  if (address !== null) {
    return isLocalIpv4(address);
  }

  return (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".home.arpa")
  );
};

const parseUrl = (text: string): URL | null => {
  try {
    return new URL(text);
  } catch {
    return null;
  }
};

/** The origin of an http(s) URL on the local network, or why not. */
const localOrigin = (url: URL | null): ServerAddress => {
  if (
    url === null ||
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.hostname === ""
  ) {
    return { refusal: "invalid" };
  }

  if (!isLocalNetworkHost(url.hostname)) {
    return { refusal: "not-local" };
  }

  return { server: url.origin };
};

const HAS_SCHEME = /^[a-z][a-z\d+.-]*:\/\//iu;
const HAS_PORT = /^[a-z][a-z\d+.-]*:\/\/(?:\[[^\]]*\]|[^/:?#[]*):\d/iu;

/**
 * The server origin for an address typed next to the short code, such as
 * `192.168.1.20`, `192.168.1.20:7766` or `http://studio.local:7766/`. The
 * port defaults to Balcony's.
 */
export const serverFromAddress = (input: string): ServerAddress => {
  const text = input.trim();

  if (text === "" || /\s/u.test(text)) {
    return { refusal: "invalid" };
  }

  const withScheme = HAS_SCHEME.test(text) ? text : `http://${text}`;
  const url = parseUrl(withScheme);

  // Rebuilt rather than setting `url.port`, which some runtimes ignore for
  // IPv6 hosts.
  return localOrigin(
    url === null || HAS_PORT.test(withScheme)
      ? url
      : parseUrl(`${url.protocol}//${url.hostname}:${DEFAULT_PORT}`)
  );
};

/**
 * The server and token in a scanned QR code: the pairing link `balcony`
 * prints, `http://<mac>:<port>/#token=<token>`.
 */
export const pairingFromQr = (payload: string): ScannedPairing => {
  const url = parseUrl(payload.trim());
  const address = localOrigin(url);

  if ("refusal" in address) {
    return address;
  }

  const token = new URLSearchParams(url?.hash.slice(1)).get("token");

  return token === null || token === ""
    ? { refusal: "no-token" }
    : { server: address.server, token };
};
