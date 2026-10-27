"use client";

import Link from "next/link";
import { useState } from "react";
import { deleteDiscussionTopicAction } from "@/app/discussion-topic-actions";
import { Button } from "@/components/ui";

export function ManagementTopicActions({ clubId, topicId }: { clubId: string; topicId: string }) {
  const [deleting, setDeleting] = useState(false);
  return <div className="form-actions">
    <Link className="button button-secondary"
      href={`/clubs/${encodeURIComponent(clubId)}/topics/${encodeURIComponent(topicId)}/edit?mode=management`}
      prefetch={false}>編輯議題</Link>
    <form action={deleteDiscussionTopicAction} onSubmit={(event) => {
      if (!window.confirm("確定要刪除這個議題嗎？社員將看不到它，投票與留言歷史會保留。")) {
        event.preventDefault();
        return;
      }
      setDeleting(true);
    }}>
      <input type="hidden" name="clubId" value={clubId} />
      <input type="hidden" name="topicId" value={topicId} />
      <Button type="submit" className="button-danger" disabled={deleting}>
        {deleting ? "處理中…" : "刪除議題"}
      </Button>
    </form>
  </div>;
}
