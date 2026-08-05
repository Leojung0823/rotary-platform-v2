/* eslint-disable @next/next/no-img-element -- avatar origins include the current Supabase project and verified LINE provider URLs. */

export function AvatarPhoto({ src, alt = "" }: { src: string; alt?: string }) {
  return <img src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" />;
}
