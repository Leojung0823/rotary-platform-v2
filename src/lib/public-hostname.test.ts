import { describe, expect, it } from "vitest";
import {
  hostnameResolvesPublicly,
  isNonPublicHostname,
  isPublicHostname,
} from "./public-hostname.mjs";

describe("public hostname validation", () => {
  it("accepts public DNS names and globally routable IP addresses", () => {
    for (const hostname of [
      "staging.example.com",
      "api.staging.example.com.",
      "8.8.8.8",
      "1.1.1.1",
      "2606:4700:4700::1111",
      "::ffff:8.8.8.8",
    ]) {
      expect(isPublicHostname(hostname), hostname).toBe(true);
      expect(isNonPublicHostname(hostname), hostname).toBe(false);
    }
  });

  it("rejects local names, single-label hosts and reserved suffixes", () => {
    for (const hostname of [
      "",
      "localhost",
      "localhost.localdomain",
      "service.localhost",
      "printer.local",
      "database.internal",
      "router.lan",
      "gateway.home.arpa",
      "staging",
      "staging.test",
      "staging.invalid",
      "rotary.example",
    ]) {
      expect(isPublicHostname(hostname), hostname).toBe(false);
      expect(isNonPublicHostname(hostname), hostname).toBe(true);
    }
  });

  it("rejects private, link-local, benchmark, documentation and reserved IPv4 ranges", () => {
    for (const hostname of [
      "0.0.0.0",
      "10.0.0.8",
      "100.64.0.1",
      "127.1.2.3",
      "169.254.1.2",
      "172.20.0.5",
      "192.0.2.1",
      "192.168.1.5",
      "198.18.0.1",
      "198.51.100.1",
      "203.0.113.1",
      "224.0.0.1",
      "255.255.255.255",
    ]) {
      expect(isPublicHostname(hostname), hostname).toBe(false);
    }
  });

  it("rejects non-public IPv6 and mapped non-public IPv4 addresses", () => {
    for (const hostname of [
      "::",
      "::1",
      "fd00::1",
      "fe80::1",
      "ff02::1",
      "100::1",
      "2001:db8::1",
      "2001:2::1",
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "::ffff:10.0.0.1",
    ]) {
      expect(isPublicHostname(hostname), hostname).toBe(false);
    }
  });

  it("rejects public-looking DNS names that resolve to any non-public address", async () => {
    const publicLookup = async () => [{ address: "8.8.8.8", family: 4 }];
    const mixedLookup = async () => [
      { address: "8.8.8.8", family: 4 },
      { address: "10.0.0.8", family: 4 },
    ];
    expect(await hostnameResolvesPublicly("staging.rotary.org", publicLookup)).toBe(true);
    expect(await hostnameResolvesPublicly("staging.rotary.org", mixedLookup)).toBe(false);
    expect(await hostnameResolvesPublicly("staging.rotary.org", async () => [])).toBe(false);
  });
});
