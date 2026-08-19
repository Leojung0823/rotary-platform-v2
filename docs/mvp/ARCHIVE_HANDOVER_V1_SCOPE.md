# 文件中心與年度交接 V1

## 完整流程

1. 社長、秘書或有效社務管理者建立 7 月 1 日起算的扶輪年度。
2. 系統建立六項必要交接清單，並提示缺少可下載版本的分類。
3. 幹部建立文件項目，設定資料夾、標籤與「社內／僅幹部」保密級別。
4. 每次上傳都建立新版本；舊版本不能被覆蓋或硬刪除。
5. 檔案放在私有 Supabase Storage bucket，下載前由 RPC 再次驗證登入、`club_id` 與保密級別，只發 60 秒 signed URL。
6. 幹部把清單連到文件，標記已備妥、已確認或需補件。
7. 必要項目全部確認後，由兩個不同帳號分別做「卸任幹部」與「新任幹部」具名確認，狀態才成為已交接。
8. 社員可搜尋有權查看的歷屆文件並匯出 CSV 清冊；系統稽核下載、版本、封存、清冊與交接動作。

## 安全與隱私

- 所有業務表有 `club_id` 並禁止 `anon`／`authenticated` 直接讀寫。
- 一般社員只能讀同社、`club_internal` 且未封存的項目。
- `officers_only` 只投影給具有效社務權限的人。
- Storage bucket 永遠是 private；沒有任何瀏覽器直讀 policy。
- 上傳限制 10 MB，僅接受 PDF、DOCX、XLSX、PPTX、JPG、PNG、TXT，不接受 HTML/SVG。
- 檔名只做下載顯示；Storage object path 全由資料庫用 UUID 建立。
- Supabase 原始錯誤、object path、service role key 不會回到一般畫面。

## 不在本 PR

- 大型 ZIP 批次工作；V1 先提供 CSV manifest 與逐檔下載。
- OCR、全文解析、AI 摘要。
- 對外公開網站或跨社分享。
- Hosted Supabase migration、部署或真實社員資料搬移。
