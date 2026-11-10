export const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export type Sentiment = "liked" | "fine" | "disliked";
export type Rank = {
  place_id: number; category: string; sentiment: Sentiment;
  value: number; score: number; category_position: number;
};
export type Place = {
  id: number; name: string; category: string; area: string; city: string;
  price: number; cuisines: string[]; average_score: number; icon: string;
  color: string; bookmarked?: boolean; rank?: Rank | null;
};
export type RankedPlace = Place & Rank & { position: number };
export type Rec = Place & {
  expected_percentile: number; score_source: "local_heuristic";
  reasons: string[]; is_ranked: boolean;
};
export type Stats = {
  count: number; city_count: number; by_category: Record<string,number>;
  milestones: Array<{ threshold:number; title:string; unlocked:boolean }>;
  next_milestone: number | null;
};
export type DraftState = {
  status: "comparison" | "no_candidates";
  draft_id:string; place:Place; compare_with:Place | null;
  remaining_candidates:number; can_undo:boolean;
  category:string; sentiment:Sentiment;
};
export type RankCompleted = {
  status:"completed"; place_id:number; category:string; sentiment:Sentiment;
  value:number; total_ranked:number; milestone_unlocked:boolean; approximate?:boolean;
};
export type RankResponse = DraftState | RankCompleted;
export const CATEGORIES = ["All", "Restaurants", "Coffee & Tea", "Bars", "Bakeries", "Ice Cream & Dessert"];
export const CATEGORY_LABELS: Record<string,string> = {
  All:"전체", Restaurants:"레스토랑", "Coffee & Tea":"카페·티", Bars:"바",
  Bakeries:"베이커리", "Ice Cream & Dessert":"디저트"
};
export const SENTIMENT_LABELS: Record<Sentiment,string> = {
  liked:"좋았어요", fine:"괜찮았어요", disliked:"아쉬웠어요"
};

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(API_URL + path, {
    ...init,
    headers: {"Content-Type":"application/json",...init?.headers},
    cache:"no-store"
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({detail:`HTTP ${response.status}`}));
    throw new Error(typeof error.detail === "string" ? error.detail : JSON.stringify(error.detail));
  }
  return response.json() as Promise<T>;
}
export const post = <T,>(path:string, body?:unknown) => api<T>(path,{method:"POST",body:body===undefined?undefined:JSON.stringify(body)});
