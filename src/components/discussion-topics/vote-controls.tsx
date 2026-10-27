"use client";

import { useState } from "react";
import { castDiscussionVoteAction } from "@/app/discussion-topic-actions";
import { Button } from "@/components/ui";
import type { DiscussionVoteResult } from "@/lib/discussion-topics/contracts";
import styles from "./topic-detail.module.css";

type VoteOption = { id: string; label: string; voteCount: number };

export function DiscussionVoteControls({
  clubId,
  topicId,
  initialOptions,
  initialVoteCount,
  initialMyVoteOptionId,
}: {
  clubId: string;
  topicId: string;
  initialOptions: readonly VoteOption[];
  initialVoteCount: number;
  initialMyVoteOptionId: string | null;
}) {
  const [options, setOptions] = useState(initialOptions);
  const [voteCount, setVoteCount] = useState(initialVoteCount);
  const [myVoteOptionId, setMyVoteOptionId] = useState(initialMyVoteOptionId);
  const [pending, setPending] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [status, setStatus] = useState("");

  async function castVote(optionId: string) {
    if (pending) return;
    const previous = { options, voteCount, myVoteOptionId };
    const nextOptions = options.map((option) => ({
      ...option,
      voteCount: option.voteCount
        + (option.id === optionId && myVoteOptionId !== optionId ? 1 : 0)
        - (option.id === myVoteOptionId && myVoteOptionId !== optionId ? 1 : 0),
    }));
    setOptions(nextOptions);
    setVoteCount(voteCount + (myVoteOptionId === null ? 1 : 0));
    setMyVoteOptionId(optionId);
    setPending(true);
    setStatus("投票已送出，正在確認…");

    const formData = new FormData();
    formData.set("clubId", clubId);
    formData.set("topicId", topicId);
    formData.set("optionId", optionId);
    try {
      const result = await castDiscussionVoteAction(formData);
      if (!result.ok) {
        if (result.message === "uncertain") {
          setNeedsRefresh(true);
          setStatus("無法確認伺服器結果；畫面先保留暫時選擇，請重新整理核對，不要重複送出相同操作。");
          return;
        }
        setOptions(previous.options);
        setVoteCount(previous.voteCount);
        setMyVoteOptionId(previous.myVoteOptionId);
        setStatus(result.message === "closed"
          ? "議題已截止或目前不在參與對象中，投票沒有送出。"
          : result.message === "invalid_input"
            ? "投票資料不正確，請重新整理後再試。"
            : "投票沒有完成，請確認網路後再試。您的原選擇已恢復。");
        return;
      }
      if (!matchesOptions(result.vote, options)) {
        setNeedsRefresh(true);
        setStatus("投票可能已記錄，但票數資料不一致；畫面保留暫時選擇，請重新整理核對。");
        return;
      }
      const counts = new Map(result.vote.options.map((option) => [option.id, option.voteCount]));
      setOptions((current) => current.map((option) => ({ ...option, voteCount: counts.get(option.id) ?? option.voteCount })));
      setVoteCount(result.vote.voteCount);
      setMyVoteOptionId(result.vote.myVoteOptionId);
      setStatus("投票已記錄；截止前可以再次改票。");
    } catch {
      setNeedsRefresh(true);
      setStatus("連線中斷，無法確認伺服器是否已記錄；畫面保留暫時選擇，請重新整理核對。");
    } finally {
      setPending(false);
    }
  }

  return <>
    <div className={styles.options}>
      {options.map((option) => {
        const selected = myVoteOptionId === option.id;
        return <div className={styles.option} key={option.id}>
          <div className={styles.optionLabel}>
            <strong>{option.label}</strong>
            <span>{option.voteCount} 票</span>
          </div>
          <Button type="button" className={selected ? "button-secondary" : ""}
            disabled={pending || needsRefresh} onClick={() => void castVote(option.id)}>
            {pending && selected ? "送出中…" : selected ? "已選擇，可改票" : "投這一票"}
          </Button>
          {selected && <span className={styles.selected}>您目前選擇</span>}
        </div>;
      })}
    </div>
    <p className={styles.voteStatus} role="status" aria-live="polite">
      {status || `${voteCount} 人已投票`}
    </p>
  </>;
}

function matchesOptions(result: DiscussionVoteResult, options: readonly VoteOption[]) {
  return result.options.length === options.length
    && result.options.every((serverOption) => options.some((option) => option.id === serverOption.id));
}
