"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function LoginSessionRedirect({ returnTo }: { returnTo: string }) {
  const router = useRouter();

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/auth/line/session", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() as Promise<{ authenticated?: boolean }> : null)
      .then((session) => {
        if (session?.authenticated) router.replace(returnTo);
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, [returnTo, router]);

  return null;
}
