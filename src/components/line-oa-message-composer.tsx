"use client";

import { useState } from "react";
import { Field, Input, Select } from "@/components/ui";
import { FLEX_TEMPLATES, type FlexTemplate } from "@/lib/line/flex-templates";

/** Fields for the existing, server-authorized OA send form.
 * The parent only enables templates after a server-side feature-flag check.
 * The action must independently repeat that check before delivery.
 */
export function LineOaMessageComposer({
  senderName,
  templatesEnabled,
}: {
  senderName: string;
  templatesEnabled: boolean;
}) {
  const [format, setFormat] = useState<"text" | FlexTemplate>("text");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const selected = templatesEnabled && format !== "text" ? FLEX_TEMPLATES[format] : null;

  return (
    <>
      {templatesEnabled && (
        <Field label="訊息樣式">
          <Select name="messageFormat" value={format} onChange={(event) => setFormat(event.target.value as "text" | FlexTemplate)}>
            <option value="text">純文字</option>
            {Object.entries(FLEX_TEMPLATES).map(([key, template]) => (
              <option key={key} value={key}>{template.label}卡片</option>
            ))}
          </Select>
        </Field>
      )}
      {selected && (
        <Field label="卡片標題">
          <Input name="messageTitle" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} required placeholder="例如：九月份例會提醒" />
        </Field>
      )}
      <Field label="訊息" hint="最多 2,000 字，可換行。">
        <textarea className="input" name="message" value={message} onChange={(event) => setMessage(event.target.value)} rows={5} maxLength={2000} required placeholder="輸入要發送的訊息" />
      </Field>
      {selected && (
        <section aria-label="訊息卡片預覽">
          <h3>卡片預覽</h3>
          <p className="subtle">這是內容示意，LINE 手機上的字體與排版可能不同。</p>
          <div style={{ maxWidth: "24rem", border: "1px solid #CBD5E1", borderRadius: "1rem", overflow: "hidden", overflowWrap: "anywhere" }}>
            <div style={{ backgroundColor: selected.color, color: "#FFFFFF", padding: "1rem" }}>
              <strong>{selected.label}</strong>
              <div>{senderName}</div>
            </div>
            <div style={{ padding: "1rem", backgroundColor: "#FFFFFF", color: "#333333" }}>
              <h4 style={{ marginTop: 0 }}>{title.trim() || "請填寫卡片標題"}</h4>
              <p style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>{message.trim() || "請填寫訊息內容"}</p>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
