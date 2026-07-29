export type ProductFeatureStatus = "available" | "developing";

export type ProductFeatureCategory =
  | "社員與身份"
  | "社務與活動"
  | "溝通與內容"
  | "財務與營運"
  | "平台與整合";

export type ProductFeature = {
  slug: string;
  title: string;
  summary: string;
  category: ProductFeatureCategory;
  status: ProductFeatureStatus;
  phase: string;
  href?: string;
};

export const productFeatureCategories: ProductFeatureCategory[] = [
  "社員與身份",
  "社務與活動",
  "溝通與內容",
  "財務與營運",
  "平台與整合",
];

export const productFeatures: ProductFeature[] = [
  {
    slug: "dashboard",
    title: "個人工作台",
    summary: "顯示可管理扶輪社、角色與常用入口。",
    category: "平台與整合",
    status: "available",
    phase: "目前可測試",
    href: "/dashboard",
  },
  {
    slug: "identity-center",
    title: "會員中心",
    summary: "查看個人資料、LINE 綁定狀態、登入裝置、通知與隱私設定。",
    category: "社員與身份",
    status: "available",
    phase: "目前可測試",
    href: "/me",
  },
  {
    slug: "member-directory",
    title: "社員名冊",
    summary: "依扶輪社查看社員、職務與本人允許向同社公開的聯絡資料。",
    category: "社員與身份",
    status: "available",
    phase: "目前可測試",
    href: "/directory",
  },
  {
    slug: "member-profile-editor",
    title: "社員資料維護",
    summary: "社員自行補齊資料與設定公開範圍，秘書依權限維護社籍及職務。",
    category: "社員與身份",
    status: "available",
    phase: "目前可測試",
    href: "/me",
  },
  {
    slug: "invitation-and-login",
    title: "邀請、密碼與 LINE 身份",
    summary: "支援 Email／LINE 邀請、忘記與重設密碼、LINE 綁定、解除、重新綁定及裝置撤銷。",
    category: "社員與身份",
    status: "available",
    phase: "目前可測試",
    href: "/me",
  },
  {
    slug: "events",
    title: "活動與報名",
    summary: "建立、發布與取消活動，社員可回覆參加狀態與攜伴人數。",
    category: "社務與活動",
    status: "available",
    phase: "目前可測試",
    href: "/events",
  },
  {
    slug: "event-checkin",
    title: "活動 QR 簽到",
    summary: "短效 QR、手機掃描、本人簽到、人工補登與撤銷紀錄。",
    category: "社務與活動",
    status: "available",
    phase: "目前可測試",
    href: "/events/checkin",
  },
  {
    slug: "attendance-and-leave",
    title: "出席率、請假與補出席",
    summary: "定義出席分母、公假、請假、補出席與社員趨勢報表。",
    category: "社務與活動",
    status: "developing",
    phase: "V0.8",
  },
  {
    slug: "message-board",
    title: "社內留言板",
    summary: "同社社員可查看與發表貼文，編輯及刪除保留本人權限邊界。",
    category: "溝通與內容",
    status: "available",
    phase: "目前可測試",
    href: "/board",
  },
  {
    slug: "announcements-and-notifications",
    title: "公告與排程通知",
    summary: "公告草稿、發布、LINE／Email 通知、排程與送達紀錄。",
    category: "溝通與內容",
    status: "developing",
    phase: "V0.9",
  },
  {
    slug: "documents",
    title: "社務文件中心",
    summary: "會議紀錄、章程、表單與附件的社別權限、版本及搜尋。",
    category: "溝通與內容",
    status: "developing",
    phase: "V0.9",
  },
  {
    slug: "birthday-and-care",
    title: "生日與關懷",
    summary: "生日提醒、賀卡、歡喜與社員關懷紀錄。",
    category: "溝通與內容",
    status: "developing",
    phase: "V1.0",
  },
  {
    slug: "dues-and-iou",
    title: "社費與 IOU",
    summary: "應收、繳費狀態、代墊、核銷與社員個人查詢。",
    category: "財務與營運",
    status: "developing",
    phase: "V0.9",
  },
  {
    slug: "reports-and-exports",
    title: "報表與匯出",
    summary: "社員、活動、出席與財務資料的 Excel／PDF 匯出。",
    category: "財務與營運",
    status: "developing",
    phase: "V1.0",
  },
  {
    slug: "online-deployment",
    title: "測試站與正式部署",
    summary: "Hosted Supabase、HTTPS 網站、環境變數、migration 與部署 smoke test。",
    category: "平台與整合",
    status: "developing",
    phase: "V0.7",
  },
  {
    slug: "line-rich-menu",
    title: "LINE Rich Menu 與 OA 整合",
    summary: "每社選單、正式 LINE Login、OA 通知與入口配置。",
    category: "平台與整合",
    status: "developing",
    phase: "V1.0",
  },
  {
    slug: "mobile-web-app",
    title: "手機 Web App",
    summary: "安裝至主畫面、離線提示、推播準備與行動版操作優化。",
    category: "平台與整合",
    status: "developing",
    phase: "V1.0",
  },
  {
    slug: "ai-assistant",
    title: "社務 AI 助理",
    summary: "協助摘要、草擬公告、整理會議紀錄與查找授權資料。",
    category: "平台與整合",
    status: "developing",
    phase: "後續版本",
  },
];

export function productFeaturePath(feature: ProductFeature) {
  return feature.href ?? `/features/${feature.slug}`;
}

export function findProductFeature(slug: string) {
  return productFeatures.find((feature) => feature.slug === slug) ?? null;
}
