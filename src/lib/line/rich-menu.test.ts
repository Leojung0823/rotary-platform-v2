import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildMemberRichMenu,
  clearDefaultRichMenu,
  publishMemberRichMenu,
  RICH_MENU_HEIGHT,
  RICH_MENU_WIDTH,
  validateRichMenuImage,
} from "./rich-menu";

const clubId = "a1000000-0000-4000-8000-000000000001";
const richMenuId = `richmenu-${"a".repeat(32)}`;
const siteUrl = "https://staging.rotary.example";

function png(width = RICH_MENU_WIDTH, height = RICH_MENU_HEIGHT) {
  const bytes = new Uint8Array(32);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

function jpeg(width = RICH_MENU_WIDTH, height = RICH_MENU_HEIGHT) {
  const bytes = new Uint8Array(21);
  bytes.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08], 0);
  const view = new DataView(bytes.buffer);
  view.setUint16(7, height);
  view.setUint16(9, width);
  bytes[20] = 0xd9;
  return bytes;
}

function menu() {
  return buildMemberRichMenu({ clubId, siteUrl });
}

describe("member LINE Rich Menu definition", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("creates four same-origin member links for the selected club", () => {
    const result = menu();
    expect(result.size).toEqual({ width: 2500, height: 1686 });
    expect(result.areas).toHaveLength(4);
    expect(result.areas.map((area) => area.action.label)).toEqual([
      "社團首頁", "活動報名", "生日祝福", "我的資料",
    ]);
    for (const area of result.areas) {
      const url = new URL(area.action.uri);
      expect(url.origin).toBe(siteUrl);
      expect(url.searchParams.get("clubId")).toBe(clubId);
      expect(url.searchParams.get("mode")).toBe("member");
      expect(url.pathname).not.toContain("/clubs/");
      expect(url.pathname).not.toContain("management");
    }
  });

  it.each([
    ["bad-club", siteUrl],
    [clubId, "not a url"],
    [clubId, "https://user:password@staging.rotary.example"],
  ])("rejects unsafe menu inputs (%s, %s)", (badClubId, badSiteUrl) => {
    expect(() => buildMemberRichMenu({ clubId: badClubId, siteUrl: badSiteUrl })).toThrow();
  });
});

describe("LINE Rich Menu image validation", () => {
  it.each(["image/svg+xml", "application/octet-stream", "image/gif"]) (
    "rejects %s",
    (contentType) => expect(validateRichMenuImage(png(), contentType)).toEqual({ ok: false, reason: "invalid_type" }),
  );

  it("accepts exact-size PNG and JPEG images", () => {
    expect(validateRichMenuImage(png(), "image/png")).toEqual({ ok: true, width: 2500, height: 1686 });
    expect(validateRichMenuImage(jpeg(), "image/jpeg")).toEqual({ ok: true, width: 2500, height: 1686 });
  });

  it.each([
    [new Uint8Array(), "image/png", "empty"],
    [new Uint8Array([1, 2, 3]), "image/png", "invalid_image"],
    [png(800, 250), "image/png", "invalid_dimensions"],
    [png(2500, 843), "image/png", "invalid_dimensions"],
  ] as const)("rejects an invalid image (%s)", (bytes, contentType, reason) => {
    expect(validateRichMenuImage(bytes, contentType)).toEqual({ ok: false, reason });
  });

  it("rejects an image over LINE's one-megabyte limit", () => {
    const bytes = new Uint8Array(1_000_001);
    bytes.set(png(), 0);
    expect(validateRichMenuImage(bytes, "image/png")).toEqual({ ok: false, reason: "too_large" });
  });
});

describe("LINE Rich Menu provider sequence", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("does not call LINE in local mock mode", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await publishMemberRichMenu({
      mode: "mock", siteUrl: "http://localhost:3000", menu: menu(), image: png(), contentType: "image/png",
    });
    expect(result.provider).toBe("mock");
    expect(result.richMenuId).toMatch(/^richmenu-[a-f0-9]{32}$/u);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates, uploads, then sets the selected club menu as default", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ richMenuId }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await publishMemberRichMenu({
      mode: "line", siteUrl, accessToken: "server-only-token", menu: menu(), image: png(), contentType: "image/png",
    });
    expect(result).toEqual({ richMenuId, provider: "line" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.line.me/v2/bot/richmenu");
    expect(fetchMock.mock.calls[1][0]).toBe(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`);
    expect(fetchMock.mock.calls[2][0]).toBe(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`);
    for (const call of fetchMock.mock.calls) {
      expect(call[1]).toEqual(expect.objectContaining({ cache: "no-store", redirect: "error" }));
      expect(call[1]?.headers).toEqual(expect.objectContaining({ Authorization: "Bearer server-only-token" }));
    }
  });

  it("clears the default menu without deleting the provider object", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ richMenuId }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(clearDefaultRichMenu("server-only-token", siteUrl, richMenuId)).resolves.toEqual({ cleared: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.line.me/v2/bot/user/all/richmenu",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://api.line.me/v2/bot/user/all/richmenu",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("does not clear a different default menu", async () => {
    const otherRichMenuId = `richmenu-${"b".repeat(32)}`;
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ richMenuId: otherRichMenuId }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(clearDefaultRichMenu("server-only-token", siteUrl, richMenuId)).resolves.toEqual({ cleared: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("turns a provider rejection into a safe failure code", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private provider detail", { status: 401 })));
    await expect(publishMemberRichMenu({
      mode: "line", siteUrl, accessToken: "server-only-token", menu: menu(), image: png(), contentType: "image/png",
    })).rejects.toMatchObject({ code: "credentials_rejected" });
  });
});
