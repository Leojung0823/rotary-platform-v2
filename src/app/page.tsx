import LoginPage from "@/app/login/page";

export const dynamic = "force-dynamic";

export default function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; returnTo?: string }>;
}) {
  return <LoginPage searchParams={searchParams} />;
}
