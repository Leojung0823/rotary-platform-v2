import type { MessagePayload } from "./messaging";

export const FLEX_TEMPLATES = {
  announcement: { label: "社務公告", color: "#005DAA" },
  event: { label: "活動提醒", color: "#156B54" },
  birthday: { label: "生日祝福", color: "#9C3158" },
} as const;

export type FlexTemplate = keyof typeof FLEX_TEMPLATES;

function requiredText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") throw new Error("invalid_flex_text");
  const text = value.trim();
  if (!text || text.length > maxLength) throw new Error("invalid_flex_text");
  return text;
}

/** Pure payload builder. The caller must authorize and select the club first.
 * No arbitrary JSON, remote images or caller-supplied actions are accepted.
 */
export function buildClubFlexMessage(input: {
  template: unknown;
  clubName: unknown;
  title: unknown;
  message: unknown;
}): Extract<MessagePayload, { type: "flex" }> {
  if (typeof input.template !== "string" ||
      !Object.hasOwn(FLEX_TEMPLATES, input.template)) {
    throw new Error("invalid_flex_template");
  }
  const template = FLEX_TEMPLATES[input.template as FlexTemplate];
  const clubName = requiredText(input.clubName, 100);
  const title = requiredText(input.title, 80);
  const message = requiredText(input.message, 2000);
  return {
    type: "flex",
    // Kept below LINE's 400-character limit, including surrogate pairs.
    altText: `${clubName}｜${template.label}：${title}`,
    contents: {
      type: "bubble",
      header: {
        type: "box", layout: "vertical", backgroundColor: template.color,
        contents: [
          { type: "text", text: template.label, color: "#FFFFFF", weight: "bold", wrap: true },
          { type: "text", text: clubName, color: "#FFFFFF", size: "sm", wrap: true, margin: "sm" },
        ],
      },
      body: {
        type: "box", layout: "vertical", spacing: "lg",
        contents: [
          { type: "text", text: title, weight: "bold", size: "xl", wrap: true },
          { type: "text", text: message, size: "md", wrap: true, color: "#333333" },
        ],
      },
    },
  };
}
