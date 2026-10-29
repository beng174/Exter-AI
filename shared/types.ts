export type Platform = "Meta" | "TikTok" | "Google";
export type Category =
  | "Beauty & skincare"
  | "Fashion"
  | "Wellness"
  | "Food & beverage";
export type Page =
  | "overview"
  | "ads"
  | "competitors"
  | "audiences"
  | "creators"
  | "reports"
  | "sources";
export interface Brand {
  id: string;
  name: string;
  domain: string;
  category: Category;
  color: string;
  initials: string;
  voice: string[];
  competitors: string[];
  mode: "demo" | "imported";
  createdAt: string;
}
export interface Ad {
  id: string;
  brandId: string;
  brand: string;
  platform: Platform;
  category: Category;
  title: string;
  copy: string;
  angle: string;
  audience: string;
  format: string;
  image: string;
  color: string;
  active: boolean;
  publishedAt: string;
  impressions: number;
  engagements: number;
  spend: number | null;
  conversions: number | null;
  revenue: number | null;
  owned: boolean;
  source: "sample" | "import";
  sourceUrl: string | null;
}
export interface Creator {
  id: string;
  name: string;
  handle: string;
  category: Category;
  platforms: Platform[];
  followers: number;
  engagementRate: number;
  audience: string;
  voice: string[];
  match: number;
  image: string;
  color: string;
  location: string;
  reason: string;
}
export interface Review {
  id: string;
  brandId: string;
  author: string;
  rating: number;
  text: string;
  theme: string;
  sentiment: "positive" | "neutral" | "negative";
  source: string;
}
export interface Report {
  id: string;
  brandId: string;
  title: string;
  createdAt: string;
  content: string;
  mode: string;
}
export interface Filters {
  platform: string;
  range: string;
  search: string;
}
export interface Metrics {
  ads: number;
  brands: number;
  impressions: number;
  engagements: number;
  engagementRate: number;
  creators: number;
  conversions: number | null;
  spend: number | null;
}
export interface Angle {
  name: string;
  ads: number;
  engagements: number;
  impressions: number;
  engagementRate: number;
  share: number;
  conversions: number | null;
  cpa: number | null;
}
export interface Competitor {
  name: string;
  color: string;
  initials: string;
  ads: number;
  engagementRate: number;
  share: number;
  topAngle: string;
  owned: boolean;
}
export interface TrendPoint {
  date: string;
  label: string;
  brand: number;
  competitors: number;
}
export interface Dashboard {
  brand: Brand;
  metrics: Metrics;
  angles: Angle[];
  audiencePerformance?: Angle[];
  competitors: Competitor[];
  trend: TrendPoint[];
  ads: Ad[];
  creators: Creator[];
  reviews: Review[];
  updatedAt: string;
  mode: "demo" | "imported";
  sampleCount: number;
  insights: { title: string; text: string; kind: string }[];
}
export interface AdResult {
  items: Ad[];
  total: number;
  page: number;
  pages: number;
}
