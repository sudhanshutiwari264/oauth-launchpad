// Every guide's `category` is a short, free-text label the research
// pipeline's LLM wrote for that specific product (e.g. "Note-taking and
// collaboration", "AI Model Gateway") - useful on a guide card, but too
// fragmented to use directly as sidebar filter buckets once there are more
// than a handful of guides. This maps that free text into a small, fixed
// taxonomy by keyword, so the filter sidebar stays a stable, scannable
// list of broad buckets instead of growing one row per guide.

import type { ComponentType } from "react";
import {
  BarChartIcon,
  CardIcon,
  ChatIcon,
  ClipboardIcon,
  CloudIcon,
  CpuIcon,
  DotsIcon,
  GridIcon,
  MegaphoneIcon,
  PenIcon,
  UsersIcon,
  WrenchIcon,
} from "@/components/icons";

export interface CategoryBucket {
  name: string;
  icon: ComponentType<{ className?: string }>;
  keywords: string[];
}

// Checked in order - first keyword match wins, so put more specific
// buckets (e.g. "AI & LLM") before broad catch-alls.
export const CATEGORY_BUCKETS: CategoryBucket[] = [
  {
    name: "AI & LLM",
    icon: CpuIcon,
    keywords: ["ai ", "ai&", "ai-", " ai", "llm", "model gateway", "model infrastructure", "agent", "machine learning"],
  },
  {
    name: "Developer Tools",
    icon: WrenchIcon,
    keywords: ["code", "developer", "api", "hosting", "version control", "issue tracking", "sdk", "infrastructure"],
  },
  {
    name: "Communication",
    icon: ChatIcon,
    keywords: ["communication", "chat", "messaging", "email", "video", "voice"],
  },
  {
    name: "Productivity",
    icon: ClipboardIcon,
    keywords: ["productivity", "note", "docs", "wiki", "task", "collaboration", "workspace", "document"],
  },
  {
    name: "Cloud & Storage",
    icon: CloudIcon,
    keywords: ["storage", "cloud", "file", "drive", "backup"],
  },
  {
    name: "CRM",
    icon: UsersIcon,
    keywords: ["crm", "sales", "customer", "contact management"],
  },
  {
    name: "Design",
    icon: PenIcon,
    keywords: ["design", "prototyp", "creative"],
  },
  {
    name: "Payments",
    icon: CardIcon,
    keywords: ["payment", "billing", "finance", "invoice", "checkout"],
  },
  {
    name: "Analytics",
    icon: BarChartIcon,
    keywords: ["analytics", "metrics", "tracking", "dashboard", "data platform"],
  },
  {
    name: "Marketing",
    icon: MegaphoneIcon,
    keywords: ["marketing", "campaign", "social media", "seo", "automation"],
  },
];

export const OTHER_BUCKET: CategoryBucket = { name: "Other", icon: DotsIcon, keywords: [] };
export const ALL_APPS_BUCKET: CategoryBucket = { name: "All Apps", icon: GridIcon, keywords: [] };

export function bucketForCategory(category: string): CategoryBucket {
  const needle = category.toLowerCase();
  for (const bucket of CATEGORY_BUCKETS) {
    if (bucket.keywords.some((kw) => needle.includes(kw))) return bucket;
  }
  return OTHER_BUCKET;
}
