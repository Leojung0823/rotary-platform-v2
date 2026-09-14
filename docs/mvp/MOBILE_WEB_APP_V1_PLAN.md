# 手機 Web App V1 企劃書

更新日期：2026-09-14（Asia/Taipei）

## 1. 目的

讓社員可以把 Rotary Platform V2 加到手機主畫面，在網路不穩時看到清楚、
不洩漏資料的離線提示，並為日後的推播與行動版操作保留安全基礎。

## 2. 本輪範圍

- 提供 Web App manifest、平台圖示與可安裝的 standalone 設定。
- 在正式 build 才註冊 service worker；註冊失敗不能阻擋登入或首頁顯示。
- 只快取公開的靜態檔、版本化的 Next 靜態資源與離線提示頁。
- 導覽請求採 network-first；沒有網路時只顯示離線安全提示。
- 加入自動化邊界測試，防止日後把登入後 HTML、API 或 Cookie 放進快取。

## 3. 明確不做

- 不快取登入狀態、Cookie、角色、權限、社員名單、社團資料或 API 回應。
- 不讓離線狀態瀏覽登入後畫面，也不在本機保存填寫中的個人資料。
- 本輪不處理 Web Push、原生 iOS／Android App、背景同步或離線寫入。
- 不新增資料庫結構、不修改 Supabase 權限、不修改正式環境設定。

## 4. 安全規則

1. service worker 只接受同源 GET 請求。
2. cache allow-list 僅包含 `/offline.html`、manifest、圖示、`/_next/static/`
   與公開 `/icons/` 資源。
3. 導覽失敗只回傳沒有個人資料的 `/offline.html`，不回傳舊的 authenticated HTML。
4. service worker 使用 `Cache-Control: no-cache`，讓新版本的快取規則能及時生效。
5. 公開 app-shell 資源可短時間瀏覽器快取；一般路由與 API 維持既有安全標頭，
   不設公開快取。

## 5. 驗收條件

- `manifest.webmanifest` 可被瀏覽器讀取，名稱、圖示、scope 與 start URL 正確。
- 正式 build 的 `/login` 能註冊 service worker；註冊失敗時登入頁仍正常顯示。
- 有網路時 `/dashboard` 仍由伺服器正常取得，不能由 service worker 供應舊畫面。
- 模擬離線導覽時顯示「目前沒有網路」，且不出現任何登入後個人內容。
- 邊界單元測試、typecheck、lint、unit tests、build、migration check 與
  verification manifest check 通過。
- iOS／Android 安裝與真機行為另列外部驗收，不在本 PR 宣稱完成。

## 6. 交付狀態

本文件對應 `codex/pwa-v1` 開發分支。程式完成後仍須經 PR review、合併、
staging 發布與手機實機驗收，才能把產品項目從 developing 改成 available。
