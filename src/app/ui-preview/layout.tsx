import type { ReactNode } from "react";

// The preview renders the portal chrome itself, so it must not be wrapped in
// the application shell.
export default function UiPreviewLayout({ children }: { children: ReactNode }) {
  return children;
}
