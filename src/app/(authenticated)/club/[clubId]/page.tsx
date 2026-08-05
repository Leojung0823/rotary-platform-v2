import { redirect } from "next/navigation";

export default async function LegacyClubHome({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params;
  redirect(`/dashboard?clubId=${encodeURIComponent(clubId)}`);
}
