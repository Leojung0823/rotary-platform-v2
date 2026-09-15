"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { applyMemberTagToSelectionAction } from "@/app/tag-actions";
import { Button, Select } from "@/components/ui";
import styles from "./member-tag-batch-form.module.css";

export type BatchTagOption = { tag_id: string; tag_name: string };

/**
 * Wraps the roster so the checkboxes in it and the tag picker above it are one
 * submission. The rows stay server-rendered and are passed through as children;
 * the only thing this needs a browser for is counting what is ticked and
 * offering "select all", both of which are just feedback -- the form still
 * posts the same selection with scripting off.
 */
export function MemberTagBatchForm({
  clubId,
  tags,
  children,
}: {
  clubId: string;
  tags: readonly BatchTagOption[];
  children: ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [selected, setSelected] = useState(0);

  const boxes = useCallback(
    () => Array.from(
      formRef.current?.querySelectorAll<HTMLInputElement>('input[name="membershipIds"]') ?? [],
    ),
    [],
  );

  const recount = useCallback(() => {
    setSelected(boxes().filter((box) => box.checked).length);
  }, [boxes]);

  const setAll = useCallback((checked: boolean) => {
    for (const box of boxes()) box.checked = checked;
    recount();
  }, [boxes, recount]);

  if (tags.length === 0) return <>{children}</>;

  return <form action={applyMemberTagToSelectionAction} className={styles.form} onChange={recount} ref={formRef}>
    <input type="hidden" name="clubId" value={clubId} />
    <div className={styles.bar}>
      <div className={styles.selection}>
        <strong>{selected > 0 ? `已選 ${selected} 位` : "勾選社員後貼標籤"}</strong>
        <button className="button button-secondary" onClick={() => setAll(true)} type="button">全選</button>
        <button className="button button-secondary" onClick={() => setAll(false)} type="button">清除</button>
      </div>
      <div className={styles.apply}>
        <Select aria-label="要套用的標籤" name="tagId" required>
          {tags.map((tag) => <option key={tag.tag_id} value={tag.tag_id}>{tag.tag_name}</option>)}
        </Select>
        <Button name="mode" type="submit" value="assign">貼上標籤</Button>
        <Button className="button-secondary" name="mode" type="submit" value="remove">移除標籤</Button>
      </div>
    </div>
    {children}
  </form>;
}
