"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { PortalIcon } from "./portal-icons";
import styles from "./notification-bell.module.css";

/**
 * The bell opens what it is about, in place.
 *
 * It used to be a link to the message centre, which meant leaving the home page
 * to find out whether anything was waiting -- and coming back if it was not.
 * The panel's contents are rendered on the server and passed through as
 * children, so opening it costs no request.
 */
export function NotificationBell({
  messagesHref,
  children,
}: {
  messagesHref: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      // Escape returns you to where you were, which is the bell.
      button.current?.focus();
    }
    function onPointerDown(event: PointerEvent) {
      if (wrapper.current?.contains(event.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return <div className={styles.wrapper} ref={wrapper}>
    <button
      aria-controls={panelId}
      aria-expanded={open}
      aria-label="社內訊息"
      className={styles.bell}
      onClick={() => setOpen((was) => !was)}
      ref={button}
      type="button"
    >
      <PortalIcon name="bell" size={21} />
    </button>

    {/* Rendered whether or not it is open, and hidden with the `hidden`
        attribute: the contents come from the server with the page, so the
        first open has nothing to wait for. */}
    <div aria-label="社內訊息" className={styles.panel} hidden={!open} id={panelId} role="dialog">
      <div className={styles.panelHead}>
        <strong>社內訊息</strong>
        <a className={styles.panelAll} href={messagesHref}>開啟訊息中心 →</a>
      </div>
      {children}
    </div>
  </div>;
}
