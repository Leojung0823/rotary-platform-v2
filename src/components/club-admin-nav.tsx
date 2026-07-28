import Link from "next/link";

export function ClubAdminNav({ clubId }: { clubId: string }) {
  const items = [
    ["身份總覽", `/clubs/${clubId}/identity`], ["社員", `/clubs/${clubId}/members`],
    ["邀請", `/clubs/${clubId}/invitations`], ["LINE Login", `/clubs/${clubId}/line`],
    ["LINE OA", `/clubs/${clubId}/line-oa`], ["Audit Log", `/clubs/${clubId}/audit`],
  ];
  return <nav className="tabs" aria-label="身份管理功能">{items.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}</nav>;
}
