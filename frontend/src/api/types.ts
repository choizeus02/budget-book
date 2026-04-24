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
  category_confirmed: boolean;
  type: TransactionType;
  date: string;
  created_at: string;
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

export const CATEGORIES = [
  "식비", "카페/음료", "교통", "쇼핑", "문화/여가",
  "의료", "통신", "구독", "주거", "교육", "기타",
] as const;

export const CATEGORY_ICONS: Record<string, string> = {
  "식비": "🍚",
  "카페/음료": "☕",
  "교통": "🚇",
  "쇼핑": "🛍️",
  "문화/여가": "🎬",
  "의료": "🏥",
  "통신": "📱",
  "구독": "📺",
  "주거": "🏠",
  "교육": "📚",
  "기타": "📌",
};
