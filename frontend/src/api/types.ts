export type AccountType = "cash" | "checking" | "savings" | "credit";
export type TransactionType = "income" | "expense";

export interface Account {
  id: number;
  name: string;
  type: AccountType;
  balance: number;
  color: string;
  icon: string;
  created_at: string;
}

export interface Transaction {
  id: number;
  account_id: number | null;
  amount: number;
  description: string;
  category: string | null;
  subcategory: string | null;
  category_confirmed: boolean;
  type: TransactionType;
  date: string;
  created_at: string;
  updated_at: string;
}

export interface Budget {
  id: number;
  category: string;
  monthly_amount: number;
  created_at: string;
}

export interface MonthlySummary {
  year: number;
  month: number;
  total_income: number;
  total_expense: number;
  net: number;
}

export interface CategoryStat {
  category: string;
  total: number;
  count: number;
  budget: number | null;
}

export const CATEGORY_MAP: Record<string, string[]> = {
  "식비":     ["식당", "카페", "마트", "배달", "식단"],
  "교통":     ["대중교통", "택시", "주유", "주차"],
  "쇼핑":     ["의류", "생활용품", "전자기기"],
  "문화/여가": ["영화", "공연", "여행", "게임", "인앱결제"],
  "의료":     ["병원", "약국"],
  "건강":     ["운동", "영양제"],
  "통신/구독": ["통신비", "OTT", "소프트웨어"],
  "주거":     ["월세/관리비", "가전", "인테리어"],
  "교육":     ["학원", "도서", "온라인강의", "자기개발"],
  "기타":     ["기타"],
};

export const CATEGORY_ICONS: Record<string, string> = {
  "식비":     "🍚",
  "교통":     "🚇",
  "쇼핑":     "🛍️",
  "문화/여가": "🎬",
  "의료":     "🏥",
  "건강":     "💪",
  "통신/구독": "📱",
  "주거":     "🏠",
  "교육":     "📚",
  "기타":     "📌",
};
