"use client";

import { useEffect, useState, type ComponentProps } from "react";

export function UnsavedChangesForm({ children, onChange, onSubmit, ...props }: ComponentProps<"form">) {
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const warnLinkNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!target || target.target === "_blank" || target.hasAttribute("download")) return;
      const destination = new URL(target.href, window.location.href);
      if (destination.href === window.location.href || (destination.pathname === window.location.pathname && destination.search === window.location.search && destination.hash)) return;
      if (window.confirm("尚有未儲存的修改，確定要離開這個頁面嗎？")) {
        setDirty(false);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", warnLinkNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", warnLinkNavigation, true);
    };
  }, [dirty]);
  return <form {...props} onChange={(event) => { setDirty(true); onChange?.(event); }} onSubmit={(event) => { setDirty(false); onSubmit?.(event); }}>{children}</form>;
}
