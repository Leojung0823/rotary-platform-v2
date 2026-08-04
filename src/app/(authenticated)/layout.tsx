import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { AppShellLoading } from "@/components/app-shell-loading";
import { requireIdentity } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function AuthenticatedAppShell({ children }: { children: React.ReactNode }) {
  const identity = await requireIdentity();
  return <AppShell identity={identity}>{children}</AppShell>;
}

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<AppShellLoading />}>
      <AuthenticatedAppShell>{children}</AuthenticatedAppShell>
    </Suspense>
  );
}
