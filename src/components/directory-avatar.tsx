"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";

function safeAvatarUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function DirectoryAvatar({ avatarUrl, displayName }: { avatarUrl: string | null; displayName: string }) {
  const [failed, setFailed] = useState(false);
  const url = safeAvatarUrl(avatarUrl);
  const initial = displayName.trim().slice(0, 1) || "？";
  return <span className="directory-avatar" aria-hidden="true">
    <span>{initial}</span>
    {url && !failed && <img src={url} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />}
  </span>;
}
