import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  if (process.env.APP_ENV !== "production") {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  return { rules: [{ userAgent: "*", allow: "/" }] };
}
