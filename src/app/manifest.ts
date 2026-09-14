import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "扶輪管理平台 V2",
    short_name: "扶輪平台",
    description: "扶輪社社員與社務管理平台",
    lang: "zh-Hant",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f3f7fb",
    theme_color: "#0d6eaa",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
