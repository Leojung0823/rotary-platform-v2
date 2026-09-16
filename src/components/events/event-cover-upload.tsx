"use client";

import { useRef, useState, useTransition } from "react";
import { recordEventCoverAction } from "@/app/event-actions";
import {
  COVER_ACCEPTED_TYPES,
  COVER_BUCKET,
  COVER_MAX_BYTES,
  COVER_MAX_EDGE,
  COVER_QUALITY,
  coverImageError,
  coverObjectPath,
  scaledDimensions,
} from "@/lib/events/cover-image";
import { createClient } from "@/lib/supabase/client";
import styles from "./event-cover.module.css";

type UploadState = "idle" | "preparing" | "uploading" | "done" | "error";

async function compress(file: File): Promise<Blob> {
  if (!COVER_ACCEPTED_TYPES.includes(file.type)) throw new Error("unsupported_type");

  // createImageBitmap decodes off the main thread and handles the orientation
  // metadata phone cameras write, which a plain <img> would ignore and leave
  // the photo sideways.
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("decode_failed");
  }

  const { width, height } = scaledDimensions(bitmap.width, bitmap.height, COVER_MAX_EDGE);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("decode_failed");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", COVER_QUALITY);
  });
  if (!blob) throw new Error("decode_failed");
  if (blob.size > COVER_MAX_BYTES) throw new Error("too_large");
  return blob;
}

export function EventCoverUpload({
  clubId,
  eventId,
  hasCover,
}: {
  clubId: string;
  eventId: string;
  hasCover: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const upload = async (file: File) => {
    setMessage(null);
    setState("preparing");
    try {
      const blob = await compress(file);
      setState("uploading");

      // Straight to Storage under this member's own session: the bucket's
      // policies decide whether they may write here, and the bytes never touch
      // the application server.
      const supabase = createClient();
      const path = coverObjectPath(clubId, eventId);
      const { error } = await supabase.storage
        .from(COVER_BUCKET)
        .upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (error) throw new Error("upload_failed");

      // Awaited, not fired and forgotten: the bytes reaching Storage is only
      // half the job, and the half that used to fail in silence is the other.
      startTransition(async () => {
        const recorded = await recordEventCoverAction({ clubId, eventId, path });
        if (recorded.ok) {
          setState("done");
          setMessage("圖片已更新。");
          return;
        }
        setState("error");
        setMessage(coverImageError(recorded.reason));
      });
    } catch (error) {
      setState("error");
      setMessage(coverImageError(error instanceof Error ? error.message : "unknown"));
    }
  };

  const remove = () => {
    setMessage(null);
    startTransition(async () => {
      const recorded = await recordEventCoverAction({ clubId, eventId, path: null });
      if (recorded.ok) {
        setState("done");
        setMessage("圖片已移除。");
        return;
      }
      setState("error");
      setMessage(coverImageError(recorded.reason));
    });
  };

  const busy = state === "preparing" || state === "uploading" || pending;

  return <div className={styles.upload}>
    <input
      ref={inputRef}
      type="file"
      accept={COVER_ACCEPTED_TYPES.join(",")}
      className="sr-only"
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) void upload(file);
      }}
    />
    <div className="form-actions">
      <button className="button button-secondary" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
        {state === "preparing" ? "處理圖片中…" : state === "uploading" ? "上傳中…" : hasCover ? "更換圖片" : "上傳圖片"}
      </button>
      {hasCover && <button className="button button-secondary" type="button" disabled={busy} onClick={remove}>
        移除圖片
      </button>}
    </div>
    {message && <p className={state === "error" ? "field-error" : "hint"} role={state === "error" ? "alert" : "status"}>
      {message}
    </p>}
    <p className="hint">圖片只有同社社員看得到；手機上會先縮到長邊 {COVER_MAX_EDGE}px 再上傳。</p>
  </div>;
}
