# Rotary Platform V2

扶輪社多社管理平台 V2。現有 Lovable 系統持續運作；本專案在獨立 staging 環境逐步重建應用層。

## 技術基礎

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase Auth / PostgreSQL
- GitHub Actions

## 本機啟動

```bash
npm install
cp .env.example .env.local
npm run dev
```

尚未建立 staging Supabase 專案時，可以先啟動首頁；Supabase client 只有在被呼叫時才要求環境變數。

## 品質檢查

```bash
npm run lint
npm run typecheck
npm run build
```

## 第一個垂直功能

1. 平台管理員建立扶輪社。
2. 系統建立第一位執行秘書邀請。
3. 執行秘書以自己的帳號接受邀請。
4. 系統授予該社管理權限。
5. 扶輪社由 provisioning 轉為 active。

更多決策請見 `docs/architecture/core-decisions.md`。
