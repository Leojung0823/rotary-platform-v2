import { Suspense } from "react";
import { AppShellLoading } from "@/components/app-shell-loading";
import { RoleAwareAppShellBoundary } from "@/components/role-aware-app-shell";
import { requireIdentity } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function AuthenticatedAppShell({ children }: { children: React.ReactNode }) {
  const identity = await requireIdentity();
  return <RoleAwareAppShellBoundary identity={identity}>{children}</RoleAwareAppShellBoundary>;
}

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<AppShellLoading />}>
      <AuthenticatedAppShell>{children}</AuthenticatedAppShell>
    </Suspense>
  );
}
