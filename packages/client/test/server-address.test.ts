// Seam C: the addresses the mobile app pairs with, typed or scanned.
import { describe, expect, it } from "@effect/vitest";

import { pairingFromQr, serverFromAddress } from "../src/server-address.ts";

describe("a typed server address", () => {
  it("is the Mac's LAN address, on Balcony's port unless another is given", () => {
    expect(serverFromAddress("192.168.1.20")).toEqual({
      server: "http://192.168.1.20:7766",
    });
  });

  it("may be pasted with a scheme, port and path", () => {
    expect(serverFromAddress(" http://10.0.0.5:8080/#token=abc ")).toEqual({
      server: "http://10.0.0.5:8080",
    });
  });

  it("may name the Mac by a local name or a local IPv6 address", () => {
    expect(serverFromAddress("studio.local")).toEqual({
      server: "http://studio.local:7766",
    });
    expect(serverFromAddress("localhost:9000")).toEqual({
      server: "http://localhost:9000",
    });
    expect(serverFromAddress("[fd12:3456::1]")).toEqual({
      server: "http://[fd12:3456::1]:7766",
    });
    expect(serverFromAddress("[fe80::1]:7000")).toEqual({
      server: "http://[fe80::1]:7000",
    });
  });

  it("is refused when it isn't an address", () => {
    for (const address of ["", "   ", "http://", "a b", "ftp://10.0.0.1"]) {
      expect(serverFromAddress(address)).toEqual({ refusal: "invalid" });
    }
  });

  it("is refused outside the local network, since the app only speaks plain HTTP there", () => {
    for (const address of [
      "8.8.8.8",
      "172.32.0.1",
      "100.64.0.1",
      "example.com",
      "[2001:db8::1]",
    ]) {
      expect(serverFromAddress(address)).toEqual({ refusal: "not-local" });
    }
  });
});

describe("a scanned QR code", () => {
  it("carries the server and token of the pairing link balcony prints", () => {
    expect(pairingFromQr("http://192.168.1.20:7766/#token=s3cr%2Bt")).toEqual({
      server: "http://192.168.1.20:7766",
      token: "s3cr+t",
    });
  });

  it("is refused without a token", () => {
    expect(pairingFromQr("http://192.168.1.20:7766/")).toEqual({
      refusal: "no-token",
    });
  });

  it("is refused when it points outside the local network", () => {
    expect(pairingFromQr("http://203.0.113.9:7766/#token=abc")).toEqual({
      refusal: "not-local",
    });
  });

  it("is refused when it isn't a link", () => {
    expect(pairingFromQr("WIFI:S:home;T:WPA;P:hunter2;;")).toEqual({
      refusal: "invalid",
    });
  });
});
