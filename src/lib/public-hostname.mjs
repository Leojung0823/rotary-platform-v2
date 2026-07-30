import { isIP } from "node:net";
import { lookup as dnsLookup } from "node:dns/promises";

/** @typedef {{address: string, family: number}} ResolvedAddress */
/** @typedef {(hostname: string, options: {all: true, verbatim: true}) => Promise<ResolvedAddress[]>} LookupAll */
/** @type {LookupAll} */
const resolveAllAddresses = (hostname, options) => dnsLookup(hostname, options);

const LOCAL_HOSTS = new Set(["localhost", "localhost.localdomain"]);
const NON_PUBLIC_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".lan",
  ".home.arpa",
  ".test",
  ".invalid",
  ".example",
];

const IPV4_NON_PUBLIC_CIDRS = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.31.196.0", 24],
  ["192.52.193.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["192.175.48.0", 24],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function normalizeHostname(hostname) {
  let normalized = String(hostname ?? "").trim().toLowerCase();
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    normalized = normalized.slice(1, -1);
  }
  if (normalized.endsWith(".")) normalized = normalized.slice(0, -1);
  return normalized;
}

function ipv4ToNumber(hostname) {
  const octets = hostname.split(".").map((part) => Number.parseInt(part, 10));
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return null;
  }
  return ((((octets[0] << 24) >>> 0) + (octets[1] << 16) + (octets[2] << 8) + octets[3]) >>> 0);
}

function isInIpv4Cidr(value, base, prefixLength) {
  const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
  return (value & mask) === (base & mask);
}

function isNonPublicIpv4(hostname) {
  const value = ipv4ToNumber(hostname);
  if (value === null) return true;
  return IPV4_NON_PUBLIC_CIDRS.some(([baseAddress, prefixLength]) => {
    const base = ipv4ToNumber(baseAddress);
    return base !== null && isInIpv4Cidr(value, base, prefixLength);
  });
}

function parseIpv6Bytes(hostname) {
  let value = hostname.toLowerCase();
  if (value.includes("%")) return null;

  const dottedTail = value.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/u)?.[1];
  if (dottedTail) {
    const ipv4 = ipv4ToNumber(dottedTail);
    if (ipv4 === null) return null;
    const high = ((ipv4 >>> 16) & 0xffff).toString(16);
    const low = (ipv4 & 0xffff).toString(16);
    value = `${value.slice(0, -dottedTail.length)}${high}:${low}`;
  }

  const halves = value.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if (halves.length === 1 && left.length !== 8) return null;
  if (halves.length === 2 && left.length + right.length >= 8) return null;

  const missing = 8 - left.length - right.length;
  const segments = [...left, ...Array(missing).fill("0"), ...right];
  if (segments.length !== 8 || segments.some((segment) => !/^[0-9a-f]{1,4}$/u.test(segment))) return null;

  return Uint8Array.from(segments.flatMap((segment) => {
    const numeric = Number.parseInt(segment, 16);
    return [numeric >>> 8, numeric & 0xff];
  }));
}

function bytesStartWith(bytes, prefix) {
  return prefix.every((value, index) => bytes[index] === value);
}

function isNonPublicIpv6(hostname) {
  const bytes = parseIpv6Bytes(hostname);
  if (!bytes) return true;

  const allZero = bytes.every((value) => value === 0);
  const loopback = bytes.slice(0, 15).every((value) => value === 0) && bytes[15] === 1;
  if (allZero || loopback) return true;

  const ipv4Mapped = bytes.slice(0, 10).every((value) => value === 0)
    && bytes[10] === 0xff
    && bytes[11] === 0xff;
  if (ipv4Mapped) {
    return isNonPublicIpv4(`${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`);
  }

  if ((bytes[0] & 0xfe) === 0xfc) return true;
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return true;
  if (bytes[0] === 0xff) return true;
  if (bytesStartWith(bytes, [0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])) return true;
  if (bytesStartWith(bytes, [0x20, 0x01, 0x0d, 0xb8])) return true;
  if (bytesStartWith(bytes, [0x20, 0x01, 0x00, 0x02, 0x00, 0x00])) return true;

  return false;
}

function isPublicDomainName(hostname) {
  if (LOCAL_HOSTS.has(hostname) || NON_PUBLIC_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) return false;
  if (!hostname.includes(".") || hostname.length > 253) return false;
  return hostname.split(".").every((label) => (
    label.length >= 1
    && label.length <= 63
    && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(label)
  ));
}

export function isPublicHostname(hostname) {
  const normalized = normalizeHostname(hostname);
  if (!normalized) return false;

  const ipVersion = isIP(normalized);
  if (ipVersion === 4) return !isNonPublicIpv4(normalized);
  if (ipVersion === 6) return !isNonPublicIpv6(normalized);
  return isPublicDomainName(normalized);
}

export function isNonPublicHostname(hostname) {
  return !isPublicHostname(hostname);
}

/**
 * @param {string} hostname
 * @param {LookupAll} lookupImpl
 */
export async function hostnameResolvesPublicly(hostname, lookupImpl = resolveAllAddresses) {
  const normalized = normalizeHostname(hostname);
  if (!isPublicHostname(normalized)) return false;
  if (isIP(normalized)) return true;

  let addresses;
  try {
    addresses = await lookupImpl(normalized, { all: true, verbatim: true });
  } catch {
    return false;
  }
  return Array.isArray(addresses)
    && addresses.length > 0
    && addresses.every((entry) => isPublicHostname(entry?.address));
}
