export const SERVICE_PLAN_CATEGORIES = [
  {
    key: "membership",
    label: "社員服務",
    description: "凝聚社員、關懷彼此，讓每位社友都找到參與的位置。",
    prompt: "例如：新會員融入、社員關懷、聯誼活動與領導人才培養。",
  },
  {
    key: "vocational",
    label: "職業服務",
    description: "用專業互相學習，也把職業道德與經驗帶進社會。",
    prompt: "例如：職業分享、職業道德、青年職涯與專業服務。",
  },
  {
    key: "community",
    label: "社區服務",
    description: "從在地需要出發，和社區夥伴一起完成看得見的改變。",
    prompt: "例如：弱勢關懷、環境保護、教育支持與公益合作。",
  },
  {
    key: "international",
    label: "國際服務",
    description: "透過交流與人道行動，連結世界、促進和平與理解。",
    prompt: "例如：國際交流、全球獎助、人道援助與跨國合作。",
  },
] as const;

export type ServicePlanCategoryKey = typeof SERVICE_PLAN_CATEGORIES[number]["key"];
export type ServicePlanProgressStatus = "planned" | "in_progress" | "completed";

export type ServicePlanSection = Readonly<{
  category_key: ServicePlanCategoryKey;
  progress_status: ServicePlanProgressStatus;
  annual_goal: string;
  activities: string;
  latest_result: string;
  next_step: string;
  member_participation: string;
  updated_at?: string;
}>;

export type ServicePlan = Readonly<{
  title: string;
  body: string;
  annual_theme: string;
  member_invitation: string;
  plan_status: "draft" | "published";
  published_at: string | null;
  updated_at: string;
  sections: readonly ServicePlanSection[];
}>;

export const SERVICE_PLAN_STATUS_LABELS: Readonly<Record<ServicePlanProgressStatus, string>> = {
  planned: "規劃中",
  in_progress: "進行中",
  completed: "已完成",
};

export function emptyServicePlanSection(categoryKey: ServicePlanCategoryKey): ServicePlanSection {
  return {
    category_key: categoryKey,
    progress_status: "planned",
    annual_goal: "",
    activities: "",
    latest_result: "",
    next_step: "",
    member_participation: "",
  };
}

export function servicePlanSections(sections: readonly ServicePlanSection[] | null | undefined) {
  return SERVICE_PLAN_CATEGORIES.map(({ key }) => sections?.find((section) => section.category_key === key)
    ?? emptyServicePlanSection(key));
}
