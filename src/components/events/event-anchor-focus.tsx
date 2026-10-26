"use client";

import { useEffect } from "react";

/** Runs after the authorized streamed card exists, not before Suspense resolves. */
export function EventAnchorFocus({ eventIds }: { eventIds: readonly string[] }) {
  useEffect(() => {
    let frame = 0;
    const reveal = () => {
      const eventId = eventIds.find(id => window.location.hash === `#event-${id}`);
      if (!eventId) return;
      const target = document.getElementById(`event-${eventId}`);
      if (!target) return;
      const fold = target.querySelector<HTMLDetailsElement>("details.event-fold");
      if (fold) fold.open = true;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => target.scrollIntoView({ block: "start", behavior: "instant" }));
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("hashchange", reveal); };
  }, [eventIds]);
  return null;
}
