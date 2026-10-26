import { describe, expect, it } from "vitest";
import { sanitizeStagingLcpAttribution } from "./staging-lcp-attribution.mjs";

describe("staging LCP attribution privacy filter", () => {
  it("keeps safe static image attribution and relative resource timings", () => {
    expect(sanitizeStagingLcpAttribution({
      currentOrigin: "https://rotary.example",
      lcp: {
        elementTag: "IMG",
        moduleClass: "member-portal-module__wpzd3a__backdropImage",
        isImage: true,
        startTime: 812.34,
        renderTime: 812.34,
        loadTime: 456.78,
        size: 940,
        url: "https://rotary.example/hero-mountains.webp?token=private#fragment",
      },
      resource: {
        initiatorType: "img",
        startTime: 180.12,
        responseEnd: 456.78,
        duration: 276.66,
        transferSize: 24_000,
        encodedBodySize: 23_000,
        decodedBodySize: 60_000,
      },
    })).toEqual({
      elementTag: "img",
      moduleClass: "member-portal-module__wpzd3a__backdropImage",
      isImage: true,
      lcpTimeMs: 812.3,
      renderTimeMs: 812.3,
      loadTimeMs: 456.8,
      sizeCssPx: 940,
      resourceOrigin: "same-origin",
      resourcePath: "/hero-mountains.webp",
      initiatorType: "img",
      resourceStartTimeMs: 180.1,
      resourceResponseEndMs: 456.8,
      resourceDurationMs: 276.7,
      afterResourceRenderDelayMs: 355.5,
      transferSizeBytes: 24_000,
      encodedBodySizeBytes: 23_000,
      decodedBodySizeBytes: 60_000,
    });
  });

  it("does not expose cross-origin hosts, URL paths, or signed query parameters", () => {
    const output = sanitizeStagingLcpAttribution({
      currentOrigin: "https://rotary.example",
      lcp: {
        elementTag: "img",
        isImage: true,
        startTime: 500,
        url: "https://cdn.example/private/member/123/avatar.webp?token=secret",
      },
      resource: { initiatorType: "img", startTime: 100, responseEnd: 300, duration: 200 },
    });

    expect(output.resourceOrigin).toBe("cross-origin");
    expect(output.resourcePath).toBeNull();
    expect(JSON.stringify(output)).not.toMatch(/cdn\.example|member\/123|secret/u);
  });

  it("extracts only an allow-listed static source path from a Next Image URL", () => {
    const output = sanitizeStagingLcpAttribution({
      currentOrigin: "https://rotary.example",
      lcp: {
        elementTag: "img",
        isImage: true,
        startTime: 600,
        url: "https://rotary.example/_next/image?url=%2Fhero-mountains.webp&w=1920&q=75&token=private",
      },
      resource: { initiatorType: "img", startTime: 100, responseEnd: 350, duration: 250 },
    });

    expect(output.resourcePath).toBe("/hero-mountains.webp");
    expect(JSON.stringify(output)).not.toMatch(/_next\/image|1920|token|private/u);
  });

  it("does not expose dynamic same-origin routes or malformed tags", () => {
    const output = sanitizeStagingLcpAttribution({
      currentOrigin: "https://rotary.example",
      lcp: {
        elementTag: "DIV#member-123",
        moduleClass: "member-123-secret-class",
        startTime: 700,
        url: "/api/members/123?secret=value",
      },
      resource: { initiatorType: "private-type", startTime: -1, responseEnd: 400, duration: 500 },
    });

    expect(output.elementTag).toBeNull();
    expect(output.moduleClass).toBeNull();
    expect(output.resourceOrigin).toBe("same-origin");
    expect(output.resourcePath).toBeNull();
    expect(output.initiatorType).toBeNull();
    expect(output.resourceStartTimeMs).toBeNull();
    expect(JSON.stringify(output)).not.toMatch(/members\/123|secret|value|private-type/u);
  });

  it("returns explicit unavailable values when LCP attribution is absent", () => {
    expect(sanitizeStagingLcpAttribution()).toMatchObject({
      elementTag: null,
      moduleClass: null,
      isImage: false,
      resourceOrigin: "unavailable",
      resourcePath: null,
      resourceDurationMs: null,
      afterResourceRenderDelayMs: null,
    });
  });
});
