import Link from "next/link";

export function ClubAdminNav({ clubId }: { clubId: string }) {
  const encodedClubId = encodeURIComponent(clubId);
  const items = [
    ["身份總覽", `/clubs/${encodedClubId}/identity?mode=management`], ["社員", `/clubs/${encodedClubId}/members?mode=management`],
    ["邀請", `/clubs/${encodedClubId}/invitations?mode=management`], ["LINE Login", `/clubs/${encodedClubId}/line?mode=management`],
    ["LINE OA", `/clubs/${encodedClubId}/line-oa?mode=management`], ["Audit Log", `/clubs/${encodedClubId}/audit?mode=management`],
  ];
  return <nav className="tabs" aria-label="身份管理功能">{items.map(([label, href]) => <Link key={href} href={href} prefetch={false}>{label}</Link>)}</nav>;
}
