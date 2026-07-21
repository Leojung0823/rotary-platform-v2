import { AppShell } from "@/components/app-shell";
import { requireIdentity } from "@/lib/auth";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const identity = await requireIdentity();
  return <AppShell identity={identity}>{children}</AppShell>;
}
