# 安全與扶輪社建置設計

## 信任邊界

瀏覽器只持有 Supabase publishable/anon key 與使用者 session。service-role key 僅供本機 bootstrap 及 Next.js server action 寄送 Supabase Auth 邀請，且兩個入口都拒絕非本機 URL。應用不把原始 Supabase 錯誤、invite token、Auth secret 或私人社友資料回傳到 UI。

資料表沒有授予 `anon` 或 `authenticated` 直接 CRUD。所有應用讀寫透過明確授權的 `security definer` RPC；helper RPC 不授權給 client roles。每個 privileged function 固定 `search_path` 並 schema-qualify 資料表。

## 授權

- `resolve_current_app_account`：依 `auth.uid()` 回傳自己的 app account 與有效平台角色；後台版面另外拒絕非 `active` 帳號。
- `list_manageable_clubs`：platform admin 可見全部；社級 operator 只見有效 assignment 對應的社。
- `create_club_with_initial_operator_invitation`：只允許 active superadmin。
- `list_club_operators_and_invitations`、`invite_additional_operator`、`revoke_operator`：每次用傳入 `club_id` 檢查 caller 的有效社級 manager assignment 或平台角色。
- `list_current_operator_invitations`：只列出寄到目前已驗證 Auth 信箱、尚未過期的邀請；未驗證信箱及既有停權／停用帳號一律拒絕。
- `accept_selected_operator_invitation`：要求 caller 明確提交 invitation ID，並再次比對目前已驗證 Auth 信箱。瀏覽器不再具有舊版 nullable `accept_operator_invitation` 的執行權限，避免同一信箱存在多筆邀請時接受錯誤社別。
- `get_club_provisioning_status`：限平台管理員、該社 operator，或信箱匹配且未過期的受邀者。

`last_active_club_id` 未納入此版本；未來若加入也只能作 UX 偏好，不能作授權依據。

## 冪等與一致性

建立扶輪社與建立邀請使用唯一 `idempotency_key`。接受已由同一 Auth account 完成的指定邀請會回傳既有 permission。partial unique indexes 防止同社重複有效 membership、同帳號同社重複有效 operator assignment，以及同社同信箱重複 open invite。

member/operator 全域互斥透過兩個 trigger 與 person-scoped advisory transaction lock 保護，涵蓋兩個寫入方向及 concurrent transactions。撤銷保留 permission row，邀請接受及社啟用在同一 transaction 中完成。

到期的 operator assignment 會在授權判斷、有效人數統計、社員／operator 互斥及重新指派流程中一致視為無效；重新指派前會先將自然到期的舊 assignment 正規化為 `expired`。

## 稽核

扶輪社建立、邀請建立/寄出/接受、operator 撤銷及自然到期正規化都新增 `audit_logs`。應用角色沒有 audit table 的 UPDATE 或 DELETE 權限，因此 log 對 client 是 append-only；service role 與資料庫 owner 仍屬本機受信任維運邊界。

## 驗證範圍

`supabase/verification/provisioning_security.sql` 在 rollback transaction 內建立多個 Auth identity 與兩個社，證明：anonymous denial、ordinary user denial、跨社 read/write denial、多 operator、雙向身份互斥、同社 membership 唯一性、跨社 membership 合法、last-operator 保護、指定邀請接受冪等與 audit rows。

`supabase/verification/operator_expiry_consistency.sql` 驗證：自然到期的 assignment 不再授權、到期 operator 可轉為社員、重新指派會清理舊 assignment、有效 operator 統計排除到期資料，以及最後一位真正有效 operator 仍受撤銷保護。

`supabase/verification/invitation_selection.sql` 驗證：同一信箱可列出多社邀請、必須明確選擇 invitation ID、未選社別不會被授權、舊版模糊接受入口不可由瀏覽器角色執行、重複接受維持冪等，以及未驗證信箱與停權帳號不能列舉邀請。

## 合併後重新驗證

PR #2 已於 2026-07-28 以一般 merge commit 合併至 `main`。PR #5 隨後改以 `main` 為 base，並以 GitHub Actions 重新執行 application lint、typecheck、unit tests、production build、migration reset、database lint 與全部 SQL verification。失敗的 database verification 會保存精簡 artifact，便於直接定位錯誤。
