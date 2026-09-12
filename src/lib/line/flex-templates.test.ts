import { describe, expect, it } from "vitest";
import { buildClubFlexMessage, FLEX_TEMPLATES } from "./flex-templates";

const valid = {
  template: "announcement", clubName: "測試扶輪社", title: "本月社務通知", message: "謝謝大家的參與！\n下次見。",
};

describe("club Flex templates", () => {
  it.each(Object.keys(FLEX_TEMPLATES))( "builds the %s template without dropping content", (template) => {
    const payload = buildClubFlexMessage({ ...valid, template });
    const serialized = JSON.stringify(payload);
    expect(payload.type).toBe("flex");
    expect(payload.altText).toContain(valid.clubName);
    expect(serialized).toContain(valid.title);
    expect(serialized).toContain(JSON.stringify(valid.message).slice(1, -1));
    expect(serialized).not.toContain('"action"');
    expect(serialized).not.toContain('"type":"image"');
  });

  it.each(["__proto__", "constructor", "unknown", null, {}, 1])("rejects an invalid template %s", (template) => {
    expect(() => buildClubFlexMessage({ ...valid, template })).toThrow("invalid_flex_template");
  });

  it.each([
    ["clubName", 100], ["title", 80], ["message", 2000],
  ] as const)("rejects missing or oversized %s", (field, limit) => {
    for (const value of [null, {}, "   ", "字".repeat(limit + 1)]) {
      expect(() => buildClubFlexMessage({ ...valid, [field]: value })).toThrow("invalid_flex_text");
    }
    expect(() => buildClubFlexMessage({ ...valid, [field]: "字".repeat(limit) })).not.toThrow();
  });

  it("keeps user content as text rather than interpreting markup or JSON", () => {
    const message = '<script>alert(1)</script> {"type":"uri","uri":"https://example.com"}';
    const payload = buildClubFlexMessage({ ...valid, message });
    const body = payload.contents.body as { contents: { text: string }[] };
    expect(body.contents[1].text).toBe(message);
  });

  it("bounds the notification fallback and payload size at maximum input lengths", () => {
    const payload = buildClubFlexMessage({ ...valid, clubName: "社".repeat(100), title: "壽".repeat(80), message: "福".repeat(2000) });
    expect(payload.altText.length).toBeLessThanOrEqual(400);
    expect(Buffer.byteLength(JSON.stringify(payload.contents), "utf8")).toBeLessThan(30_000);
  });
});
