"use client";
import { useState } from "react";

export function CopyLink({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const mailto = `mailto:?subject=${encodeURIComponent("扶輪社社員邀請")}&body=${encodeURIComponent(`請開啟以下一次性連結，使用 LINE 完成身份確認：\n\n${value}`)}`;
  return <><button type="button" className="button button-secondary" onClick={async () => { await navigator.clipboard.writeText(value); setCopied(true); }}>{copied ? "已複製" : "複製邀請連結"}</button><a className="button button-secondary" href={mailto}>用 Email 傳送</a></>;
}
