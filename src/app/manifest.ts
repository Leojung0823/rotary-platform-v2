import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "我是扶輪人",
    short_name: "我是扶輪人",
    description: "扶輪社社員與社務管理平台",
    lang: "zh-Hant",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f3f7fb",
    theme_color: "#0d6eaa",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
