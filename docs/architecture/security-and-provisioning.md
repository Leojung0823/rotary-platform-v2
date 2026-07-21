# 安全與扶輪社建置設計

## 信任邊界

瀏覽器只持有 Supabase publishable/anon key 與使用者 session。service-role key 僅供本機 bootstrap 及 Next.js server action 寄送 Supabase Auth 邀請，且兩個入口都拒絕非本機 URL。應用不把原始 Supabase 錯誤、invite token、Auth secret 或私人社友資料回傳到 UI。

資料表沒有授予 `anon` 或 `authenticated` 直接 CRUD。所有應用讀寫透過明確授權的 `security definer` RPC；helper RPC 不授權給 client roles。每個 privileged function 固定 `search_path` 並 schema-qualify 資料表。

## 授權

- `resolve_current_app_account`：依 `auth.uid()` 回傳自己的 app account 與有效平台角色。
- `list_manageable_clubs`：platform admin 可見全部；社級 operator 只見有效 assignment 對應的社。
- `create_club_with_initial_operator_invitation`：只允許 active superadmin。
- `list_club_operators_and_invitations`、`invite_additional_operator`、`revoke_operator`：每次用傳入 `club_id` 檢查 caller 的有效社級 manager assignment 或平台角色。
- `accept_operator_invitation`：不接受 caller account id 或 email；兩者都由目前 Auth user 推導，並鎖定匹配邀請。
- `get_club_provisioning_status`：限平台管理員、該社 operator，或信箱匹配且未過期的受邀者。

`last_active_club_id` 未納入此版本；未來若加入也只能作 UX 偏好，不能作授權依據。

## 冪等與一致性

建立扶輪社與建立邀請使用唯一 `idempotency_key`。接受已由同一 Auth account 完成的邀請會回傳既有 permission。partial unique indexes 防止同社重複有效 membership、同帳號同社重複有效 operator assignment，以及同社同信箱重複 open invite。

member/operator 全域互斥透過兩個 trigger 與 person-scoped advisory transaction lock 保護，涵蓋兩個寫入方向及 concurrent transactions。撤銷保留 permission row，邀請接受及社啟用在同一 transaction 中完成。

## 稽核

扶輪社建立、邀請建立/寄出/接受、operator 撤銷都新增 `audit_logs`。應用角色沒有 audit table 的 UPDATE 或 DELETE 權限，因此 log 對 client 是 append-only；service role 與資料庫 owner 仍屬本機受信任維運邊界。

## 驗證範圍

`supabase/verification/provisioning_security.sql` 在 rollback transaction 內建立多個 Auth identity 與兩個社，證明：anonymous denial、ordinary user denial、跨社 read/write denial、多 operator、雙向身份互斥、同社 membership 唯一性、跨社 membership 合法、last-operator 保護、接受冪等與 audit rows。
